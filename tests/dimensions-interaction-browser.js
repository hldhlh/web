async page => {
  const origin = 'http://127.0.0.1:8775';
  await page.route('**/*', route => {
    if (!route.request().url().startsWith(origin)) return route.abort();
    if (route.request().url().endsWith('/bootstrap.js')) return route.fulfill({contentType:'application/javascript',body:`
      window.writes=[]; window.testItems=[];
      window.DimensionCollab={actor:{id:'A'}, edit(item,deleted){ writes.push({item:structuredClone(item),deleted});testItems=testItems.filter(x=>x.id!==item.id);if(!deleted)testItems.push(structuredClone(item));DimensionEditor.applyAnnotations(testItems); }};
      const s=document.createElement('script');s.src='editor.js';document.head.append(s);
    `});
    return route.continue();
  });
  await page.setViewportSize({width:390,height:844});
  await page.goto(origin+'/apps/academy/pages/dimensions/index.html');
  await page.waitForFunction(()=>!!window.DimensionEditor);
  await page.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=900;c.height=650;const x=c.getContext('2d');x.fillStyle='#dcd3c3';x.fillRect(0,0,900,650);x.fillStyle='#b59b7d';x.fillRect(170,150,500,280);
    const blob=await new Promise(r=>c.toBlob(r));await DimensionEditor.openImage(blob,'工作台尺寸.jpg');
    document.body.dataset.view='editor';document.getElementById('workspace').hidden=false;document.getElementById('library').hidden=true;document.getElementById('projectHeading').hidden=false;document.getElementById('projectTitle').textContent='工作台尺寸.jpg';
    testItems=[{id:'line-a',type:'line',start:{x:150,y:100},end:{x:700,y:100},label:'宽 120 cm',style:'light',labelPosition:'center',createdBy:{id:'A',name:'员工A'}}];DimensionEditor.applyAnnotations(testItems);
  });
  const assert = (value,message)=>{if(!value)throw Error(message);};
  const count=()=>page.evaluate(()=>writes.length);
  const mouseDrag=async(a,b)=>{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});await page.mouse.up();};
  let box=await page.locator('#measureCanvas').boundingBox();
  const position=(x,y)=>({x:box.x+box.width*x,y:box.y+box.height*y});
  await mouseDrag(position(.15,.4),position(.8,.4));assert(await count()===0,'Browse dragging mutated an annotation');
  await page.locator('.list-select').click();
  assert(await page.locator('#labelInput').isDisabled(),'Browse text is editable');
  await page.keyboard.press('Control+z');assert(await count()===0,'Browse undo mutated data');
  const selection=await page.evaluate(()=>{const c=document.getElementById('selectionCanvas');return c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0);});
  assert(selection,'Selection overlay is blank');
  const baseBefore=await page.locator('#measureCanvas').evaluate(c=>c.toDataURL());
  await page.locator('#toggleEdit').click();
  box=await page.locator('#measureCanvas').boundingBox();
  // Real browser touch events exercise pointer capture and second-finger arbitration.
  const cdp=await page.context().newCDPSession(page);
  const touch=async(type,points)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({id:p.id,x:p.x,y:p.y,radiusX:5,radiusY:5,force:1}))});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
  const a={id:1,...position(.32,.5)},b={id:2,...position(.68,.5)};
  await touch('touchStart',[a]);
  await touch('touchMove',[{...a,y:a.y+18}]);
  await touch('touchStart',[{...a,y:a.y+18},b]);
  const beforeZoom=await page.locator('#zoomValue').innerText();
  await touch('touchMove',[{...a,x:a.x-40,y:a.y-20},{...b,x:b.x+40,y:b.y+20}]);
  const afterZoom=await page.locator('#zoomValue').innerText();
  assert(beforeZoom!==afterZoom,'Pinch did not zoom');
  await touch('touchEnd',[{...a,x:a.x-40,y:a.y-20}]);
  await touch('touchMove',[{...a,x:a.x-10,y:a.y+30}]);await touch('touchEnd',[]);
  assert(await count()===0,'Pinch committed the first-finger draft or a remaining-finger mark');
  // A second finger must also restore a partially moved existing endpoint.
  await page.locator('#fitCanvas').click();box=await page.locator('#measureCanvas').boundingBox();
  const h={id:3,...position(150/900,100/650)},other={id:4,...position(.7,.6)};
  await touch('touchStart',[h]);await touch('touchMove',[{...h,x:h.x+22,y:h.y+15}]);
  await touch('touchStart',[{...h,x:h.x+22,y:h.y+15},other]);await touch('touchEnd',[other]);await touch('touchEnd',[]);
  assert(await count()===0,'Second finger saved an endpoint edit');
  assert(await page.locator('#measureCanvas').evaluate(c=>c.toDataURL())===baseBefore,'Endpoint edit was not rolled back');
  // Zoom in, then translate both fingers equally: scale stays fixed, canvas moves.
  await page.locator('#zoomIn').click();await page.locator('#zoomIn').click();await page.locator('#zoomIn').click();
  const viewport=await page.locator('#viewport').boundingBox();
  const p={id:5,x:viewport.x+120,y:viewport.y+100},q={id:6,x:viewport.x+230,y:viewport.y+100};
  await touch('touchStart',[p]);await touch('touchStart',[p,q]);
  const scrollBefore=await page.locator('#viewport').evaluate(e=>[e.scrollLeft,e.scrollTop]);
  const panZoom=await page.locator('#zoomValue').innerText();
  await touch('touchMove',[{...p,x:p.x-45,y:p.y-30},{...q,x:q.x-45,y:q.y-30}]);
  const scrollAfter=await page.locator('#viewport').evaluate(e=>[e.scrollLeft,e.scrollTop]);
  assert(scrollBefore.some((v,i)=>Math.abs(v-scrollAfter[i])>10),'Two-finger translation did not pan');
  assert(await page.locator('#zoomValue').innerText()===panZoom,'Two-finger translation changed zoom');
  await touch('touchCancel',[]);assert(await count()===0,'Touch cancellation wrote data');
  await page.locator('#fitCanvas').click();
  box=await page.locator('#measureCanvas').boundingBox();
  const interrupted={id:7,...position(.2,.8)};
  await touch('touchStart',[interrupted]);await touch('touchMove',[{...interrupted,x:interrupted.x+60}]);await touch('touchCancel',[]);
  assert(await count()===0,'Cancelled single-finger drawing was committed');
  await mouseDrag(position(.15,.65),position(.8,.65));assert(await count()===1,'Explicit edit mode did not create exactly one annotation');
  await page.locator('#labelInput').fill('深 60 cm');
  await page.locator('#toggleEdit').click();
  const savedCount=await count();
  box=await page.locator('#measureCanvas').boundingBox();await mouseDrag(position(.15,.8),position(.8,.8));assert(await count()===savedCount,'Done did not lock editing');
  const browseP={id:8,...position(.3,.5)},browseQ={id:9,...position(.7,.5)};
  await touch('touchStart',[browseP]);await touch('touchStart',[browseP,browseQ]);
  const browseZoom=await page.locator('#zoomValue').innerText();
  await touch('touchMove',[{...browseP,x:browseP.x-30},{...browseQ,x:browseQ.x+30}]);
  assert(await page.locator('#zoomValue').innerText()!==browseZoom,'Browse pinch did not zoom');
  await touch('touchEnd',[]);assert(await count()===savedCount,'Browse pinch wrote data');await page.locator('#fitCanvas').click();
  await page.locator('.list-select').first().click();
  const baseSelected=await page.locator('#measureCanvas').evaluate(c=>c.toDataURL());
  await page.locator('.list-select').last().click();
  assert(await page.locator('#measureCanvas').evaluate(c=>c.toDataURL())===baseSelected,'Selection changed the export canvas');
  await page.locator('#toggleEdit').click();
  await page.locator('#labelInput').fill('深 65 cm');await page.locator('#labelInput').blur();
  await page.locator('#toggleEdit').scrollIntoViewIfNeeded();
  await page.screenshot({path:'output/playwright/dimensions-selected-mobile.png',animations:'disabled'});
  // Opening another image must always return to browse mode.
  await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=100;c.height=100;await DimensionEditor.openImage(await new Promise(r=>c.toBlob(r)),'另一个项目.png');});
  assert(await page.locator('#toggleEdit').getAttribute('aria-pressed')==='false','New project inherited editing mode');
  await cdp.detach();
  return {passed:true,checks:['browse blocks writes and undo','explicit edit and done','visible selection without export changes','pinch zoom','two-finger pan','draft cancellation','endpoint rollback','remaining finger suppression','pointer cancellation','new project resets mode'],productionWrites:0};
}
