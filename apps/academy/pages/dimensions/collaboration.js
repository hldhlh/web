(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const auth = window.AcademyAuth, store = window.AcademyStore, cfg = window.ACADEMY_CONFIG;
  const actor = auth.session && { id: auth.session.id, name: auth.session.name };
  const prefix = 'doc:dimensions:';
  let session = null, projectChannel = null, catalogChannel = null, stopped = false;
  let timer, retryTimer, pollTimer, opening = false, connected = false, listLoading = false;
  let projects = [], nextOffset = 0, listAgain = false, catalogConnected = false;
  const editor = window.DimensionEditor;
  const allowed = () => !stopped && actor && auth.session?.id === actor.id && auth.canShortcut(auth.session, 'dimensions');
  const ensureAllowed = () => { if (!allowed()) throw new Error('请通过 Auto Office 登录并开通尺寸标注权限'); };
  const request = (url, init) => window.APP_NETWORK?.request ? window.APP_NETWORK.request(url, init) : fetch(url, init);
  const table = cfg.table || 'academy_progress';
  const urlFor = params => {
    const url = new URL(`${store.origin()}/rest/v1/${table}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    return url;
  };
  async function rest(params, init = {}) {
    ensureAllowed();
    const response = await request(urlFor(params).toString(), {
      ...init, cache: 'no-store', headers: store.headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' })
    });
    if (response.status === 409) return null;
    if (!response.ok) throw new Error(`云端请求失败（${response.status}），请重试`);
    return response.json();
  }
  const transport = {
    async read(id) {
      const rows = await rest({ user_id: `eq.${id}`, select: 'user_id,payload,ts,updated_at' });
      if (!rows?.[0]?.payload?.annotations) throw new Error('共享项目不存在或无权访问');
      return rows[0];
    },
    async cas(row, payload) {
      const ts = Math.max(Date.now(), row.ts + 1);
      const rows = await rest({ user_id: `eq.${row.user_id}`, ts: `eq.${row.ts}` }, {
        method: 'PATCH', body: JSON.stringify({ payload, ts, updated_at: new Date().toISOString() })
      });
      if (rows?.[0]) catalogChannel?.send({ type: 'broadcast', event: 'changed', payload: { id: payload.meta.id } }).catch(() => {});
      return rows?.[0] || null;
    }
  };
  function status(message) { $('syncStatus').textContent = message; }
  function reportError(error) { status(error.message || String(error)); $('retryButton').hidden = false; }
  function schedule(delay = 450) {
    clearTimeout(timer);
    if (stopped) return;
    timer = setTimeout(async () => {
      if (!session || !allowed()) return;
      if (editor.busy()) { schedule(); return; }
      await session.flush();
      if (session.dirty && !session.conflicts.size) schedule(session.error ? 5000 : 450);
    }, delay);
  }
  function update(model) {
    if (stopped || model !== session) return;
    editor.applyAnnotations(model.view());
    $('conflictPanel').hidden = model.conflicts.size === 0;
    $('retryButton').hidden = !model.error && !model.cacheError && connected;
    status(model.cacheError || (model.conflicts.size ? `${model.conflicts.size} 条标注需要处理冲突` :
      model.error ? `修改已保留在本机 · ${model.error}` :
      model.saving ? '正在保存团队标注…' : model.dirty ? '修改已保留在本机 · 等待同步' :
      connected ? '已保存至云端 · 实时协作中' : '已保存至云端 · 正在恢复实时连接'));
    const meta = model.row.payload.meta;
    $('projectTitle').textContent = meta.name;
    $('projectAuthor').textContent = `制作：${meta.createdBy.name} · 最近修改：${meta.updatedBy.name}`;
    $('exportImage').title = model.dirty ? '导出包含尚未同步的本机修改' : '导出标注图';
  }
  function makeClient() {
    return window.supabase.createClient(window.APP_NETWORK?.projectOrigin || cfg.url, cfg.key, {
      appNetworkRealtimeDirect: true, auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 10 } }
    });
  }
  const sb = makeClient();
  let currentRead = null;
  async function refreshCurrent() {
    if (currentRead) return;
    const current = session;
    if (!current || !allowed()) return;
    try {
      currentRead = transport.read(current.row.user_id);
      const row = await currentRead;
      if (session === current && !stopped) { current.receive(row); if (current.dirty) schedule(0); }
    } catch (error) { if (session === current) reportError(error); }
    finally { currentRead = null; }
  }
  function subscribeProject() {
    clearTimeout(retryTimer);
    if (projectChannel) { sb.removeChannel(projectChannel); projectChannel = null; }
    if (!session || !allowed()) return;
    const id = session.row.user_id;
    const channel = sb.channel(`dimensions:${id}`, { config: { presence: { key: actor.id } } });
    projectChannel = channel;
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: `user_id=eq.${id}` }, event => {
      if (channel !== projectChannel || !allowed()) return;
      if (event.new?.payload?.annotations) session.receive(event.new);
    }).on('presence', { event: 'sync' }, () => {
      if (channel !== projectChannel) return;
      const names = [...new Set(Object.values(channel.presenceState()).flat().map(value => value.name).filter(Boolean))];
      $('presenceStatus').textContent = names.length ? `${names.length} 人在线 · ${names.join('、')}` : '';
    }).subscribe(state => {
      if (channel !== projectChannel || !allowed()) return;
      connected = state === 'SUBSCRIBED';
      update(session);
      if (connected) { channel.track({ name: actor.name }).catch(() => {}); refreshCurrent(); }
      else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(state)) {
        clearTimeout(retryTimer); retryTimer = setTimeout(subscribeProject, 5000);
      }
    });
  }
  function openCatalogChannel() {
    catalogChannel = sb.channel('dimensions-catalog');
    catalogChannel.on('broadcast', { event: 'changed' }, () => { if (!session) loadProjects(); })
      .subscribe(state => {
        catalogConnected = state === 'SUBSCRIBED';
        if (catalogConnected && !session) loadProjects();
      });
  }
  function renderLibrary() {
    const query = $('projectSearch').value.trim().toLocaleLowerCase();
    const items = projects.filter(meta => (!$('onlyMine').checked || meta.createdBy.id === actor.id) &&
      `${meta.name} ${meta.createdBy.name}`.toLocaleLowerCase().includes(query));
    $('projectList').replaceChildren();
    for (const meta of items) {
      const button = document.createElement('button');
      button.className = 'project-card';
      const icon = document.createElement('span'); icon.className = 'project-symbol'; icon.textContent = '↔'; icon.setAttribute('aria-hidden', 'true');
      const name = document.createElement('strong'); name.textContent = meta.name;
      const author = document.createElement('span'); author.textContent = `制作：${meta.createdBy.name}`;
      const detail = document.createElement('small'); detail.textContent = `${meta.count || 0} 条标注 · ${new Date(meta.updatedAt).toLocaleDateString('zh-CN')}`;
      button.append(icon, name, author, detail);
      button.addEventListener('click', () => open(meta.id).catch(reportError));
      $('projectList').append(button);
    }
    $('libraryMessage').textContent = items.length ? `${items.length} 个共享项目` : query || $('onlyMine').checked ? '当前已加载项目中没有匹配结果' : '还没有共享标注。新建一张图片，和同事一起开始。';
  }
  async function loadProjects(more = false) {
    if (!allowed()) return;
    if (listLoading) { if (!more) listAgain = true; return; }
    listLoading = true;
    try {
      // Project summaries exclude the annotation payload; paginate large libraries.
      const rows = await rest({ user_id: `like.${prefix}*`, select: 'meta:payload->meta', order: 'updated_at.desc,user_id.asc', limit: 100, offset: more ? nextOffset : 0 });
      const data = rows.map(row => row.meta).filter(meta => meta?.id && meta.createdBy);
      projects = [...new Map((more ? [...projects, ...data] : data).map(meta => [meta.id, meta])).values()];
      nextOffset = (more ? nextOffset : 0) + rows.length;
      $('moreProjects').hidden = rows.length < 100;
      renderLibrary();
      if (!session) { status(catalogConnected ? `已连接团队空间 · ${actor.name}` : `团队空间 · ${actor.name} · 正在恢复实时连接`); $('retryButton').hidden = true; }
    } catch (error) { $('libraryMessage').textContent = '项目加载失败，请重试；不会覆盖云端内容。'; reportError(error); }
    finally { listLoading = false; if (listAgain) { listAgain = false; loadProjects(); } }
  }
  function setProjectLocation(id) {
    const hash = '#/apps/dimensions' + (id ? `?project=${encodeURIComponent(id)}` : '');
    window.parent.history.replaceState(window.parent.history.state, '', hash);
  }
  function setOpening(value) {
    opening = value;
    $('workspace').inert = value;
    $('newProject').disabled = value;
    $('workspace').setAttribute('aria-busy', String(value));
  }
  async function open(id) {
    if (opening || !allowed()) return;
    if (session?.dirty || session?.saving) { reportError(new Error('请先同步或处理当前项目的冲突，再切换项目')); return; }
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('项目链接无效');
    setOpening(true);
    status('正在加载共享图片…');
    try {
      const row = await transport.read(prefix + id);
      const meta = row.payload.meta;
      if (!meta.imagePath.startsWith('academy/dimensions/')) throw new Error('图片路径无效');
      const response = await request(store.objectUrl(meta.imagePath), { headers: store.headers() });
      if (!response.ok) throw new Error('图片加载失败，请重试');
      const blob = await response.blob();
      if (!allowed()) return;
      $('workspace').hidden = false;
      $('library').hidden = true;
      $('projectHeading').hidden = false;
      await editor.openImage(blob, meta.name);
      const key = `academy-dimensions-outbox:${actor.id}:${id}`;
      let restored = [];
      try { restored = JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) {}
      session = new window.DimensionModel.Session({ row, actor, transport, restored,
        persist: entries => entries.length ? localStorage.setItem(key, JSON.stringify(entries)) : localStorage.removeItem(key), changed: update });
      session.checkConflicts(); session.notify();
      $('libraryButton').hidden = false; $('shareButton').hidden = false;
      setProjectLocation(id); subscribeProject(); if (session.dirty) schedule();
    } finally { setOpening(false); }
  }
  async function create(file) {
    if (!file || opening) return;
    try {
      ensureAllowed();
      if (session?.dirty || session?.saving) throw new Error('请先同步或处理当前项目的冲突，再新建项目');
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片');
      if (file.size > 15 * 1024 * 1024) throw new Error('图片请控制在 15 MB 以内');
      setOpening(true); status('正在上传图片并创建共享项目…');
      const image = await createImageBitmap(file);
      const width = image.width, height = image.height; image.close();
      if (width * height > 24000000) throw new Error('图片超过 2400 万像素，请缩小后上传');
      const id = crypto.randomUUID(), now = new Date().toISOString();
      const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
      const imagePath = `academy/dimensions/${id}/original.${extension}`;
      const upload = await request(store.objectUrl(imagePath), { method: 'POST', headers: store.headers({ 'Content-Type': file.type }), body: file });
      if (!upload.ok) throw new Error(`图片上传失败（${upload.status}）`);
      const payload = { schema: 1, meta: { id, name: file.name.slice(0, 180), imagePath, width, height,
        createdBy: actor, updatedBy: actor, createdAt: now, updatedAt: now, count: 0 }, annotations: {} };
      try {
        const result = await rest({}, { method: 'POST', body: JSON.stringify({ user_id: prefix + id, payload, ts: Date.now(), updated_at: now }) });
        if (!result?.length) throw new Error('创建项目失败');
      } catch (error) {
        // An uncertain response may already have committed; verify before cleanup.
        let existing;
        try { existing = await transport.read(prefix + id); } catch (_) {}
        if (!existing) throw new Error('图片已上传，但项目保存状态尚未确认。请刷新项目列表后再重试');
      }
      setOpening(false);
      catalogChannel?.send({ type: 'broadcast', event: 'changed', payload: { id } });
      await open(id);
    } catch (error) { reportError(error); }
    finally { setOpening(false); }
  }
  window.DimensionCollab = { actor, create, edit(item, deleted) {
    if (!allowed() || !session) return;
    session.edit(item, deleted); schedule();
  } };
  $('libraryButton').addEventListener('click', async () => {
    if (opening || session?.saving) return;
    if (session?.dirty) { await session.flush(); if (session.dirty) return; }
    if (projectChannel) sb.removeChannel(projectChannel);
    projectChannel = null; session = null; connected = false; clearTimeout(retryTimer);
    $('workspace').hidden = true; $('projectHeading').hidden = true; $('library').hidden = false;
    $('libraryButton').hidden = true; $('shareButton').hidden = true; $('presenceStatus').textContent = '';
    $('exportImage').disabled = true; setProjectLocation(null); loadProjects();
  });
  $('newProject').addEventListener('click', () => { $('fileInput').value = ''; $('fileInput').click(); });
  $('retryButton').addEventListener('click', () => { if (session) { refreshCurrent(); subscribeProject(); schedule(0); } else loadProjects(); });
  $('refreshLibrary').addEventListener('click', () => loadProjects());
  $('moreProjects').addEventListener('click', () => loadProjects(true));
  $('projectSearch').addEventListener('input', renderLibrary); $('onlyMine').addEventListener('change', renderLibrary);
  $('copyConflict').addEventListener('click', () => { session.resolve('copy'); schedule(0); });
  $('discardConflict').addEventListener('click', () => { session.resolve('remote'); schedule(0); });
  $('shareButton').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(window.parent.location.href); editor.notice('项目链接已复制，登录 Auto Office 后即可协作'); }
    catch (_) { editor.notice('复制失败，请复制浏览器地址栏中的项目链接'); }
  });
  const resume = () => { if (!document.hidden && allowed()) { if (session) refreshCurrent(); else loadProjects(); } };
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('online', resume);
  window.addEventListener('offline', () => { connected = false; if (session) update(session); });
  window.addEventListener('beforeunload', event => { if (session?.dirty || opening) { event.preventDefault(); event.returnValue = ''; } });
  function stop() {
    stopped = true; clearTimeout(timer); clearTimeout(retryTimer); clearInterval(pollTimer);
    sb.removeAllChannels(); stopAuth?.();
    document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume);
  }
  const stopAuth = auth.onChange(() => {
    if (!allowed()) {
      stop(); $('workspace').hidden = true; $('library').hidden = true; $('conflictPanel').hidden = true;
      document.querySelectorAll('button').forEach(button => { button.disabled = true; });
      status('登录或权限已变更，请返回 Auto Office 重新进入');
    }
  });
  window.addEventListener('pagehide', stop, { once: true });
  if (!allowed()) { status('请通过 Auto Office 登录并开通尺寸标注权限'); return; }
  openCatalogChannel(); loadProjects();
  const projectId = new URLSearchParams(window.parent.location.hash.split('?')[1] || '').get('project');
  if (projectId) open(projectId).catch(reportError);
  let lastPoll = Date.now();
  pollTimer = setInterval(() => {
    const interval = session && !connected ? 5000 : 30000;
    if (Date.now() - lastPoll < interval || document.hidden || navigator.onLine === false) return;
    lastPoll = Date.now(); resume();
  }, 5000);
})();
