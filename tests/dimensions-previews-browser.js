async page => {
  const origin='http://127.0.0.1:8775';
  const requests=[],rows=[];let active=0,maxActive=0,offline=true;
  const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  for(let n=1;n<=18;n++){
    const folder='academy/dimensions/'+id(n)+'/';
    rows.push({meta:{id:id(n),name:['时间戳文件名','旧项目无缩略图','缩略图已丢失','缩略图损坏','正常缩略图','暂时离线'][n-1]||'视口外项目 '+n,createdBy:{id:'A',name:'员工A'},updatedBy:{id:'A',name:'员工A'},count:4,updatedAt:'2026-09-14',imagePath:folder+(n===2?'original.jpg':'optimized-1789396427100.webp'),...(n===2?{}:{thumbnailPath:folder+(n===5?'preview.webp':'preview-1789396427100.webp')})}});
  }
  const host=`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><script>
  window.AcademyAuth={session:{id:'A',name:'员工A'},canShortcut:()=>true,onChange:()=>()=>{}};
  window.ACADEMY_CONFIG={url:'https://dimension-preview.invalid',key:'test',bucket:'test',table:'academy_progress'};
  window.AcademyStore={origin:()=>ACADEMY_CONFIG.url,headers:x=>x||{},objectUrl:path=>ACADEMY_CONFIG.url+'/storage/'+path};
  window.supabase={createClient:()=>({channel:()=>({on(){return this},subscribe(fn){queueMicrotask(()=>fn('SUBSCRIBED'));return this},send:()=>Promise.resolve()}),removeAllChannels(){}})};
  </script><iframe title="尺寸标注" src="/apps/academy/pages/dimensions/index.html" style="width:100%;height:100vh;border:0"></iframe></body></html>`;
  let sample, largeSample;
  await page.route(origin+'/preview-fixtures',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Preview fixtures</title>'}));
  await page.route(origin+'/fixture-image/*',route=>{
    if(route.request().url().endsWith('/large'))largeSample=route.request().postDataBuffer();
    else sample=route.request().postDataBuffer();
    return route.fulfill({status:204});
  });
  await page.goto(origin+'/preview-fixtures');
  await page.evaluate(async()=>{
    for(const [name,width,height] of [['large',900,700],['small',480,373]]){
      const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d');
      x.fillStyle='#e8e3da';x.fillRect(0,0,width,height);x.fillStyle='#b59b7d';x.fillRect(width*.2,height*.2,width*.6,height*.4);
      const blob=await new Promise(r=>c.toBlob(r,'image/webp',.8));await fetch('/fixture-image/'+name,{method:'POST',body:blob});
    }
  });
  await page.route('**/*',async route=>{
    const r=route.request(),url=r.url();
    if(url===origin+'/preview-test')return route.fulfill({contentType:'text/html',body:host});
    if(url.startsWith(origin))return route.continue();
    if(!url.startsWith('https://dimension-preview.invalid'))return route.abort();
    if(r.method()!=='GET')throw Error('Preview attempted a write');
    if(url.includes('/rest/'))return route.fulfill({json:rows});
    requests.push(url);active++;maxActive=Math.max(maxActive,active);
    try{
      const project=Number(url.match(/8000-(\d{12})/)[1]),isPreview=url.includes('/preview');
      if((project===3&&isPreview)||(project===6&&offline))return await route.fulfill({status:404});
      if(project===4&&isPreview)return await route.fulfill({contentType:'image/webp',body:'corrupt bytes'});
      await route.fulfill({contentType:isPreview?'image/webp':'image/png',body:isPreview?sample:largeSample});
    } finally {active--;}
  });
  await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/preview-test');
  const frame=page.frames()[1];await frame.locator('.project-card').first().waitFor();
  await frame.waitForFunction(()=>[...document.querySelectorAll('.project-preview img')].slice(0,5).every(img=>img.naturalWidth>0&&!img.hidden));
  const dimensions=await frame.locator('.project-preview img').evaluateAll(imgs=>imgs.slice(0,5).map(img=>({width:img.naturalWidth,height:img.naturalHeight})));
  if(dimensions.some(s=>Math.max(s.width,s.height)>480))throw Error('Fallback retained full-resolution image');
  if(requests.some(p=>p.includes(id(1))&&p.includes('/optimized')))throw Error('Healthy timestamp thumbnail fetched full image');
  if(requests.some(p=>p.includes(id(18))))throw Error('Offscreen image was fetched eagerly');
  const previous=requests.filter(p=>p.includes(id(1))).length;
  await frame.locator('#projectSearch').fill('时间戳');await frame.locator('.project-preview img').waitFor({state:'visible'});
  if(requests.filter(p=>p.includes(id(1))).length!==previous)throw Error('Preview cache missed after filtering');
  await frame.locator('#projectSearch').fill('');offline=false;await frame.evaluate(()=>window.dispatchEvent(new Event('online')));
  await frame.waitForFunction(()=>[...document.querySelectorAll('.project-preview img')].slice(0,6).every(img=>img.naturalWidth>0&&!img.hidden));
  await page.screenshot({path:'output/playwright/dimensions-previews-fixed.png',animations:'disabled'});
  if(maxActive>2)throw Error('Preview concurrency exceeded two');
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await page.screenshot({path:'output/playwright/dimensions-previews-mobile.png',animations:'disabled'});
  return {passed:true,checks:['timestamp filenames','legacy main image fallback','404 fallback','invalid image fallback','offline recovery','480px limit','cache reuse','lazy loading','two request concurrency'],maxActive,productionWrites:0};
}
