async page => {
  const origin = 'http://127.0.0.1:8775';
  const rows = new Map(), files = new Map(), offline = new Set(), errors = [];
  const context = page.context();
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
      if (url.pathname === '/dimension-test') return route.fulfill({ contentType: 'text/html', body: host });
      return route.continue();
    }
    if (url.origin !== 'https://dimension-test.invalid') return route.abort();
    if (offline.has(request.frame().page())) return route.fulfill({ status: 503, json: { error: 'offline test' } });
    if (url.pathname.includes('/storage/')) {
      if (request.method() === 'POST') { files.set(url.pathname, request.postDataBuffer()); return route.fulfill({ json: { Key: url.pathname } }); }
      return files.has(url.pathname) ? route.fulfill({ contentType: 'image/png', body: files.get(url.pathname) }) : route.fulfill({ status: 404 });
    }
    if (url.pathname.includes('/rest/')) {
      const filter = url.searchParams.get('user_id');
      const id = filter?.slice(3);
      let result;
      if (request.method() === 'POST') {
        const row = request.postDataJSON(); rows.set(row.user_id, row); result = [row];
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
  await a.setViewportSize({width:1440,height:1000});
  await a.goto(origin + '/dimension-test?actor=A');
  const fa = a.frameLocator('iframe');
  await fa.locator('#newProject:not([disabled])').waitFor();
  const png = await a.evaluate(() => { const c=document.createElement('canvas');c.width=3600;c.height=2600;const x=c.getContext('2d');x.scale(4,4);x.fillStyle='#e8e3da';x.fillRect(0,0,900,650);x.fillStyle='#b59b7d';x.fillRect(190,180,500,260);x.fillStyle='#7b624b';x.fillRect(210,440,22,135);x.fillRect(650,440,22,135);return c.toDataURL().split(',')[1]; });
  await a.frames()[1].evaluate(png => { const file=new File([Uint8Array.from(atob(png),c=>c.charCodeAt(0))], '工作台尺寸.png', {type:'image/png'});const dt=new DataTransfer();dt.items.add(file);const input=document.getElementById('fileInput');input.files=dt.files;input.dispatchEvent(new Event('change')); }, png);
  await fa.locator('#projectTitle').waitFor();
  const meta = [...rows.values()][0].payload.meta;
  const projectId = meta.id;
  if (meta.width !== 2560 || meta.height !== 1849 || meta.sourceWidth !== 3600 || meta.sourceHeight !== 2600) throw Error('Image dimensions did not reflect upload resizing');
  if (meta.imageBytes > 1024 * 1024 || !meta.imagePath.includes('/image.') || [...files.keys()].some(path => path.includes('/original.'))) throw Error('Original or oversized image was uploaded');
  const canvasSize = await a.frames()[1].evaluate(() => ({width:document.getElementById('measureCanvas').width,height:document.getElementById('measureCanvas').height}));
  if (canvasSize.width !== meta.width || canvasSize.height !== meta.height) throw Error('Annotation coordinates do not match stored dimensions');
  if (JSON.stringify([...rows.values()][0].payload).includes('data:image/')) throw Error('Image bytes leaked into database payload');
  await b.goto(origin + '/dimension-test?actor=B#/apps/dimensions?project=' + projectId);
  const fb = b.frameLocator('iframe'); await fb.locator('#measureCanvas').waitFor();
  const draw = async (p, f, start, end) => {
    const box=await f.locator('#measureCanvas').boundingBox();
    await p.mouse.move(box.x+box.width*start[0],box.y+box.height*start[1]);await p.mouse.down();
    await p.mouse.move(box.x+box.width*end[0],box.y+box.height*end[1],{steps:6});await p.mouse.up();
  };
  await draw(a, fa, [.15,.13],[.8,.13]);
  if (Object.keys([...rows.values()][0].payload.annotations).length) throw Error('Browse mode created an annotation');
  await fa.locator('#toggleEdit').click(); await fb.locator('#toggleEdit').click();
  await draw(a, fa, [.15,.13],[.8,.13]); await fa.locator('#labelInput').fill('宽 120 cm');
  await fb.locator('.list-select strong', { hasText: '宽 120 cm' }).waitFor();
  await fb.locator('#circleTool').click(); await draw(b, fb, [.5,.55],[.65,.55]); await fb.locator('#labelInput').fill('直径 30 cm');
  await fa.locator('.list-select strong', { hasText: '直径 30 cm' }).waitFor();
  if (!(await fa.locator('#listItems').innerText()).includes('员工B')) throw Error('Missing employee attribution');
  await fa.locator('#rectTool').click(); await draw(a, fa, [.08,.7],[.25,.9]); await fa.locator('#topLabelInput').fill('深 60 cm');
  await fb.locator('.list-select strong', { hasText: '深 60 cm' }).waitFor();
  // Independent offline modifications are restored after a page reload.
  offline.add(a);
  await fa.locator('#topLabelInput').fill('深 65 cm');
  await fa.locator('#syncStatus', { hasText: '本机' }).waitFor();
  await fb.locator('.list-select').filter({ hasText:'宽 120 cm' }).click(); await fb.locator('#labelInput').fill('宽 125 cm');
  await fb.locator('#syncStatus', { hasText: '已保存至云端' }).waitFor();
  offline.delete(a);
  await a.evaluate(() => { const old=document.querySelector('iframe'); old.replaceWith(old.cloneNode()); });
  await fa.locator('.list-select strong', { hasText: '宽 125 cm' }).waitFor();
  await fb.locator('.list-select strong', { hasText: '深 65 cm' }).waitFor();
  // Same-annotation concurrent edits preserve a conflict copy.
  await fa.locator('#toggleEdit').click();
  await fa.locator('.list-select').filter({hasText:'宽 125 cm'}).click();
  offline.add(a); await fa.locator('#labelInput').fill('宽 130 cm');
  await fb.locator('#labelInput').fill('宽 140 cm'); await fb.locator('#syncStatus', {hasText:'已保存至云端'}).waitFor();
  offline.delete(a); await fa.locator('#retryButton').click(); await fa.locator('#conflictPanel').waitFor();
  await fa.locator('#copyConflict').click(); await fb.locator('.list-select strong', {hasText:'宽 130 cm'}).waitFor();
  const downloadPromise=a.waitForEvent('download');await fa.locator('#exportImage').click();const download=await downloadPromise;
  await download.saveAs('output/playwright/' + download.suggestedFilename());
  await a.frames()[1].evaluate(()=>{document.getElementById('sidePanel').scrollTop=0;document.activeElement?.blur();});
  await a.screenshot({path:'output/playwright/dimensions-desktop.png',fullPage:true});
  await a.setViewportSize({width:390,height:844});
  await a.evaluate(()=>document.documentElement.dataset.theme='dark');
  await a.screenshot({path:'output/playwright/dimensions-mobile-dark.png',fullPage:true});
  const overflow=await a.frames()[1].evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)throw Error('Mobile horizontal overflow');
  await fa.locator('#libraryButton').click(); await fa.locator('#projectSearch').fill('员工A');
  await fa.locator('.project-card').waitFor();
  await fa.locator('.project-preview img').waitFor();
  await a.frames()[1].waitForFunction(() => document.querySelector('.project-preview img')?.naturalWidth > 0);
  const previewSize = await fa.locator('.project-preview img').evaluate(img => img.naturalWidth);
  if (!previewSize || previewSize > 480) throw Error('Thumbnail did not load at the expected size');
  await a.screenshot({path:'output/playwright/dimensions-library-mobile.png',fullPage:true});
  if(errors.length)throw Error(errors.join('\n'));
  const result = { passed:true, scenarios:['shared upload','line / circle / rectangle','employee attribution','two employee realtime','offline reopen and merge','same-annotation conflict copy','PNG export','390px dark theme','library employee search'], projects:rows.size,annotations:Object.keys([...rows.values()][0].payload.annotations).length,productionWrites:0 };
  await a.evaluate(result => { window.__dimensionBrowserResult = result; }, result);
  return result;
}
