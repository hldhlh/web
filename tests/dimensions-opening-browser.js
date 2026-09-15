async page => {
  const origin = 'http://127.0.0.1:8775';
  const rows = new Map(), files = new Map(), offline = new Set(), errors = [];
  const controls = { holdStartup: true, failStartup: false, holdUpload: false, holdDownload: false, holdRead: false, failDownload: false, failSave: false, failRead: false };
  let releaseStartup, startupReady;
  const startupRequest = new Promise(resolve => { startupReady = resolve; });
  let releaseUpload, releaseDownload, releaseRead, imageReads = 0, projectWrites = 0;
  const context = page.context();
  await context.addInitScript(() => {
    const native = window.setTimeout;
    window.setTimeout = (fn, ms, ...args) => native(fn, window.__fastImageTimeout && ms === 45000 ? 300 : ms, ...args);
  });
  const a = page, b = await context.newPage();
  for (const p of [a, b]) { p.on('pageerror', error => errors.push(error.message)); p.on('dialog', dialog => dialog.accept()); }
  const sdk = `window.supabase={createClient(){const channels=[];window.__db=row=>channels.forEach(c=>c.handlers.filter(h=>h.type==='postgres_changes'&&h.filter.filter==='user_id=eq.'+row.user_id).forEach(h=>h.fn({new:row})));return {channel(name){const c={handlers:[],on(type,filter,fn){this.handlers.push({type,filter,fn});return this;},subscribe(fn){queueMicrotask(()=>fn('SUBSCRIBED'));return this;},track(){return Promise.resolve();},presenceState(){return {};},send(){return Promise.resolve('ok');}};channels.push(c);return c;},removeChannel(c){const i=channels.indexOf(c);if(i>=0)channels.splice(i,1);},removeAllChannels(){channels.length=0;}};}};`;
  const host = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"></head><body style="margin:0"><script>${sdk}
    const who=new URLSearchParams(location.search).get('actor')||'A';
    window.AcademyAuth={session:{id:who,name:'员工'+who,access:'full'},canShortcut:u=>!!u,onChange:()=>()=>{}};
    window.ACADEMY_CONFIG={url:'https://dimension-test.invalid',key:'test',bucket:'test',table:'academy_progress'};
    window.AcademyStore={origin:()=>ACADEMY_CONFIG.url,headers:extra=>extra||{},objectUrl:path=>ACADEMY_CONFIG.url+'/storage/v1/object/test/'+path};
    </script><iframe title="尺寸标注" src="/apps/academy/pages/dimensions/index.html" style="border:0;width:100%;height:100vh"></iframe></body></html>`;
  await context.route('**/*', async route => {
    const request = route.request();
    const raw = request.url(), root = raw.match(/^https?:\/\/[^/]+/)[0];
    const url = { origin: root, pathname: raw.slice(root.length).split('?')[0], searchParams: new Map((raw.split('?')[1] || '').split('&').filter(Boolean).map(part => part.split('=').map(decodeURIComponent))) };
    if (url.origin === origin) {
      if (url.pathname.endsWith('/dimensions/model.js')) {
        if (controls.holdStartup) { controls.holdStartup = false; startupReady(); await new Promise(resolve => { releaseStartup = resolve; }); }
        if (controls.failStartup) return route.fulfill({ status: 503 });
      }
      if (url.pathname === '/dimension-test') return route.fulfill({ contentType: 'text/html', body: host });
      return route.continue();
    }
    if (url.origin !== 'https://dimension-test.invalid') return route.abort();
    if (offline.has(request.frame().page())) return route.fulfill({ status: 503, json: { error: 'offline test' } });
    if (url.pathname.includes('/storage/')) {
      if (request.method() === 'POST' && controls.holdUpload) { controls.holdUpload = false; await new Promise(resolve => { releaseUpload = resolve; }); }
      if (request.method() === 'GET' && url.pathname.includes('/image.')) {
        imageReads++;
        if (controls.holdDownload) { controls.holdDownload = false; await new Promise(resolve => { releaseDownload = resolve; }); }
        if (controls.failDownload) { controls.failDownload = false; return route.fulfill({ status: 503 }); }
      }
      if (request.method() === 'POST') { files.set(url.pathname, request.postDataBuffer()); return route.fulfill({ json: { Key: url.pathname } }); }
      return files.has(url.pathname) ? route.fulfill({ contentType: 'image/png', body: files.get(url.pathname) }) : route.fulfill({ status: 404 });
    }
    if (url.pathname.includes('/rest/')) {
      const filter = url.searchParams.get('user_id');
      const id = filter?.slice(3);
      let result;
      if (request.method() === 'GET' && filter?.startsWith('eq.')) {
        if (controls.holdRead) { controls.holdRead = false; await new Promise(resolve => { releaseRead = resolve; }); }
        if (controls.failRead) return route.fulfill({ status: 503 });
      }
      if (request.method() === 'POST') {
        projectWrites++;
        const row = request.postDataJSON(); rows.set(row.user_id, row); result = [row];
        if (controls.failSave) { controls.failSave = false; return route.fulfill({ status: 503 }); }
      } else if (request.method() === 'PATCH') {
        const old = rows.get(id);
        if (old && String(old.ts) === url.searchParams.get('ts')?.slice(3)) {
          const row = { ...old, ...request.postDataJSON() }; rows.set(id, row); result = [row];
          for (const p of [a,b]) if (!offline.has(p)) for (const f of p.frames()) await f.evaluate(row => window.__db?.(row), row).catch(()=>{});
        } else result = [];
      } else if (filter?.startsWith('eq.')) result = rows.has(id) ? [rows.get(id)] : [];
      else result = [...rows.values()].map(row => ({ meta: row.payload.meta }));
      return route.fulfill({ json: result });
    }
    return route.abort();
  });

  const assert = (value, message) => { if (!value) throw Error(message); };
  await a.setViewportSize({ width: 390, height: 844 });
  await a.goto(origin + '/dimension-test?actor=A', { waitUntil: 'domcontentloaded' });
  const f = a.frameLocator('iframe');
  await startupRequest;
  await f.locator('#imageOperationTitle', { hasText: '正在加载标注工具' }).waitFor();
  assert(await f.locator('#newProject').isDisabled(), 'File selection enabled before initialization');
  releaseStartup();
  await f.locator('#newProject:not([disabled])').waitFor();
  const upload = async name => a.frames()[1].evaluate(async name => {
    const c = document.createElement('canvas'); c.width = 3200; c.height = 2400;
    const x = c.getContext('2d'); x.fillStyle = '#345678'; x.fillRect(0, 0, c.width, c.height);
    const blob = await new Promise(resolve => c.toBlob(resolve, 'image/png'));
    const dt = new DataTransfer(); dt.items.add(new File([blob], name, { type: 'image/png' }));
    const input = document.getElementById('fileInput'); input.files = dt.files; input.dispatchEvent(new Event('change'));
  }, name);
  const message = text => f.locator('#imageOperationMessage', { hasText: text }).waitFor();
  const visiblePanel = async () => {
    assert(await f.locator('#imageOperation').isVisible(), 'Operation feedback is hidden');
    const box = await f.locator('#imageOperation').boundingBox();
    assert(box.y >= 0 && box.y + box.height <= 844 && box.x >= 0 && box.x + box.width <= 390, 'Operation feedback is outside mobile viewport');
  };
  controls.holdUpload = true;
  await upload('首次上传.png'); await message('正在上传图片（'); await visiblePanel();
  await a.frames()[1].evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await message('正在上传图片（');
  assert(await f.locator('#newProject').isDisabled(), 'Concurrent upload is not blocked');
  releaseUpload();
  await f.locator('#workspace:not([hidden])').waitFor();
  await f.locator('#imageOperation').waitFor({ state: 'hidden' });
  assert(imageReads === 0, 'New upload was unnecessarily downloaded again');
  assert(rows.size === 1 && projectWrites === 1, 'New upload did not create exactly one project');
  const canvas = await f.locator('#measureCanvas').boundingBox();
  assert(canvas.width > 200, 'Canvas fit was calculated while hidden');

  await f.locator('#libraryButton').click();
  await f.locator('.project-card').waitFor();
  controls.holdDownload = true; controls.failDownload = true;
  await f.locator('.project-card').click(); await message('正在下载共享图片'); await visiblePanel();
  await a.screenshot({ path: 'output/playwright/dimensions-opening-mobile.png', fullPage: true });
  releaseDownload(); await f.locator('#retryImageOperation:not([hidden])').waitFor();
  await message('图片下载失败（503）'); await visiblePanel();
  assert(await f.locator('#retryImageOperation').evaluate(el => el === document.activeElement), 'Retry does not receive keyboard focus after failure');
  assert(!(await f.locator('#newProject').isDisabled()), 'Failed open left the interface locked');
  await f.locator('#retryImageOperation').click();
  await f.locator('#workspace:not([hidden])').waitFor();
  await f.locator('#imageOperation').waitFor({ state: 'hidden' });

  // A lost save acknowledgement plus an unavailable verification remains retryable.
  // The next attempt reads the same saved row and must not create a second project.
  controls.failSave = true; controls.failRead = true;
  await upload('保存响应丢失.png'); await message('项目保存尚未确认'); await visiblePanel();
  assert(rows.size === 2 && projectWrites === 2, 'Uncertain save unexpectedly duplicated a project');
  await a.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await a.emulateMedia({ reducedMotion: 'reduce', contrast: 'more' });
  await a.screenshot({ path: 'output/playwright/dimensions-opening-error-dark.png', fullPage: true });
  const media = await context.newCDPSession(a);
  await media.send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-reduced-transparency', value: 'reduce' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
    { name: 'prefers-contrast', value: 'more' }
  ] });
  await a.setViewportSize({ width: 320, height: 568 });
  await a.frames()[1].evaluate(() => { document.documentElement.style.fontSize = '25.5px'; });
  assert(!(await a.frames()[1].evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'Large text causes horizontal overflow');
  const panel = await f.locator('#imageOperation').boundingBox();
  const toolbar = await f.locator('.topbar').boundingBox();
  assert(panel.y >= toolbar.y + toolbar.height, 'Feedback covers the project toolbar');
  for (const id of ['retryImageOperation', 'dismissImageOperation']) {
    const box = await f.locator('#' + id).boundingBox();
    assert(box.width >= 44 && box.height >= 44 && box.y >= panel.y && box.y + box.height <= panel.y + panel.height, 'Large-text error action is clipped or too small');
  }
  await a.screenshot({ path: 'output/playwright/dimensions-feedback-large-text.png', fullPage: true });
  await a.setViewportSize({ width: 1440, height: 1000 });
  await a.frames()[1].evaluate(() => { document.documentElement.style.fontSize = ''; });
  await a.evaluate(() => document.documentElement.dataset.theme = 'light');
  await a.screenshot({ path: 'output/playwright/dimensions-feedback-desktop.png', fullPage: true });
  await a.setViewportSize({ width: 390, height: 844 });
  controls.failRead = false;
  await f.locator('#retryImageOperation').click();
  await f.locator('#projectTitle', { hasText: '保存响应丢失.png' }).waitFor();
  await f.locator('#imageOperation').waitFor({ state: 'hidden' });
  assert(rows.size === 2 && projectWrites === 2, 'Retry duplicated an already saved project');

  await f.locator('#libraryButton').click();
  await f.locator('.project-card').first().waitFor();
  await a.frames()[1].evaluate(() => { window.__fastImageTimeout = true; });
  controls.holdRead = true;
  await f.locator('.project-card').first().click();
  await message('读取项目超时'); await visiblePanel();
  releaseRead();
  await a.frames()[1].evaluate(() => { window.__fastImageTimeout = false; });
  await f.locator('#retryImageOperation').click();
  await f.locator('#workspace:not([hidden])').waitFor();
  await f.locator('#imageOperation').waitFor({ state: 'hidden' });
  controls.failStartup = true;
  await b.goto(origin + '/dimension-test?actor=B');
  const bf = b.frameLocator('iframe');
  await bf.locator('#imageOperationTitle', { hasText: '标注工具未能打开' }).waitFor();
  assert(await bf.locator('#newProject').isDisabled(), 'Failed initialization enabled file selection');
  controls.failStartup = false;
  await bf.locator('#retryImageOperation').click();
  await bf.locator('#newProject:not([disabled])').waitFor();
  await bf.locator('#imageOperation').waitFor({ state: 'hidden' });
  assert(!errors.length, errors.join('\n'));
  await b.close();
  return { passed: true, checks: ['initialization progress and failure retry', 'visible mobile upload stages', 'catalog refresh preserves progress', 'new image opens without redownload', 'visible download stage', 'download failure and retry', 'lost save reply reconciled without duplicate', 'read timeout and retry', 'dark and reduced-motion feedback', 'keyboard focus', '320px large-text actions and toolbar', 'reduced transparency and contrast'], productionWrites: 0 };
}
