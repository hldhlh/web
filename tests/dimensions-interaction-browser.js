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
  // Real wheel input covers two-finger trackpad scrolling, which previously
  // entered the zoom path regardless of whether Ctrl/pinch was present.
  const trackpadViewport=await page.locator('#viewport').boundingBox();
  await page.mouse.move(trackpadViewport.x+100,trackpadViewport.y+100);
  const trackpadBefore=await page.locator('#measureCanvas').boundingBox();
  const trackpadZoom=await page.locator('#zoomValue').innerText();
  await page.mouse.wheel(40,35);
  await page.waitForFunction(({x,y})=>{const r=document.getElementById('measureCanvas').getBoundingClientRect();return Math.abs(r.x-x+40)<2&&Math.abs(r.y-y+35)<2;},trackpadBefore);
  assert(await page.locator('#zoomValue').innerText()===trackpadZoom,'Trackpad scroll unexpectedly zoomed');
  await page.keyboard.down('Control');await page.mouse.wheel(0,-30);await page.keyboard.up('Control');
  await page.waitForFunction(value=>document.getElementById('zoomValue').textContent!==value,trackpadZoom);
  await page.locator('#fitCanvas').click();box=await page.locator('#measureCanvas').boundingBox();
  await mouseDrag(position(.15,.4),position(.8,.4));assert(await count()===0,'Browse dragging mutated an annotation');
  await page.locator('#fitCanvas').click();
  await page.locator('#inspectorToggle').click();
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
  let activeTouches=[];
  // Callers specify the fingers remaining on screen. CDP touchEnd instead takes
  // the fingers being lifted, so translate the list before dispatching.
  const touch=async(type,points)=>{
    const dispatched=type==='touchEnd'?activeTouches.filter(p=>!points.some(next=>next.id===p.id)):points;
    await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:dispatched.map(p=>({id:p.id,x:p.x,y:p.y,radiusX:5,radiusY:5,force:1}))});
    activeTouches=type==='touchCancel'?[]:points;
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  };
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
  // Holding an endpoint no longer switches to canvas panning.
  await touch('touchStart',[h]);
  await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,450)));
  const holdBefore=await page.locator('#measureCanvas').boundingBox();
  await touch('touchMove',[{...h,x:h.x+35,y:h.y+25}]);
  const holdAfter=await page.locator('#measureCanvas').boundingBox();
  assert(Math.abs(holdAfter.x-holdBefore.x)<2 && Math.abs(holdAfter.y-holdBefore.y)<2,'Long press unexpectedly panned the canvas');
  await touch('touchCancel',[]);
  assert(await count()===0,'Cancelled long press committed an endpoint edit');
  assert(await page.locator('#measureCanvas').evaluate(c=>c.toDataURL())===baseBefore,'Cancelled endpoint edit changed annotation pixels');
  await page.locator('#fitCanvas').click();

  // A fitted image can pan and scale in one continuous two-finger gesture.
  const fittedViewport=await page.locator('#viewport').boundingBox();
  const freeA={id:15,x:fittedViewport.x+110,y:fittedViewport.y+90},freeB={id:16,x:fittedViewport.x+220,y:fittedViewport.y+90};
  await touch('touchStart',[freeA,freeB]);
  const freeBefore=await page.locator('#measureCanvas').boundingBox();
  const freeZoom=await page.locator('#zoomValue').innerText();
  const translated=[freeA,freeB].map(t=>({...t,x:t.x+30,y:t.y+20}));
  await touch('touchMove',translated);
  const freeAfter=await page.locator('#measureCanvas').boundingBox();
  assert(Math.abs(freeAfter.x-freeBefore.x-30)<2 && Math.abs(freeAfter.y-freeBefore.y-20)<2,'Two fingers did not freely pan the fitted image');
  assert(await page.locator('#zoomValue').innerText()===freeZoom,'Equal finger translation changed scale');
  const anchor={x:((freeA.x+freeB.x)/2-freeBefore.x)/freeBefore.width,y:((freeA.y+freeB.y)/2-freeBefore.y)/freeBefore.height};
  const combined=translated.map((t,i)=>({...t,x:t.x+10+(i?12:-12),y:t.y+15}));
  await touch('touchMove',combined);
  const combinedBox=await page.locator('#measureCanvas').boundingBox();
  assert(await page.locator('#zoomValue').innerText()!==freeZoom,'Combined gesture did not change scale');
  assert(Math.abs(combinedBox.x+anchor.x*combinedBox.width-(combined[0].x+combined[1].x)/2)<2 && Math.abs(combinedBox.y+anchor.y*combinedBox.height-(combined[0].y+combined[1].y)/2)<2,'Image anchor slipped away from the moving midpoint');
  await touch('touchEnd',[combined[0]]);
  await touch('touchMove',[{...combined[0],x:combined[0].x+20}]);await touch('touchEnd',[]);
  const releasedBox=await page.locator('#measureCanvas').boundingBox();
  assert(Math.abs(releasedBox.x-combinedBox.x)<2 && Math.abs(releasedBox.y-combinedBox.y)<2,'Remaining finger moved the canvas');
  assert(await count()===0,'Combined gesture wrote an annotation');
  await page.locator('#fitCanvas').click();
  // A third finger suspends the two-finger gesture without moving the image.
  await page.locator('#zoomIn').click();await page.locator('#zoomIn').click();await page.locator('#zoomIn').click();
  const viewport=await page.locator('#viewport').boundingBox();
  const p={id:5,x:viewport.x+120,y:viewport.y+100},q={id:6,x:viewport.x+230,y:viewport.y+100};
  await touch('touchStart',[p]);await touch('touchStart',[p,q]);
  const scrollBefore=await page.locator('#measureCanvas').boundingBox();
  const panZoom=await page.locator('#zoomValue').innerText();
  await touch('touchMove',[{...p,x:p.x-45,y:p.y-30},{...q,x:q.x-45,y:q.y-30}]);
  const scrollAfter=await page.locator('#measureCanvas').boundingBox();
  assert(Math.abs(scrollAfter.x-scrollBefore.x+45)<2 && Math.abs(scrollAfter.y-scrollBefore.y+30)<2,'Two-finger translation did not pan accurately');
  assert(await page.locator('#zoomValue').innerText()===panZoom,'Two-finger translation changed zoom');
  const movedP={...p,x:p.x-45,y:p.y-30},movedQ={...q,x:q.x-45,y:q.y-30};
  const third={id:10,x:viewport.x+170,y:viewport.y+160};
  const panStart=await page.locator('#viewport').evaluate(e=>[e.scrollLeft,e.scrollTop]);
  await touch('touchStart',[movedP,movedQ,third]);
  assert((await page.locator('#viewport').evaluate(e=>[e.scrollLeft,e.scrollTop])).every((v,i)=>Math.abs(v-panStart[i])<=1),'Adding a third finger jumped the canvas');
  const panPoints=[movedP,movedQ,third].map(t=>({...t,x:t.x-30,y:t.y-20}));
  await touch('touchMove',panPoints);
  const threeScroll=await page.locator('#viewport').evaluate(e=>[e.scrollLeft,e.scrollTop]);
  assert(panStart.every((v,i)=>Math.abs(v-threeScroll[i])<=1),'Three fingers unexpectedly panned');
  assert(await page.locator('#zoomValue').innerText()===panZoom,'Three fingers unexpectedly changed scale');
  const spreadPoints=panPoints.map((t,i)=>({...t,x:t.x+(i-1)*12}));
  await touch('touchMove',spreadPoints);
  assert(await page.locator('#zoomValue').innerText()===panZoom,'Spreading three fingers changed scale');
  const beforeLift=await page.locator('#viewport').evaluate(e=>[e.scrollLeft,e.scrollTop]);
  await touch('touchEnd',spreadPoints.slice(0,2));
  assert((await page.locator('#viewport').evaluate(e=>[e.scrollLeft,e.scrollTop])).every((v,i)=>Math.abs(v-beforeLift[i])<=1),'Returning to two fingers jumped the canvas');
  const twoAgain=spreadPoints.slice(0,2).map((t,i)=>({...t,x:t.x+(i?-18:18)}));
  await touch('touchMove',twoAgain);
  assert(await page.locator('#zoomValue').innerText()!==panZoom,'Pinch did not resume after lifting the third finger');
  await touch('touchCancel',[]);assert(await count()===0,'Touch cancellation wrote data');
  await page.locator('#fitCanvas').click();
  box=await page.locator('#measureCanvas').boundingBox();
  const interrupted={id:7,...position(.2,.8)};
  await touch('touchStart',[interrupted]);await touch('touchMove',[{...interrupted,x:interrupted.x+60}]);await touch('touchCancel',[]);
  assert(await count()===0,'Cancelled single-finger drawing was committed');
  const drawStart={id:14,...position(.15,.65)},drawEnd={id:14,...position(.8,.65)};
  await touch('touchStart',[drawStart]);await touch('touchMove',[drawEnd]);await touch('touchEnd',[]);
  assert(await count()===1,'Immediate single-finger drawing did not create exactly one annotation');
  await page.locator('#labelInput').fill('深 60 cm');
  await page.locator('#toggleEdit').click();
  const savedCount=await count();
  box=await page.locator('#measureCanvas').boundingBox();await mouseDrag(position(.15,.8),position(.8,.8));assert(await count()===savedCount,'Done did not lock editing');
  await page.locator('#fitCanvas').click();box=await page.locator('#measureCanvas').boundingBox();
  const browseP={id:8,...position(.3,.5)},browseQ={id:9,...position(.7,.5)};
  await touch('touchStart',[browseP]);await touch('touchStart',[browseP,browseQ]);
  const browseZoom=await page.locator('#zoomValue').innerText();
  await touch('touchMove',[{...browseP,x:browseP.x-30},{...browseQ,x:browseQ.x+30}]);
  assert(await page.locator('#zoomValue').innerText()!==browseZoom,'Browse pinch did not zoom');
  await touch('touchEnd',[]);assert(await count()===savedCount,'Browse pinch wrote data');
  await page.locator('#zoomIn').click();await page.locator('#zoomIn').click();
  const browseViewport=await page.locator('#viewport').boundingBox();
  const one={id:11,x:browseViewport.x+110,y:browseViewport.y+90};
  const browseStart=await page.locator('#measureCanvas').boundingBox();
  await touch('touchStart',[one]);await touch('touchMove',[{...one,x:one.x-25,y:one.y-20}]);await touch('touchEnd',[]);
  const browseAfter=await page.locator('#measureCanvas').boundingBox();
  assert(Math.abs(browseAfter.x-browseStart.x)<2 && Math.abs(browseAfter.y-browseStart.y)<2,'Single-finger browse drag unexpectedly moved the canvas');
  const trio=[one,{id:12,x:one.x+70,y:one.y},{id:13,x:one.x+35,y:one.y+60}];
  await touch('touchStart',trio);
  const trioZoom=await page.locator('#zoomValue').innerText();
  const trioBefore=await page.locator('#measureCanvas').boundingBox();
  await touch('touchMove',trio.map(t=>({...t,x:t.x-25,y:t.y-20})));
  const trioAfter=await page.locator('#measureCanvas').boundingBox();
  assert(Math.abs(trioAfter.x-trioBefore.x)<2 && Math.abs(trioAfter.y-trioBefore.y)<2,'Three-finger browse gesture unexpectedly moved the canvas');
  assert(await page.locator('#zoomValue').innerText()===trioZoom,'Three fingers changed scale in browse mode');
  await touch('touchEnd',[trio[0]]);await touch('touchMove',[{...trio[0],x:one.x+20}]);await touch('touchEnd',[]);
  const remainingAfter=await page.locator('#measureCanvas').boundingBox();
  assert(Math.abs(remainingAfter.x-trioAfter.x)<2 && Math.abs(remainingAfter.y-trioAfter.y)<2,'Remaining finger unexpectedly restarted dragging');
  assert(await count()===savedCount,'Browse gestures wrote data');
  for (const direction of ['zoomIn','zoomOut']) {
    for(let i=0;i<20;i++) {
      const button=page.locator('#'+direction);
      if(await button.isDisabled()) break;
      await button.click();
    }
    const limitZoom=await page.locator('#zoomValue').innerText();
    const pair=[{id:17,x:one.x,y:one.y},{id:18,x:one.x+110,y:one.y}];
    await touch('touchStart',pair);
    const sign=direction==='zoomIn'?1:-1;
    const overshoot=pair.map((t,i)=>({...t,x:t.x+(i?20:-20)*sign}));
    await touch('touchMove',overshoot);
    assert(await page.locator('#zoomValue').innerText()===limitZoom,'Zoom exceeded its limit');
    const reversed=overshoot.map((t,i)=>({...t,x:t.x+(i?-5:5)*sign}));
    await touch('touchMove',reversed);
    assert(await page.locator('#zoomValue').innerText()!==limitZoom,'Zoom did not immediately reverse at its limit');
    await touch('touchEnd',[]);
  }
  await page.locator('#fitCanvas').click();
  await page.locator('#inspectorToggle').click();
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
  return {passed:true,checks:['trackpad wheel pan and Ctrl-wheel pinch','browse blocks writes and undo','explicit edit and done','visible selection without export changes','pinch zoom','two-finger pan and simultaneous zoom','moving midpoint stays anchored','immediate reversal at zoom limits','long-press panning removed','free two-finger dragging at fit scale','three-finger gestures disabled','single-finger browse does not pan','immediate touch drawing','draft cancellation','endpoint rollback','remaining finger suppression','pointer cancellation','new project resets mode'],productionWrites:0};
}
