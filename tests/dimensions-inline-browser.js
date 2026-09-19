async page => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1200,height:900});
  await page.route('**/bootstrap.js',route=>route.fulfill({contentType:'application/javascript',body:`window.DimensionCollab={edit(item){window.savedItem=structuredClone(item);}};const s=document.createElement('script');s.src='editor.js';document.head.append(s);`}));
  await page.goto('http://127.0.0.1:8775/apps/academy/pages/dimensions/index.html');
  await page.waitForFunction(()=>window.DimensionEditor);
  await page.evaluate(async()=>{
    document.body.dataset.view='editor';document.getElementById('workspace').hidden=false;document.getElementById('library').hidden=true;
    const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=600;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#59676b';ctx.fillRect(0,0,1000,600);
    await DimensionEditor.openImage(await new Promise(resolve=>canvas.toBlob(resolve)),'箭头标注');
    DimensionEditor.applyAnnotations([{id:'a',type:'line',start:{x:100,y:260},end:{x:900,y:260},label:'净宽80cm',style:'light',labelPosition:'center'}]);
  });
  await page.locator('#toggleEdit').click();await page.locator('.list-select').click();
  const inline=page.locator('[data-label-position="inline"]');await inline.click();
  if(await inline.getAttribute('aria-pressed')!=='true')throw Error('Inline option not selected');
  if(await page.evaluate(()=>savedItem.labelPosition)!=='inline')throw Error('Inline preference was not saved');
  if(await page.locator('#labelLayer rect').count())throw Error('Long dimension retained a label background');
  if(await page.locator('#labelLayer text').getAttribute('fill')!=='#ffffff')throw Error('Inline text is not white');
  await page.evaluate(()=>DimensionEditor.applyAnnotations([{...savedItem,end:{x:180,y:260}}]));
  if(await page.locator('#labelLayer rect').count()!==1)throw Error('Short dimension did not fall back');
  for(let i=0;i<8;i++)await page.locator('#zoomIn').click();
  if(await page.locator('#labelLayer rect').count())throw Error('Zoom did not restore inline text when space became available');
  await page.evaluate(()=>{
    window.DimensionImages={formatBytes:()=>'',exportCanvas(canvas){window.exportPixels=canvas.toDataURL();return Promise.resolve({blob:new Blob(['test']),extension:'png'});}};
  });
  await page.locator('#exportImage').click();
  if(!await page.evaluate(()=>!!window.exportPixels))throw Error('Arrow export failed');
  await page.locator('[data-label-position="center"]').click();
  if(await page.locator('#labelLayer rect').count()!==1)throw Error('Cannot restore automatic labels');
  if(errors.length)throw Error(errors.join('\n'));
  return {passed:true,checks:['opt-in and saved preference','inline white text without background','short-line fallback','zoom reevaluates available space','export','restore default']};
}
