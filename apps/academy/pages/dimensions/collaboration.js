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
  function status(message, kind = 'connecting') {
    $('syncStatus').textContent = message; document.querySelector('.sync-bar').dataset.status = kind;
    $('compactSync').textContent = ({ saved: '已同步', saving: '保存中', connecting: '连接中', error: '同步异常', conflict: '有冲突' })[kind] || '连接中';
    $('compactSync').title = message;
  }
  function reportError(error) { status(error.message || String(error), 'error'); $('retryButton').hidden = false; }
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
      connected ? '已保存至云端 · 实时协作中' : '已保存至云端 · 正在恢复实时连接'), model.conflicts.size ? 'conflict' : model.error || model.cacheError ? 'error' : model.dirty || model.saving ? 'saving' : connected ? 'saved' : 'connecting');
    const meta = model.row.payload.meta;
    $('projectTitle').textContent = meta.name;
    $('projectAuthor').textContent = meta.createdBy.id === meta.updatedBy.id
      ? `制作：${meta.createdBy.name}` : `制作：${meta.createdBy.name} · 最近修改：${meta.updatedBy.name}`;
    const format = document.querySelector('.project-format');
    format.textContent = meta.imageBytes ? `${(meta.imageFormat || '图片').toUpperCase()} · ${window.DimensionImages.formatBytes(meta.imageBytes)}` : '图片标注';
    format.title = meta.sourceBytes ? `上传前 ${window.DimensionImages.formatBytes(meta.sourceBytes)} · 云端图片与预览共 ${window.DimensionImages.formatBytes(meta.storedBytes || meta.imageBytes)}` : '';
    $('exportImage').title = !model.view().length ? '添加一条标注后即可导出' : model.dirty ? '导出包含尚未同步的本机修改' : '导出标注图';
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
      $('compactPresence').textContent = $('presenceStatus').textContent;
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
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('icon'); svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${name}`); svg.append(use); return svg;
  }
  const previewCache = new Map(), previewQueue = [];
  const previewSources = new WeakMap();
  let previewActive = 0;
  function imagePaths(meta) {
    if (!/^[a-f0-9-]{36}$/i.test(meta.id)) return [];
    const directory = `academy/dimensions/${meta.id}/`;
    return [...new Set([meta.thumbnailPath, meta.imagePath].filter(path =>
      typeof path === 'string' && path.startsWith(directory) &&
      /^[a-z0-9][a-z0-9._-]*\.(?:webp|jpe?g|png)$/i.test(path.slice(directory.length))))];
  }
  async function loadPreview(paths) {
    for (const path of paths) {
      if (!allowed()) return null;
      try {
        const response = await request(store.objectUrl(path), { headers: store.headers() });
        if (!response.ok) continue;
        // Decode before caching: a 200 response can still contain a broken image.
        // Legacy projects have only original.*; generate a small local preview.
        const blob = await window.DimensionImages.preview(await response.blob());
        if (!allowed()) return null;
        return URL.createObjectURL(blob);
      } catch (_) { /* Try the project image if its thumbnail is missing or invalid. */ }
    }
    throw new Error('预览暂不可用，连接恢复后自动重试');
  }
  async function drainPreviews() {
    while (previewActive < 2 && previewQueue.length && !stopped) {
      const { img, paths } = previewQueue.shift();
      if (!img.isConnected) continue;
      previewActive++;
      (async () => {
        const key = paths.join('|');
        let cached;
        try {
          cached = previewCache.get(key);
          if (!cached) {
            cached = loadPreview(paths);
            previewCache.set(key, cached);
            if (previewCache.size > 100) {
              const oldest = previewCache.keys().next().value, previous = previewCache.get(oldest);
              previewCache.delete(oldest);
              previous.then(url => { if (url) URL.revokeObjectURL(url); }).catch(() => {});
            }
          }
          const url = await cached;
          if (url && img.isConnected && !stopped) { img.src = url; img.hidden = false; }
        } catch (_) {
          if (previewCache.get(key) === cached) previewCache.delete(key);
          if (img.isConnected) img.parentElement.title = '预览暂不可用，连接恢复后自动重试';
        }
        finally { previewActive--; drainPreviews(); }
      })();
    }
  }
  const previewObserver = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      previewObserver.unobserve(entry.target);
      previewQueue.push({ img: entry.target.querySelector('img'), paths: previewSources.get(entry.target) });
    }
    drainPreviews();
  }, { rootMargin: '120px' });
  function renderLibrary() {
    const query = $('projectSearch').value.trim().toLocaleLowerCase();
    const filtered = query || $('onlyMine').checked;
    const items = projects.filter(meta => (!$('onlyMine').checked || meta.createdBy.id === actor.id) &&
      `${meta.name} ${meta.createdBy.name}`.toLocaleLowerCase().includes(query));
    previewObserver.disconnect(); previewQueue.length = 0;
    $('projectList').replaceChildren();
    for (const meta of items) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'project-card';
      button.setAttribute('aria-label', `${meta.name}，制作：${meta.createdBy.name}，${meta.count || 0} 条标注`);
      const preview = document.createElement('span'); preview.className = 'project-preview'; preview.append(icon('photo'));
      const paths = imagePaths(meta);
      if (paths.length) {
        const img = document.createElement('img'); img.alt = ''; img.hidden = true; img.decoding = 'async'; img.onerror = () => { img.hidden = true; };
        preview.append(img); previewSources.set(preview, paths); previewObserver.observe(preview);
      }
      const count = document.createElement('span'); count.className = 'project-count'; count.textContent = `${meta.count || 0} 条标注`; preview.append(count);
      const info = document.createElement('span'); info.className = 'project-info';
      const name = document.createElement('strong'); name.textContent = meta.name; name.title = meta.name;
      const author = document.createElement('span'); author.className = 'project-byline';
      const avatar = document.createElement('span'); avatar.className = 'employee-avatar'; avatar.textContent = Array.from(meta.createdBy.name)[0]; avatar.setAttribute('aria-hidden', 'true');
      author.append(avatar, document.createTextNode(`制作：${meta.createdBy.name}`));
      const date = document.createElement('small');
      const mobileCount = document.createElement('span'); mobileCount.className = 'mobile-project-count'; mobileCount.textContent = `${meta.count || 0} 条标注 · `;
      date.append(mobileCount, document.createTextNode(`${new Date(meta.updatedAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} 更新`));
      info.append(name, author, date); button.append(preview, info);
      button.addEventListener('click', () => open(meta.id).catch(reportError));
      $('projectList').append(button);
    }
    $('libraryMessage').textContent = items.length ? `${items.length} 个项目` : filtered ? '没有匹配的项目' : '尚无项目';
    $('libraryEmpty').hidden = items.length > 0;
    $('emptyTitle').textContent = filtered ? '没有找到相关项目' : '从一张图片开始';
    $('emptyDescription').textContent = filtered ? '试试其他关键词，或取消「我创建的」筛选。' : '上传需要标注的图片，和同事一起记录尺寸。';
    $('emptyCreate').hidden = Boolean(filtered);
    $('libraryEmpty').querySelector('small').hidden = Boolean(filtered);
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
      if (!session && !opening) { status(catalogConnected ? `已连接团队空间 · ${actor.name}` : `团队空间 · ${actor.name} · 正在恢复实时连接`, catalogConnected ? 'saved' : 'connecting'); $('retryButton').hidden = true; }
    } catch (error) { $('libraryEmpty').hidden = true; $('libraryMessage').textContent = '项目加载失败，请重试'; reportError(error); }
    finally { listLoading = false; if (listAgain) { listAgain = false; loadProjects(); } }
  }
  function setProjectLocation(id) {
    const hash = '#/apps/dimensions' + (id ? `?project=${encodeURIComponent(id)}` : '');
    window.parent.history.replaceState(window.parent.history.state, '', hash);
  }
  let retryImageAction = null;
  function deadline(promise, label, milliseconds = 45000) {
    let timeout;
    return Promise.race([promise, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`${label}超时，请检查网络后重试`)), milliseconds);
    })]).finally(() => clearTimeout(timeout));
  }
  function imageProgress(title, message, name) {
    const step = message.match(/^(\d+) \/ (\d+) · /);
    $('imageOperationStep').hidden = !step;
    $('imageOperationStep').textContent = step ? `步骤 ${step[1]} / ${step[2]}` : '';
    if (name !== undefined) {
      $('imageOperationFile').textContent = name;
      $('imageOperationFile').title = name;
      $('imageOperationFile').hidden = !name;
    }
    $('imageOperation').hidden = false;
    $('imageOperation').dataset.status = 'loading';
    $('imageOperationTitle').textContent = title;
    $('imageOperationMessage').textContent = step ? message.slice(step[0].length) : message;
    $('imageOperationProgress').setAttribute('aria-valuetext', message);
    $('imageOperationProgress').hidden = false;
    $('retryImageOperation').hidden = true;
    $('dismissImageOperation').hidden = true;
  }
  async function imageOperation(action, retry, name = '') {
    $('imageOperationFile').textContent = name;
    $('imageOperationFile').title = name;
    $('imageOperationFile').hidden = !name;
    retryImageAction = retry;
    setOpening(true);
    try {
      await action();
      $('imageOperation').hidden = true;
      retryImageAction = null;
    } catch (error) {
      $('imageOperation').hidden = false;
      $('imageOperation').dataset.status = 'error';
      $('imageOperationTitle').textContent = '图片打开失败';
      $('imageOperationStep').hidden = true;
      $('imageOperationMessage').textContent = error.message || String(error);
      $('imageOperationProgress').hidden = true;
      $('retryImageOperation').hidden = !allowed();
      $('dismissImageOperation').hidden = false;
    } finally {
      setOpening(false);
      if (allowed()) ($('imageOperation').dataset.status === 'error' && !$('imageOperation').hidden
        ? $('retryImageOperation') : $('toggleEdit')).focus({ preventScroll: true });
    }
  }
  function setOpening(value) {
    opening = value;
    $('toggleEdit').disabled = value || !allowed();
    $('workspace').inert = value;
    $('newProject').disabled = value;
    $('workspace').setAttribute('aria-busy', String(value));
    $('library').setAttribute('aria-busy', String(value));
    $('newProject').querySelector('span').textContent = value ? '正在准备…' : '新建标注';
    $('newProject').setAttribute('aria-label', value ? '正在准备图片' : '新建标注');
    $('emptyCreate').disabled = value;
  }
  async function showProject(row, blob) {
    ensureAllowed();
    const meta = row.payload.meta, id = meta.id;
    await editor.openImage(blob, meta.name);
    ensureAllowed();
    document.body.dataset.view = 'editor';
    $('workspace').hidden = false;
    $('library').hidden = true;
    $('projectHeading').hidden = false;
    editor.fit();
    const key = `academy-dimensions-outbox:${actor.id}:${id}`;
    let restored = [];
    try { restored = JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) {}
    session = new window.DimensionModel.Session({ row, actor, transport, restored,
      persist: entries => entries.length ? localStorage.setItem(key, JSON.stringify(entries)) : localStorage.removeItem(key), changed: update });
    session.checkConflicts(); session.notify();
    $('libraryButton').hidden = false;
    setProjectLocation(id); subscribeProject(); if (session.dirty) schedule();
  }
  async function open(id) {
    if (opening) return;
    await imageOperation(async () => {
      ensureAllowed();
      if (session?.dirty || session?.saving) throw new Error('请先同步或处理当前项目的冲突，再切换项目');
      if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('项目链接无效');
      imageProgress('正在打开图片', '1 / 3 · 正在读取项目资料…');
      const row = await deadline(transport.read(prefix + id), '读取项目');
      const meta = row.payload.meta;
      if (!meta.imagePath?.startsWith('academy/dimensions/')) throw new Error('图片路径无效');
      imageProgress('正在打开图片', '2 / 3 · 正在下载共享图片…', meta.name);
      const blob = await deadline((async () => {
        const response = await request(store.objectUrl(meta.imagePath), { headers: store.headers() });
        if (!response.ok) throw new Error(`图片下载失败（${response.status}），请重试打开`);
        return response.blob();
      })(), '下载图片');
      imageProgress('正在打开图片', '3 / 3 · 正在解码图片并准备画布…');
      await showProject(row, blob);
    }, () => open(id), projects.find(meta => meta.id === id)?.name);
  }
  async function create(file, pending = {}) {
    if (!file || opening) return;
    await imageOperation(async () => {
      ensureAllowed();
      if (session?.dirty || session?.saving) throw new Error('请先同步或处理当前项目的冲突，再新建项目');
      imageProgress('正在打开新图片', '1 / 4 · 正在本机转换并压缩图片…');
      if (!pending.processed) {
        let processing = true;
        try {
          pending.processed = await deadline(window.DimensionImages.prepare(file, message => {
            if (processing) imageProgress('正在打开新图片', `1 / 4 · ${message}`);
          }), '图片处理');
        } finally { processing = false; }
      }
      ensureAllowed();
      const { main, preview, reusePreview, sourceBytes, sourceWidth, sourceHeight } = pending.processed;
      const id = pending.id ||= crypto.randomUUID(), now = new Date().toISOString();
      const imagePath = `academy/dimensions/${id}/image.${main.extension}`;
      imageProgress('正在打开新图片', `2 / 4 · 正在上传图片（${window.DimensionImages.formatBytes(main.blob.size)}）…`);
      if (!pending.uploaded) {
        // Retry uses the same project and object path, including lost upload replies.
        const upload = await deadline(request(store.objectUrl(imagePath), { method: 'POST', headers: store.headers({ 'Content-Type': main.blob.type, 'x-upsert': 'true' }), body: main.blob }), '上传图片');
        if (!upload.ok) throw new Error(`图片上传失败（${upload.status}），请重试`);
        pending.uploaded = true;
      }
      let thumbnailPath = reusePreview ? imagePath : undefined, thumbnailBytes = 0;
      if (!pending.payload && preview) {
        imageProgress('正在打开新图片', '2 / 4 · 正在上传图片预览…');
        const path = `academy/dimensions/${id}/preview.${preview.extension}`;
        try {
          const result = await deadline(request(store.objectUrl(path), { method: 'POST', headers: store.headers({ 'Content-Type': preview.blob.type, 'x-upsert': 'true' }), body: preview.blob }), '上传预览', 15000);
          if (result.ok) { thumbnailPath = path; thumbnailBytes = preview.blob.size; }
        } catch (_) { /* A preview failure must not discard the optimized main image. */ }
      }
      const payload = pending.payload ||= { schema: 1, meta: { id, thumbnailPath, name: file.name.slice(0, 180), imagePath,
        width: main.width, height: main.height, sourceWidth, sourceHeight, sourceBytes,
        imageBytes: main.blob.size, imageFormat: main.extension, thumbnailBytes,
        storedBytes: main.blob.size + thumbnailBytes,
        createdBy: actor, updatedBy: actor, createdAt: now, updatedAt: now, count: 0 }, annotations: {} };
      imageProgress('正在打开新图片', '3 / 4 · 正在保存共享项目…');
      if (!pending.row) {
        // Reconcile an uncertain save before retrying; never create another project.
        if (pending.saveAttempted) {
          const rows = await deadline(rest({ user_id: `eq.${prefix + id}`, select: 'user_id,payload,ts,updated_at' }), '确认项目保存状态');
          pending.row = rows?.[0];
        }
        if (!pending.row) {
          pending.saveAttempted = true;
          try {
            const result = await deadline(rest({}, { method: 'POST', body: JSON.stringify({ user_id: prefix + id, payload, ts: Date.now(), updated_at: now }) }), '保存项目');
            if (!result?.[0]) throw new Error('创建项目失败');
            pending.row = result[0];
          } catch (error) {
            imageProgress('正在打开新图片', '3 / 4 · 正在确认项目是否已保存…');
            try { pending.row = await deadline(transport.read(prefix + id), '确认项目保存状态'); } catch (_) {}
            if (!pending.row) throw new Error('图片已上传，项目保存尚未确认。请重试，系统会先检查保存结果。');
          }
        }
      }
      imageProgress('正在打开新图片', '4 / 4 · 正在打开图片并准备画布…');
      // Use the confirmed row and local optimized blob instead of downloading again.
      await showProject(pending.row, main.blob);
      Promise.resolve().then(() => catalogChannel?.send({ type: 'broadcast', event: 'changed', payload: { id } })).catch(() => {});
      editor.notice(`图片已优化并共享 · ${window.DimensionImages.formatBytes(main.blob.size)}`);
    }, () => create(file, pending), file.name);
  }
  window.DimensionCollab = { actor, create, edit(item, deleted) {
    if (!allowed() || !session) return;
    session.edit(item, deleted); schedule();
  } };
  let renameSession = null, renameBase = '', renaming = false;
  function openRename() {
    if (!session || !allowed() || renaming) return;
    renameSession = session; renameBase = session.row.payload.meta.name;
    $('projectHeading').open = false;
    $('projectNameInput').value = renameBase;
    $('renameStatus').textContent = '名称会同步给项目成员。';
    $('renameDialog').showModal();
    $('projectNameInput').focus(); $('projectNameInput').select();
  }
  $('projectTitle').addEventListener('dblclick', event => { event.preventDefault(); openRename(); });
  $('renameProject').addEventListener('click', openRename);
  $('cancelRename').addEventListener('click', () => $('renameDialog').close());
  $('renameDialog').addEventListener('cancel', event => { if (renaming) event.preventDefault(); });
  $('renameDialog').addEventListener('close', () => document.querySelector('#projectHeading summary').focus({ preventScroll: true }));
  $('renameForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (renaming || !renameSession || renameSession !== session || !allowed()) return;
    const name = $('projectNameInput').value.trim();
    if (!name) { $('renameStatus').textContent = '请输入项目名称。'; $('projectNameInput').focus(); return; }
    if (name === renameBase) { $('renameDialog').close(); return; }
    const current = renameSession;
    renaming = true;
    $('renameForm').setAttribute('aria-busy', 'true');
    $('saveRename').disabled = $('cancelRename').disabled = $('projectNameInput').disabled = true;
    $('saveRename').textContent = '保存中…';
    $('renameStatus').textContent = '正在保存到云端…';
    try {
      for (let attempt = 0; attempt < 8; attempt++) {
        const row = await deadline(transport.read(current.row.user_id), '读取项目名称', 15000);
        ensureAllowed();
        if (current !== session) throw new Error('项目已切换，请重新打开项目后重试');
        current.receive(row);
        if (row.payload.meta.name !== name && row.payload.meta.name !== renameBase) {
          renameBase = row.payload.meta.name;
          throw new Error(`其他成员已将名称改为“${renameBase}”。再次保存将使用你输入的名称。`);
        }
        const payload = JSON.parse(JSON.stringify(row.payload));
        payload.meta.name = name;
        payload.meta.updatedAt = new Date().toISOString(); payload.meta.updatedBy = actor;
        const saved = row.payload.meta.name === name ? row : await deadline(transport.cas(row, payload), '保存项目名称', 15000);
        if (!saved) continue;
        if (allowed() && current === session) { current.receive(saved); editor.notice('项目名称已保存'); }
        $('renameDialog').close();
        return;
      }
      throw new Error('项目正在频繁更新，请稍后重试');
    } catch (error) {
      $('renameStatus').textContent = `${error.message || '保存失败'} 输入已保留。`;
    } finally {
      renaming = false;
      $('renameForm').removeAttribute('aria-busy');
      $('saveRename').disabled = $('cancelRename').disabled = $('projectNameInput').disabled = false;
      $('saveRename').textContent = '保存';
      if ($('renameDialog').open) $('projectNameInput').focus();
    }
  });
  $('libraryButton').addEventListener('click', async () => {
    if (opening || session?.saving) return;
    if (session?.dirty) { await session.flush(); if (session.dirty) return; }
    if (projectChannel) sb.removeChannel(projectChannel);
    projectChannel = null; session = null; connected = false; clearTimeout(retryTimer);
    document.body.dataset.view = 'library';
    $('workspace').hidden = true; $('projectHeading').hidden = true; $('library').hidden = false;
    $('libraryButton').hidden = true; $('presenceStatus').textContent = ''; $('compactPresence').textContent = ''; $('projectHeading').open = false;
    $('exportImage').disabled = true; setProjectLocation(null); loadProjects();
  });
  $('emptyCreate').addEventListener('click', () => $('newProject').click());
  $('newProject').addEventListener('click', () => { $('fileInput').value = ''; $('fileInput').click(); });
  $('retryImageOperation').addEventListener('click', () => { if (!opening) retryImageAction?.(); });
  $('dismissImageOperation').addEventListener('click', () => {
    $('imageOperation').hidden = true; retryImageAction = null;
    (session ? $('toggleEdit') : $('newProject')).focus({ preventScroll: true });
  });
  $('retryButton').addEventListener('click', () => { if (session) { refreshCurrent(); subscribeProject(); schedule(0); } else loadProjects(); });
  $('moreProjects').addEventListener('click', () => loadProjects(true));
  $('projectSearch').addEventListener('input', renderLibrary); $('onlyMine').addEventListener('change', renderLibrary); $('allProjects').addEventListener('change', renderLibrary);
  $('copyConflict').addEventListener('click', () => { session.resolve('copy'); schedule(0); });
  $('discardConflict').addEventListener('click', () => { session.resolve('remote'); schedule(0); });
  document.addEventListener('click', event => { if (!$('projectHeading').contains(event.target)) $('projectHeading').open = false; });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') $('projectHeading').open = false; });
  const resume = () => { if (!document.hidden && allowed()) { if (session) refreshCurrent(); else loadProjects(); } };
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('online', resume);
  window.addEventListener('offline', () => { connected = false; if (session) update(session); });
  window.addEventListener('beforeunload', event => { if (session?.dirty || opening || renaming) { event.preventDefault(); event.returnValue = ''; } });
  function stop() {
    stopped = true; $('renameDialog').close(); clearTimeout(timer); clearTimeout(retryTimer); clearInterval(pollTimer);
    sb.removeAllChannels(); stopAuth?.(); retryImageAction = null; $('imageOperation').hidden = true;
    previewObserver.disconnect(); previewQueue.length = 0;
    for (const promise of previewCache.values()) promise.then(url => { if (url) URL.revokeObjectURL(url); }).catch(() => {});
    previewCache.clear();
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
  setOpening(false);
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
