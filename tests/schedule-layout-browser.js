async page => {
  const base='http://127.0.0.1:8772';
  await page.route('**/pages/schedule/bootstrap.js', route=>route.fulfill({contentType:'text/javascript',body:''}));
  await page.route('https://**', route=>route.abort());
  const results=[];
  for (const variant of [{width:390,theme:'light'},{width:1280,theme:'dark'},{width:320,theme:'light'},{width:1024,theme:'light',large:true}]) {
    await page.setViewportSize({width:variant.width,height:900});
    await page.emulateMedia({reducedMotion:'reduce',contrast:'more'});
    await page.goto(base+'/apps/academy/pages/schedule/index.html');
    await page.evaluate(variant=>{
      localStorage.removeItem('academy-schedule-cache-v1');
      document.documentElement.dataset.theme=variant.theme;
      if(variant.large) document.documentElement.style.fontSize='24px';
      const today=new Date(),key=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      const people=Array.from({length:5},(_,i)=>({id:String(i+1),name:'测试员工'+i,role:i===0?'manager':'staff'}));
      window.SCHEDULE_USES_PARENT_RUNTIME=true;
      window.AcademyAuth={session:people[0],list:()=>people,isManager:s=>s.role==='manager',pull:async()=>{},onChange:()=>()=>{}};
      const cloud=new Promise(resolve=>window.resolveSchedule=()=>resolve({rev:1,assignments:{[key]:people.map(p=>({userId:p.id,shift:'morning'}))}}));
      window.AcademyStore={getJSON:async(path,options)=>options?.cached?null:cloud,channel:()=>({unsubscribe(){}})};
    },variant);
    const geometry=()=>page.evaluate(()=>Object.fromEntries(['.schedule-header','.calendar-card','#calendar-grid','.day-panel','.calendar-day .day-number'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return [selector,{x:r.x,y:r.y,width:r.width,height:r.height}]})));
    const initial=await geometry();
    await page.addScriptTag({url:base+'/apps/academy/framework/stable-view.js'});
    await page.addScriptTag({url:base+'/apps/academy/pages/schedule/app.js'});
    await page.waitForFunction(()=>document.getElementById('schedule-app').getAttribute('aria-busy')==='false');
    const cached=await geometry();
    await page.evaluate(()=>window.resolveSchedule());
    await page.waitForFunction(()=>document.getElementById('sync-status').textContent==='');
    const cloud=await geometry();
    for(const selector of ['.schedule-header','.calendar-card','#calendar-grid','.calendar-day .day-number']) {
      for(const field of ['x','y','width','height']) for(const stage of [cached,cloud]) {
        if(Math.abs(initial[selector][field]-stage[selector][field])>1) throw Error(JSON.stringify({variant,selector,field,initial:initial[selector],actual:stage[selector]}));
      }
    }
    if(Math.abs(initial['.day-panel'].y-cloud['.day-panel'].y)>1) throw Error('Day panel moved during startup');
    const details=await page.evaluate(()=>({cells:document.querySelectorAll('button.calendar-day').length,editable:!document.getElementById('edit-day').hidden,overflow:document.documentElement.scrollWidth>innerWidth}));
    if(details.cells!==42 || !details.editable || details.overflow) throw Error(JSON.stringify(details));
    results.push({...variant,stable:true,...details});
  }
  return {passed:true,productionWrites:0,results};
}
