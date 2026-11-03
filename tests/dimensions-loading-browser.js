async page => {
  const origin='http://127.0.0.1:8775', remote='https://loading.invalid';
  const folder='10000000-0000-4000-8000-000000000001', other='10000000-0000-4000-8000-000000000002';
  const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
  const metas=Array.from({length:4},(_,i)=>({id:id(i),name:'后厨设备 '+i,folderId:folder,createdBy:{id:'A',name:'员工A'},updatedBy:{id:'A',name:'员工A'},updatedAt:'2026-11-03',imagePath:`academy/dimensions/${id(i)}/image.png`,thumbnailPath:`academy/dimensions/${id(i)}/preview.png`}));
  const folderRows=[{meta:{id:folder,kind:'folder',name:'后厨设备',parentId:''}},{meta:{id:other,kind:'folder',name:'其他目录',parentId:''}}];
  let releaseRoot,releaseFolder,releaseImages,releaseOther;
  let rootGate=new Promise(r=>releaseRoot=r),folderGate=new Promise(r=>releaseFolder=r),imageGate=new Promise(r=>releaseImages=r),otherGate=new Promise(r=>releaseOther=r);
  let rootStarted=false,folderReads=0,imageReads=0,otherStarted=false,sample,failFolder=false;
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const host=`<!doctype html><html data-theme="light"><meta charset="utf-8"><body style="margin:0"><script>
  window.AcademyAuth={session:{id:'A',name:'员工A'},canShortcut:()=>true,onChange:()=>()=>{}};
  window.ACADEMY_CONFIG={url:'${remote}',table:'academy_progress',key:'test'};
  window.AcademyStore={origin:()=>ACADEMY_CONFIG.url,headers:x=>x||{},objectUrl:p=>ACADEMY_CONFIG.url+'/storage/'+p};
  window.supabase={createClient:()=>({channel:()=>({on(){return this},subscribe(f){queueMicrotask(()=>f('SUBSCRIBED'));return this},send:()=>Promise.resolve()}),removeAllChannels(){}})};
  </script><iframe src="/apps/academy/pages/dimensions/index.html" style="width:100%;height:100vh;border:0"></iframe></body></html>`;
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin===origin)return url.pathname==='/loading-test'?route.fulfill({contentType:'text/html',body:host}):route.continue();
    if(url.origin!==remote)return route.abort();
    if(url.pathname.startsWith('/storage/')){
      imageReads++;await imageGate;
      return route.fulfill({contentType:'image/png',body:Buffer.from(sample,'base64')});
    }
    if(url.searchParams.get('user_id')?.includes('dimension-folder'))return route.fulfill({json:folderRows});
    const selected=url.searchParams.get('payload->meta->>folderId')?.slice(3);
    if(selected===folder){folderReads++;await folderGate;if(failFolder)return route.fulfill({status:503});return route.fulfill({json:metas.map(meta=>({meta}))});}
    if(selected===other){otherStarted=true;await otherGate;return route.fulfill({json:[{meta:{...metas[0],name:'不应出现在后厨的图片',folderId:other}}]});}
    rootStarted=true;await rootGate;return route.fulfill({json:[]});
  });
  await page.setViewportSize({width:1280,height:900});await page.goto(origin+'/loading-test');
  let frame=page.frames()[1];await page.frameLocator('iframe').getByRole('button',{name:'后厨设备',exact:true}).waitFor();frame=page.frames()[1];
  if(!rootStarted)throw Error('Folder and project reads were not concurrent');
  await frame.evaluate(()=>caches.delete('dimension-images-v1'));
  sample=await frame.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=140;const x=c.getContext('2d');x.fillStyle='#d6d9dc';x.fillRect(0,0,200,140);return c.toDataURL('image/png').split(',')[1];});
  await frame.getByRole('button',{name:'后厨设备',exact:true}).click();
  await frame.locator('#catalogSkeleton').waitFor({state:'visible'});
  if(await frame.locator('#libraryEmpty').isVisible())throw Error('False empty state while loading');
  if(folderReads!==1)throw Error('Folder navigation blocked by earlier request');
  releaseFolder();folderGate=Promise.resolve();
  await frame.locator('.project-preview[data-state="loading"]').first().waitFor();
  await page.screenshot({path:'output/playwright/dimensions-loading-network.png',animations:'disabled'});
  releaseImages();imageGate=Promise.resolve();
  await frame.waitForFunction(()=>document.querySelectorAll('.project-preview[data-state="ready"]').length===4);
  const networkReads=imageReads;
  await frame.locator('.project-card').first().evaluate(el=>el.__retained=true);
  await frame.evaluate(()=>{
    window.__backgroundFlashes=0;
    new MutationObserver(()=>{if(!document.getElementById('catalogLoading').hidden)window.__backgroundFlashes++;})
      .observe(document.getElementById('catalogLoading'),{attributes:true,attributeFilter:['hidden']});
  });
  const oldReads=folderReads;
  await Promise.all([
    page.waitForResponse(r=>r.url().includes('/rest/')&&r.url().includes(encodeURIComponent(folder))),
    frame.evaluate(()=>{for(let i=0;i<12;i++){window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'));}})
  ]);
  await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  if(folderReads!==oldReads+1)throw Error('Background events queued repeated refreshes');
  if(await frame.evaluate(()=>window.__backgroundFlashes))throw Error('Background synchronization displayed loading UI');
  await frame.locator('#catalogLoading').waitFor({state:'hidden'});
  if(folderReads<=oldReads||!await frame.locator('.project-card').first().evaluate(el=>el.__retained))throw Error('Unchanged refresh rebuilt cards');
  await frame.getByRole('button',{name:'资料库',exact:true}).click();
  await frame.getByRole('button',{name:'其他目录',exact:true}).click();
  await frame.locator('#catalogLoading').waitFor({state:'visible'});
  await frame.getByRole('button',{name:'资料库',exact:true}).click();
  await frame.getByRole('button',{name:'后厨设备',exact:true}).click();
  await frame.locator('.project-card').first().waitFor();
  releaseOther();otherGate=Promise.resolve();releaseRoot();rootGate=Promise.resolve();
  await frame.locator('#catalogLoading').waitFor({state:'hidden'});
  if((await frame.locator('#projectList').textContent()).includes('不应出现'))throw Error('Stale response replaced current folder');
  if(imageReads!==networkReads)throw Error('Warm folder fetched images again');
  failFolder=true;await frame.evaluate(()=>window.dispatchEvent(new Event('online')));
  await frame.locator('#retryCatalog').waitFor({state:'visible'});
  if(await frame.locator('.project-card').count()!==4)throw Error('Network failure cleared cached cards');
  failFolder=false;await frame.locator('#retryCatalog').click();await frame.locator('#catalogLoading').waitFor({state:'hidden'});
  await page.reload();await page.frameLocator('iframe').getByRole('button',{name:'后厨设备',exact:true}).waitFor();frame=page.frames()[1];
  await frame.evaluate(()=>{
    const original=caches.open.bind(caches);const gate=new Promise(r=>window.__releaseCache=r);
    caches.open=async(...args)=>{const cache=await original(...args),match=cache.match.bind(cache);cache.match=async(...a)=>{await gate;return match(...a)};return cache;};
  });
  await frame.getByRole('button',{name:'后厨设备',exact:true}).click();
  await frame.locator('.project-preview[data-state="loading"]').first().waitFor();
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await page.emulateMedia({reducedMotion:'reduce'});
  await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:'output/playwright/dimensions-loading-cache.png',animations:'disabled'});
  if(await frame.locator('.preview-state').first().textContent()!=='加载中')throw Error('No cache loading feedback');
  await frame.evaluate(()=>window.__releaseCache());
  await frame.waitForFunction(()=>document.querySelectorAll('.project-preview[data-state="ready"]').length===4);
  if(imageReads!==networkReads)throw Error('Reload ignored persistent cache');
  if(errors.length)throw Error(errors.join(';'));
  return {passed:true,imageReads,folderReads,checks:['parallel first load','folders visible before project response','immediate loading state','no false empty state','network preview loading','unchanged cards retained','rapid folder switching','warm folder reuse','persistent cache feedback','reduced motion','failure retains cards','explicit retry','silent background sync','event storm coalescing']};
}
