async page => {
  // Isolated DOM fixtures exercising production functions; no account or backend writes.
  const base = 'http://127.0.0.1:8772';
  const sources = {};
  for (const [name, path] of Object.entries({
    stable: 'apps/academy/framework/stable-view.js',
    notes: 'apps/notes/index.html',
    app: 'apps/academy/app.js',
    schedule: 'apps/academy/pages/schedule/app.js',
    feedback: 'apps/academy/pages/feedback/app.js'
  })) sources[name] = await (await page.request.get(`${base}/${path}`)).text();
  await page.goto('about:blank');
  return page.evaluate(async sources => {
    const assert = (value, message) => { if (!value) throw new Error(message); };
    new Function(sources.stable)();
    document.body.innerHTML = '<style>article,.list-item{min-height:100px}body{margin:0}</style><main id="fixture"></main>';
    const root = document.getElementById('fixture');
    const html = (extra = '') => extra + Array.from({length:80}, (_, i) => `<article data-sync-key="${i}"><b>${i}</b><details><summary>详情</summary><input value="old"></details></article>`).join('');
    window.AcademyStableView.html(root, html());
    const card = root.querySelector('[data-sync-key="20"]');
    const details = card.querySelector('details');
    details.open = true;
    const input = card.querySelector('input');
    input.value = 'draft';
    input.focus();
    window.scrollTo(0, 2000);
    const before = card.getBoundingClientRect().top;
    window.AcademyStableView.html(root, html('<article data-sync-key="new">新增</article>').replace('<b>30</b>', '<b>已更新</b>'));
    assert(card === root.querySelector('[data-sync-key="20"]'), 'retained keyed card');
    assert(details.open && input.value === 'draft' && document.activeElement === input, 'expanded detail and active draft retained');
    assert(Math.abs(card.getBoundingClientRect().top - before) < 1, 'insertion retains reading anchor');
    assert(root.querySelector('[data-sync-key="30"] b').textContent === '已更新', 'changed row refreshed');
    const observer = new MutationObserver(() => {});
    observer.observe(root, {childList:true, subtree:true, attributes:true, characterData:true});
    // Details.open is local state; reconciliation must not close it.
    window.AcademyStableView.html(root, html('<article data-sync-key="new">新增</article>').replace('<b>30</b>', '<b>已更新</b>'));
    assert(!observer.takeRecords().some(record => record.type === 'childList'), 'identical payload does not rebuild children');
    observer.disconnect();

    const notesRender = sources.notes.slice(sources.notes.indexOf('            function render(list,'), sources.notes.indexOf('            function renderItemContent('));
    let cleaned = 0;
    const renderNotes = new Function('DOM', 'cleanupWebapps', 'toggleExpand', 'highlightText', 'formatDate', `${notesRender}; return render;`)(
      {results:root}, () => cleaned++, () => {}, value => value, value => value);
    root.innerHTML = '';
    const notes = Array.from({length:60}, (_, i) => ({id:String(i),title:`笔记${i}`,tag:'记录'}));
    renderNotes(notes);
    const note = root.querySelector('[data-item-id="20"]');
    note.classList.add('expanded');
    const iframe = document.createElement('iframe');
    note.querySelector('.content').appendChild(iframe);
    const frameWindow = iframe.contentWindow;
    window.scrollTo(0, 2000);
    const noteTop = note.getBoundingClientRect().top;
    renderNotes([{id:'new',title:'新笔记'}, ...notes.map(item => item.id === '30' ? {...item,title:'改名'} : item)]);
    assert(note.isConnected && note.classList.contains('expanded'), 'expanded note retained');
    assert(iframe.isConnected && iframe.contentWindow === frameWindow && cleaned === 0, 'embedded frame not destroyed');
    assert(Math.abs(note.getBoundingClientRect().top - noteTop) < 1, 'note reading anchor retained');
    assert(root.querySelector('[data-item-id="30"] .title').textContent === '改名', 'note header updated');
    renderNotes(notes.filter(item => item.id !== '20'));
    assert(!note.isConnected && cleaned === 2, 'removed notes cleaned up (including inserted note)');

    for (const [name, fn, end, cache] of [
      ['schedule','pullSchedule','function bindEvents', 'writeCachedData'],
      ['feedback','pullFeedback','let toastTimer', 'cacheData']
    ]) {
      const source = sources[name];
      const start = source.indexOf(`  async function ${fn}(`);
      const body = source.slice(start, source.indexOf(`  ${end}`, start));
      const state = {data:{rev:10, items:[]}, renderDay:new Date().toDateString()};
      let incoming = structuredClone(state.data), renders = 0;
      window.AcademyStore = {getJSON:async () => incoming};
      const pull = new Function('state','FILE','normalizeData',cache,'$','render', `${body};return ${fn};`)(state,'mock', value => value, () => {}, () => ({}), () => renders++);
      await pull();
      assert(renders === 0, `${name}: equal poll skipped`);
      incoming = {rev:9,items:['old']}; await pull();
      assert(renders === 0 && state.data.rev === 10, `${name}: stale poll skipped`);
      incoming = {rev:11,items:['new']}; await pull();
      assert(renders === 1 && state.data.rev === 11, `${name}: changed poll applied`);
      state.renderDay = 'yesterday'; await pull();
      assert(renders === 2, `${name}: date labels still update at midnight`);
    }

    root.innerHTML = '<input id="course-search-input" value="服务"><article class="card">课程</article>';
    const start = sources.app.indexOf('  let backgroundRenderTimer');
    const background = sources.app.slice(start, sources.app.indexOf('  function coerceId', start));
    const state = {route:{name:'learn'}};
    let renders = 0;
    const refresh = new Function('state','Auth','view','currentOpsRoute','updateNotificationButton','renderOpsStaff','render', `${background};return refreshBackgroundView;`)(
      state, {session:{id:'test'}}, () => root, () => ({}), () => {}, () => '', () => {
        renders++;
        root.innerHTML = '<input id="course-search-input"><article class="card">更新后</article>';
      });
    const search = document.getElementById('course-search-input');
    search.focus();
    refresh(); refresh();
    await new Promise(resolve => setTimeout(resolve, 350));
    assert(renders === 0 && document.activeElement === search, 'background refresh defers active search');
    search.blur();
    await new Promise(resolve => setTimeout(resolve, 350));
    assert(renders === 1 && document.getElementById('course-search-input').value === '服务', 'batched refresh preserves search');
    refresh(); state.route = {name:'exam'};
    await new Promise(resolve => setTimeout(resolve, 120));
    assert(renders === 1, 'queued old-route refresh cancelled');
    return {passed:true, scenarios:['keyed row updates','scroll anchor','focus and disclosure','notes iframe preservation and deletion','unchanged and stale polling','search retention','route guard'], backend:'isolated fixtures, no production writes'};
  }, sources);
}
