async page => {
  const origin = 'http://127.0.0.1:8775';
  await page.route('**/*', route => {
    if (/^(blob:|data:)/.test(route.request().url())) return route.continue();
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

  const assert=(v,m)=>{if(!v)throw Error(m);};
  const canvas=page.locator('#measureCanvas');
  const send=async(type,points)=>page.evaluate(({type,points})=>{
    const target=document.getElementById('measureCanvas');
    const old=window.testTouchPoints||[];
    const make=p=>({identifier:p.id,target,clientX:p.x,clientY:p.y,pageX:p.x,pageY:p.y,screenX:p.x,screenY:p.y});
    const active=points.map(make);
    const changed=(type==='touchend'||type==='touchcancel'?old.filter(p=>!points.some(n=>n.id===p.id)):points).map(make);
    // WebKit does not expose a constructible Touch. Feed its actual layout/event
    // engine TouchEvent-shaped snapshots, including older non-iterable lists.
    const list=items=>Object.assign({length:items.length},items);
    const event=new Event(type,{bubbles:true,cancelable:true});
    Object.defineProperties(event,{touches:{value:list(active)},targetTouches:{value:list(active)},changedTouches:{value:list(changed)}});
    target.dispatchEvent(event);
    window.testTouchPoints=points;
    return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  },{type,points});
  const viewport=await page.locator('#viewport').boundingBox();
  const initial=[{id:1,x:viewport.x+110,y:viewport.y+110},{id:2,x:viewport.x+230,y:viewport.y+110}];
  for(const editing of [false,true]) {
    if(editing) await page.locator('#toggleEdit').click();
    for(const zoomed of [false,true]) {
      await page.locator('#fitCanvas').click();
      if(zoomed)for(let i=0;i<3;i++)await page.locator('#zoomIn').click();
      const base=await canvas.boundingBox(),scale=await page.locator('#zoomValue').innerText();
      await send('touchstart',initial);
      // Pointer cancellation must not cancel the independent native touch stream.
      await canvas.evaluate(c=>c.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerType:'touch',pointerId:1})));
      for(const [dx,dy] of [[35,40],[-85,65],[-85,-60],[70,-60],[0,0]]) {
        await send('touchmove',initial.map(p=>({...p,x:p.x+dx,y:p.y+dy})));
        const actual=await canvas.boundingBox();
        assert(Math.abs(actual.x-base.x-dx)<2&&Math.abs(actual.y-base.y-dy)<2,`Pan failed at ${dx},${dy}, editing=${editing}, zoomed=${zoomed}`);
        assert(await page.locator('#zoomValue').innerText()===scale,'Pure pan changed zoom');
      }
      const anchor={x:((initial[0].x+initial[1].x)/2-base.x)/base.width,y:(initial[0].y-base.y)/base.height};
      const mixed=initial.map((p,i)=>({...p,x:p.x+25+(i?18:-18),y:p.y-30}));
      await send('touchmove',mixed);
      const actual=await canvas.boundingBox();
      assert(actual.width>base.width,'Mixed gesture did not zoom');
      assert(Math.abs(actual.x+anchor.x*actual.width-(mixed[0].x+mixed[1].x)/2)<2&&Math.abs(actual.y+anchor.y*actual.height-mixed[0].y)<2,'Mixed gesture slipped from midpoint');
      await send('touchend',[mixed[0]]);
      await send('touchmove',[{...mixed[0],x:mixed[0].x+40}]);
      const after=await canvas.boundingBox();
      assert(Math.abs(after.x-actual.x)<2&&Math.abs(after.y-actual.y)<2,'One remaining finger caused a jump');
      await send('touchend',[]);
      assert(await page.evaluate(()=>writes.length)===0,'Navigation gesture wrote annotation data');
      assert(await page.locator('#viewport').evaluate(e=>e.scrollLeft===0&&e.scrollTop===0),'Pan still depends on native scrolling');
    }
  }
  await page.locator('#fitCanvas').click();
  return {passed:true,userAgent:await page.evaluate(()=>navigator.userAgent),checks:['native TouchEvent path','pan in all four directions at fit and zoomed sizes','browse and edit','simultaneous zoom and pan','pointer cancellation isolation','no native scrolling','no annotation writes']};
}
