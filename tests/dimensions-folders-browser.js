async page => {
  const origin = 'http://127.0.0.1:8775', rows = new Map(), files = new Map();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const host = `<!doctype html><html><meta charset="utf-8"><body style="margin:0"><script>
  window.AcademyAuth={session:{id:'A',name:'员工A'},canShortcut:()=>true,onChange:()=>()=>{}};
  window.ACADEMY_CONFIG={url:'https://folders.invalid',table:'academy_progress',key:'test'};
  window.AcademyStore={origin:()=>ACADEMY_CONFIG.url,headers:x=>x||{},objectUrl:p=>ACADEMY_CONFIG.url+'/storage/'+p};
  window.supabase={createClient:()=>({channel:()=>({on(){return this},subscribe(fn){queueMicrotask(()=>fn('SUBSCRIBED'));return this},send:()=>Promise.resolve(),track:()=>Promise.resolve(),presenceState:()=>({})}),removeChannel(){},removeAllChannels(){}})};
  </script><iframe src="/apps/academy/pages/dimensions/index.html" style="width:100%;height:100vh;border:0"></iframe></body></html>`;
  await page.route('**/*', async route => {
    const req=route.request(), url=new URL(req.url());
    if(url.origin===origin) return url.pathname==='/folders-test' ? route.fulfill({contentType:'text/html',body:host}) : route.continue();
    if(url.origin!=='https://folders.invalid') return route.abort();
    if(url.pathname.startsWith('/storage/')) { if(req.method()==='POST'){files.set(url.pathname,req.postDataBuffer());return route.fulfill({json:{}});} return files.has(url.pathname)?route.fulfill({contentType:'image/png',body:files.get(url.pathname)}):route.fulfill({status:404}); }
    if(url.pathname.includes('/rpc/dimension_folder_action')) {
      const {folder_id:id,operation,target_id:target,expected_token:token}=req.postDataJSON();
      const source=rows.get('doc:dimension-folder:'+id);if(!source)return route.fulfill({status:400,json:{message:'文件夹已不存在'}});
      const ids=new Set([id]);let changed=true;
      while(changed){changed=false;for(const r of rows.values())if(r.payload.meta.kind==='folder'&&ids.has(r.payload.meta.parentId)&&!ids.has(r.payload.meta.id)){ids.add(r.payload.meta.id);changed=true;}}
      const projects=[...rows.values()].filter(r=>r.user_id.startsWith('doc:dimensions:')&&ids.has(r.payload.meta.folderId));
      const fingerprint=JSON.stringify([...rows.values()].filter(r=>ids.has(r.payload.meta.id)||projects.includes(r)));
      const result={name:source.payload.meta.name,token:fingerprint,folders:ids.size-1,projects:projects.length,parentId:source.payload.meta.parentId||''};
      if(operation==='inspect')return route.fulfill({json:result});
      if(token!==fingerprint)return route.fulfill({status:400,json:{message:'目录内容已变化，请重新确认'}});
      if(operation==='move'){
        if(ids.has(target))return route.fulfill({status:400,json:{message:'不能移入自身或子目录'}});
        source.payload.meta.parentId=target;
      }else{
        for(const project of projects)if(operation==='delete_keep')project.payload.meta.folderId=result.parentId;else rows.delete(project.user_id);
        for(const fid of ids)rows.delete('doc:dimension-folder:'+fid);
      }
      return route.fulfill({json:{...result,done:true}});
    }
    const filter=url.searchParams.get('user_id'), id=filter?.slice(3); let result=[];
    if(req.method()==='POST'){const row=req.postDataJSON();rows.set(row.user_id,row);result=[row];}
    else if(req.method()==='PATCH'){const old=rows.get(id);if(old && String(old.ts)===url.searchParams.get('ts')?.slice(3)){const row={...old,...req.postDataJSON()};rows.set(id,row);result=[row];}}
    else if(filter?.startsWith('eq.'))result=rows.has(id)?[rows.get(id)]:[];
    else {
      const prefix=filter.slice(5,-1), folder=url.searchParams.get('payload->meta->>folderId')?.slice(3)||'';
      result=[...rows.values()].filter(r=>r.user_id.startsWith(prefix)&&(prefix.includes('folder')||(r.payload.meta.folderId||'')===folder)).map(r=>({meta:r.payload.meta}));
    }
    return route.fulfill({json:result});
  });
  await page.goto(origin+'/folders-test'); await page.frameLocator('iframe').locator('#newFolder').waitFor(); let frame=page.frames()[1];
  await frame.locator('#newFolder').click();await frame.locator('#folderName').fill('后厨');await frame.locator('#saveFolder').click();
  await frame.getByRole('button',{name:'后厨',exact:true}).click();
  await frame.locator('#newFolder').click();await frame.locator('#folderName').fill('设备');await frame.locator('#saveFolder').click();
  await frame.getByRole('button',{name:'设备',exact:true}).waitFor();
  const folders=[...rows.values()];if(folders.length!==2||folders[1].payload.meta.parentId!==folders[0].payload.meta.id)throw Error('Nested folder failed');
  const cacheResult=await frame.evaluate(async()=>{
    await caches.delete('dimension-images-v1');let downloads=0;
    const api=DimensionImageCache, blob=new Blob(['image-content'],{type:'image/webp'}), hash=await api.digest(blob);
    await Promise.all([api.get('fixture',hash,async()=>{downloads++;return blob}),api.get('fixture',hash,async()=>{downloads++;return blob})]);
    return {downloads,hash};
  });
  await page.reload();await page.frameLocator('iframe').locator('#newFolder').waitFor();frame=page.frames()[1];await frame.locator('#newFolder').waitFor();
  await frame.waitForFunction(()=>!!window.DimensionImageCache);
  const cached=await frame.evaluate(async hash=>(await DimensionImageCache.get('fixture',hash,()=>{throw Error('Unexpected download after reload')})).text(),cacheResult.hash);
  if(cacheResult.downloads!==1||cached!=='image-content')throw Error('Persistent cache failed');
  await frame.getByRole('button',{name:'后厨',exact:true}).click();
  await frame.getByRole('button',{name:'设备',exact:true}).click();
  await frame.locator('#newFolder').click();await frame.locator('#folderName').fill('子目录');await frame.locator('#saveFolder').click();
  await frame.getByRole('button',{name:'子目录',exact:true}).waitFor();
  const deep=[...rows.values()][2];
  await frame.locator('#folderBreadcrumb').getByRole('button',{name:'资料库',exact:true}).click();
  await frame.getByRole('button',{name:'后厨',exact:true}).waitFor();
  if(await frame.getByRole('button',{name:'子目录',exact:true}).count())throw Error('Leaked descendant');
  await frame.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=80;canvas.height=60;canvas.getContext('2d').fillRect(0,0,80,60);
    const blob=await new Promise(r=>canvas.toBlob(r));await DimensionCollab.create(new File([blob],'测试图片.png',{type:'image/png'}));
  });
  await frame.locator('#projectHeading summary').click();await frame.locator('#moveProject').click();
  await frame.locator('#folderTarget').selectOption(deep.payload.meta.id);await frame.locator('#saveFolder').click();
  await frame.locator('#folderDialog').waitFor({state:'hidden'});
  const project=[...rows.values()].find(r=>r.user_id.startsWith('doc:dimensions:'));
  if(project.payload.meta.folderId!==deep.payload.meta.id||!project.payload.meta.imageHash||Object.keys(project.payload.annotations).length)throw Error('Move or image hash failed');
  await frame.locator('#libraryButton').click();
  if(await frame.locator('.project-card').count())throw Error('Moved project still in root');
  for (const [index,name] of ['操作与收纳','餐厅家具','门窗与空间','餐具'].entries()) {
    const id='design-'+index; rows.set('doc:dimension-folder:'+id,{user_id:'doc:dimension-folder:'+id,payload:{meta:{id,kind:'folder',name,parentId:''}}});
  }
  await frame.evaluate(()=>window.dispatchEvent(new Event('online')));
  await frame.getByRole('button',{name:'餐具',exact:true}).waitFor();
  await page.evaluate(()=>document.documentElement.dataset.theme='light');
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'output/playwright/dimensions-folders-desktop.png',animations:'disabled'});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await page.screenshot({path:'output/playwright/dimensions-folders-mobile.png',animations:'disabled'});
  await frame.evaluate(()=>document.documentElement.style.fontSize='34px');
  await frame.locator('.folder-name').last().evaluate(el=>el.textContent='门窗与空间 · 一楼临街区域及后厨通道尺寸资料');
  await page.emulateMedia({reducedMotion:'reduce',contrast:'more'});
  await frame.getByRole('button',{name:'餐具',exact:true}).focus();
  if(await frame.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Large text overflows');
  await page.screenshot({path:'output/playwright/dimensions-folders-accessible.png',animations:'disabled'});
  await frame.evaluate(()=>document.documentElement.style.fontSize='');
  await page.emulateMedia({reducedMotion:'reduce',contrast:'no-preference'});
  await frame.getByRole('button',{name:'管理文件夹：后厨',exact:true}).click();
  await frame.locator('#chooseMoveFolder').click();
  const targets=await frame.locator('#manageFolderTarget option').evaluateAll(options=>options.map(o=>o.value));
  if(targets.includes(folders[0].payload.meta.id)||targets.includes(deep.payload.meta.id))throw Error('Invalid move targets offered');
  await frame.locator('#manageFolderTarget').selectOption('design-0');await frame.locator('#confirmManageFolder').click();
  await frame.locator('#manageFolderDialog').waitFor({state:'hidden'});
  if(folders[0].payload.meta.parentId!=='design-0'||project.payload.meta.folderId!==deep.payload.meta.id)throw Error('Folder move changed contents');
  await frame.getByRole('button',{name:'操作与收纳',exact:true}).click();
  await frame.getByRole('button',{name:'管理文件夹：后厨',exact:true}).click();await frame.locator('#chooseDeleteFolder').click();
  if(!(await frame.locator('#manageFolderStatus').textContent()).includes('1 张图片'))throw Error('Missing impact count');
  await page.screenshot({path:'output/playwright/dimensions-folder-delete-mobile.png',animations:'disabled'});
  await frame.locator('#cancelManageFolder').click();
  if(!rows.has(folders[0].user_id))throw Error('Cancel deleted folder');
  await frame.getByRole('button',{name:'管理文件夹：后厨',exact:true}).click();await frame.locator('#chooseDeleteFolder').click();
  await frame.locator('#confirmManageFolder').click();await frame.locator('#manageFolderDialog').waitFor({state:'hidden'});
  if(rows.has(folders[0].user_id)||project.payload.meta.folderId!=='design-0')throw Error('Keep images deletion failed');
  await frame.locator('#folderBreadcrumb').getByRole('button',{name:'资料库',exact:true}).click();
  await frame.getByRole('button',{name:'管理文件夹：操作与收纳',exact:true}).click();await frame.locator('#chooseDeleteFolder').click();
  await frame.locator('[name="deleteFolderMode"][value="delete_all"]').check();await frame.locator('#confirmManageFolder').click();
  await frame.locator('#manageFolderDialog').waitFor({state:'hidden'});
  if(rows.has(project.user_id)||rows.has('doc:dimension-folder:design-0'))throw Error('Recursive deletion failed');
  if(errors.length)throw Error(errors.join(';'));
  return {passed:true,checks:['create folders','three levels','persist folders','breadcrumb','scoped listing','SHA-256','concurrent deduplication','cache after reload','upload content hash','move image to nested folder','move subtree','exclude descendant targets','deletion counts','cancel deletion','delete keeping images','delete all projects'],productionWrites:0};
}
