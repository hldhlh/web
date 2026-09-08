async page => {
  const base='http://127.0.0.1:8772';
  const source=await (await page.request.get(base+'/apps/academy/app.js')).text();
  await page.route('**/task-layout-fixture',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><link rel="stylesheet" href="/apps/academy/style.css"><link rel="stylesheet" href="/apps/academy/appearance.css"><body><div class="app"><main id="view"></main></div></body>`}));
  const results=[];
  for(const variant of [{width:390,theme:'light'},{width:1280,theme:'dark'},{width:320,theme:'light',large:true}]) {
    await page.setViewportSize({width:variant.width,height:800});
    await page.emulateMedia({reducedMotion:'reduce',contrast:'more'});
    await page.goto(base+'/task-layout-fixture');
    results.push(await page.evaluate(async ({source,variant})=>{
      document.documentElement.dataset.theme=variant.theme;
      if(variant.large)document.documentElement.style.fontSize='24px';
      const target=document.getElementById('view');
      target.style.cssText='display:block;max-width:900px;margin:0 auto;padding:16px';
      const task=title=>`<button class="learning-task"><span class="task-status"></span><span class="task-main"><strong>${title}</strong><small>课程 · 10分钟</small></span><span>›</span></button>`;
      target.innerHTML=`<div style="height:500px"></div><section class="learning-plan"><header class="learning-plan-head"><h3>任务面板</h3></header><div class="stage-tabs"><button class="stage-tab on" data-stage-target="one">阶段 1</button><button class="stage-tab" data-stage-target="two">阶段 2</button></div><div class="learning-stages"><section class="learning-stage" id="one" data-stage-key="one"><div class="task-list">${Array.from({length:15},()=>task('前厅岗位服务培训')).join('')}</div></section><section class="learning-stage" id="two" data-stage-key="two" hidden><div class="task-list">${task('短任务')}</div></section></div></section><div id="after">下一模块</div><div style="height:1000px"></div>`;
      const start=source.indexOf('    target.querySelectorAll("[data-stage-target]").forEach');
      const binding=source.slice(start,source.indexOf('\n  const CourseSearch',start)).replace(/\n  }\s*$/,'');
      target.querySelector('.learning-plan').dataset.homeBlock='tasks';
      const helper=source.slice(source.indexOf('  function preserveTaskPosition('),source.indexOf('  function renderHome('));
      const preserve=new Function('target',helper+binding+';return preserveTaskPosition;')(target);
      window.scrollTo(0,420);
      const one=document.getElementById('one'),two=document.getElementById('two'),board=target.querySelector('.learning-plan');
      const measure=()=>[board.getBoundingClientRect().y,board.getBoundingClientRect().height,document.getElementById('after').getBoundingClientRect().y,window.scrollY];
      const before=measure();
      target.querySelector('[data-stage-target="two"]').click();
      const short=measure();
      if(before.some((v,i)=>Math.abs(v-short[i])>1))throw Error('Switching to a shorter stage changed surrounding layout');
      if(getComputedStyle(one).visibility!=='hidden')throw Error('Inactive stage is visible');
      preserve(target,()=>{two.querySelector('.task-list').innerHTML=Array.from({length:25},()=>task('这是一条用于验证任务面板不会因标题长度而上下跳动的完整长标题'.repeat(4))).join('');});
      await new Promise(requestAnimationFrame);
      const after=measure();
      if([0,3].some(i=>Math.abs(before[i]-after[i])>1 || Math.abs(before[i]-short[i])>1))throw Error(JSON.stringify({variant,before,short,after}));
      if(after[1]<=short[1] || after[2]<=short[2])throw Error('Panel must grow downward naturally');
      if(two.scrollHeight>two.clientHeight+1)throw Error('Unexpected nested scroll area');
      target.querySelector('[data-stage-target="one"]').click();
      await new Promise(requestAnimationFrame);
      const switched=measure();
      if(after.some((v,i)=>Math.abs(v-switched[i])>1))throw Error('Switching away from long titles changed layout');
      target.querySelector('[data-stage-target="two"]').click();
      window.scrollTo(0,document.documentElement.scrollHeight);
      const bottomY=window.scrollY;
      preserve(target,()=>{two.querySelector('.task-list').innerHTML=task('短任务');});
      await new Promise(requestAnimationFrame);
      if(Math.abs(window.scrollY-bottomY)>1)throw Error('Shortening near page bottom moved the viewport');
      return {...variant,stageSwitchStable:true,topStable:true,naturalHeight:true,bottomClampPrevented:true};
    },{source,variant}));
  }
  return {passed:true,results,productionWrites:0};
}
