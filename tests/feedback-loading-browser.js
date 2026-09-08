async page => {
  const base='http://127.0.0.1:8772';
  const html=await (await page.request.get(base+'/apps/academy/pages/feedback/index.html')).text();
  const app=await (await page.request.get(base+'/apps/academy/pages/feedback/app.js')).text();
  const stable=await (await page.request.get(base+'/apps/academy/framework/stable-view.js')).text();
  await page.route('**/feedback-fixture',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'')}));
  await page.goto(base+'/feedback-fixture');
  return page.evaluate(async ({app,stable})=>{
    const assert=(ok,message)=>{if(!ok)throw new Error(message)};
    const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
    const item={id:'existing',title:'缓存反馈',detail:'已经保存的内容',status:'open',category:'wish',createdAt:1,createdBy:{id:'test',name:'测试'}};
    let current={rev:1,items:[item]}, releaseCache;
    let remoteCalls=0,writes=0,resolveRemote;
    localStorage.setItem('academy-daily-feedback-cache-v1',JSON.stringify(current));
    window.FEEDBACK_USES_PARENT_RUNTIME=true;
    window.AcademyAuth={session:{id:'test',name:'测试',role:'manager'},isManager:()=>true,onChange:()=>()=>{}};
    window.AcademyStore={
      getJSON:(_,options)=>options?.cached?new Promise(resolve=>{releaseCache=resolve}):new Promise(resolve=>{remoteCalls++;resolveRemote=resolve}),
      putJSON:async(_,next,{base})=>{assert(base.items.length===1,'write uses captured merge base');writes++;current=next},
      channel:()=>({unsubscribe(){},send(){throw new Error('premature broadcast')}})
    };
    new Function(stable)();new Function(app)();
    assert(document.querySelector('#feedback-list').textContent.includes('缓存反馈'),'cached content paints without waiting for IndexedDB');
    assert(document.querySelector('#submit-feedback').disabled,'writes wait for durable hydration');
    const card=document.querySelector('.feedback-item');
    releaseCache(current);await tick();
    assert(!document.querySelector('#submit-feedback').disabled,'writes enabled after hydration');
    assert(card===document.querySelector('.feedback-item'),'hydration retains existing card');
    document.querySelector('#open-compose').click();
    document.querySelector('#feedback-title').value='新的愿望';
    document.querySelector('#feedback-detail').value='希望增加一个建议';
    document.querySelector('#submit-feedback').click();await tick();
    assert(writes===1 && document.querySelector('#compose-sheet').hidden,'durable local save closes compose without network wait');
    assert(document.querySelector('#feedback-list').textContent.includes('新的愿望'),'saved feedback immediately visible');
    resolveRemote({rev:Date.now()+1000,items:[item]});await tick();
    assert(document.querySelector('#feedback-list').textContent.includes('新的愿望'),'older inflight response does not erase submitted feedback');
    assert(remoteCalls===2,'one catch-up after interrupted read');
    resolveRemote(current);await tick();
    assert(document.querySelector('#sync-status').textContent==='','no lingering inline sync message');
    return {passed:true,scenarios:['cache-first paint','safe hydration','stable card','local-first submission','read/write race protection','quiet status'],productionWrites:0};
  },{app,stable});
}
