async page => {
  const origin = 'http://127.0.0.1:8775', names = ['notes','jlhcdh','schedule','feedback','dimensions','store-model','meat-template'];
  const errors = [], results = []; let current;
  page.on('pageerror', error => errors.push({app:current,error:error.message}));
  if (page.routeWebSocket) await page.routeWebSocket('**', socket => socket.close());
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) {
      if (!['GET','HEAD','OPTIONS'].includes(request.method())) throw Error('Unexpected write: '+request.method());
      return route.fulfill({json:url.pathname.endsWith('/jlhcdh_products')?[{id:1,name:'牛肉',location:'后厨',unit:'斤',tags:['肉类'],is_deleted:false}]:[],headers:{'access-control-allow-origin':'*','content-range':'0-0/0'}});
    }
    if (url.pathname === '/subprogram-assets-test') {
      const name=url.searchParams.get('app');
      return route.fulfill({contentType:'text/html',body:`<!doctype html><script src="/_site/apps/vendor/supabase.min.js"></script><script>
        const actor={id:'test',name:'测试员工',role:'manager'};
        window.AcademyAuth={session:actor,canShortcut:()=>true,isManager:()=>true,list:()=>[actor],onChange:()=>()=>{},start:async()=>{},pull:async()=>{},connectRealtime(){}};
        window.ACADEMY_CONFIG={url:'https://mock.invalid',table:'academy_progress',bucket:'cloud-files',key:'test'};
        window.AcademyStore={getJSON:async()=>({rev:1,items:[],assignments:{}}),headers:x=>x||{},objectUrl:p=>'https://mock.invalid/storage/'+p,channel:()=>({unsubscribe(){},send:async()=>{}})};
        </script><iframe style="width:100%;height:900px;border:0" src="/_site/apps/academy/pages/${name}/index.html"></iframe>`});
    }
    return route.continue();
  });
  for (const name of names) {
    current=name;
    if (name==='jlhcdh') await page.evaluate(()=>localStorage.removeItem('jlhcdh-products-v2'));
    await page.goto(origin+'/subprogram-assets-test?app='+name);
    const frame=page.frames()[1];
    if (['schedule','feedback'].includes(name)) await frame.waitForFunction(name=>document.getElementById(name+'-app')?.getAttribute('aria-busy')==='false',name);
    else if(name==='dimensions') await frame.waitForFunction(()=>!!window.DimensionCollab);
    else if(name==='notes') await frame.waitForFunction(()=>!!window.__jlbjSupabaseClient && typeof window.saveData==='function');
    else if(name==='jlhcdh') {
      await frame.waitForFunction(()=>!!window.OrderCartSync);
      await frame.waitForFunction(()=>state.products.length>0);
      await frame.locator('#searchInput').fill('beef');
      await frame.waitForFunction(()=>!!window.pinyinPro);
      await frame.evaluate(()=>initDatePickers());
    }
    else if(name==='store-model') await frame.locator('#loading').waitFor({state:'hidden',timeout:90000});
    else await frame.waitForFunction(()=>!!window.MeatTemplate && document.getElementById('item-grid').children.length>0);
    const resources=await frame.evaluate(()=>performance.getEntriesByType('resource').filter(r=>/\.m?js(?:\?|$)/.test(r.name)).map(r=>({url:r.name,count:performance.getEntriesByName(r.name).length})));
    if(resources.some(r=>r.count>1))throw Error(name+': duplicate script request');
    if(resources.some(r=>!/[?&]v=[a-f0-9]{16}/.test(r.url)))throw Error(name+': unversioned script '+JSON.stringify(resources));
    results.push({name,scripts:resources.length,hashed:true,duplicates:0});
  }
  if(errors.length)throw Error(JSON.stringify(errors));
  return {passed:true,results,productionWrites:0};
}
