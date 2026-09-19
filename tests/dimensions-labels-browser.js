async p => {
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.setViewportSize({width:1200,height:900});
await p.route('**/bootstrap.js',r=>r.fulfill({contentType:'application/javascript',body:`window.DimensionCollab={edit(){}};const s=document.createElement('script');s.src='editor.js';document.head.append(s);`}));
await p.goto('http://127.0.0.1:8775/apps/academy/pages/dimensions/index.html');await p.waitForFunction(()=>window.DimensionEditor);
await p.evaluate(async()=>{
const original=DimensionLabelLayout.layout;DimensionLabelLayout.layout=(...args)=>{window.boxes=original(...args);window.unit=args[4];return boxes;};
document.body.dataset.view='editor';document.getElementById('workspace').hidden=false;document.getElementById('library').hidden=true;
const c=document.createElement('canvas');c.width=1200;c.height=850;const x=c.getContext('2d');x.fillStyle='#b9b0a2';x.fillRect(0,0,1200,850);x.fillStyle='#50666a';x.fillRect(170,170,850,380);x.fillStyle='#b79a75';x.fillRect(80,610,1060,240);x.strokeStyle='#534d46';x.lineWidth=3;for(let i=80;i<1140;i+=130){x.strokeRect(i,610,130,240);}x.fillStyle='#e5e1d8';x.fillRect(80,570,1060,40);
await DimensionEditor.openImage(await new Promise(r=>c.toBlob(r)),'密集尺寸标注');
const names=['66.5cm 台面宽','80cm 窗口宽','40cm 窗口高','托盘35cm 23cm宽','36.5cm 电饭煲宽 长35cm','托盘 长45cm 宽35cm','128cm 中间玻璃长','60cm 出餐口','10cm 右侧玻璃宽','直径 饮水壶29.5cm','132cm 玻璃高+边界','60cm 左玻璃长'];
DimensionEditor.applyAnnotations(names.map((label,i)=>({id:String(i),type:'line',label,style:i===9?'dark':'light',start:{x:180+i*65,y:500+(i%3)*28},end:{x:250+i*65,y:520+(i%3)*28}})));
});
await p.waitForTimeout(300);
const inspect=()=>p.evaluate(()=>({unit,boxes:boxes.map(b=>({id:b.id,x:b.x,y:b.y,width:b.width,height:b.height})),rect:(()=>{const r=document.getElementById('measureCanvas').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};})()}));
const assertSharpText=async()=>{
  const text=await p.locator('#labelLayer text').first().evaluate(node=>({
    size:parseFloat(getComputedStyle(node).fontSize)*node.getScreenCTM().a,
    text:node.textContent,
  }));
  if(Math.abs(text.size-13)>.05 || text.text!=='66.5\u2009cm 台面宽')throw Error('Vector text lost its readable screen size');
};
await p.evaluate(async()=>{
  await DimensionTypography.loaded;
  if(!document.fonts.check('500 13px "Dimension Sans"','尺寸132cm'))throw Error('Local annotation font failed to load');
});
await assertSharpText();
const a=await inspect();
await p.locator('#zoomIn').click();await p.locator('#zoomIn').click();const z=await inspect();
await assertSharpText();
if(Math.abs(a.boxes[0].height/a.unit-z.boxes[0].height/z.unit)>.01)throw Error('Labels changed screen size');
for(let i=0;i<5;i++)await p.locator('#zoomIn').click();
await assertSharpText();
await p.locator('#fitCanvas').click();
await p.locator('#zoomIn').click();await p.locator('#zoomIn').click();
const box=z.boxes[4],scale=z.rect.width/1200;await p.mouse.click(z.rect.x+box.x*scale,z.rect.y+box.y*scale);
if(await p.locator('#labelInput').inputValue()!=='36.5cm 电饭煲宽 长35cm')throw Error('Displaced label cannot be selected');
await p.setViewportSize({width:390,height:844});await p.locator('#fitCanvas').click();
await assertSharpText();
await p.evaluate(()=>{
  window.exports=[];
  window.DimensionImages={formatBytes:()=> '测试', exportCanvas(canvas){
    exports.push({unit, image:canvas.toDataURL()});
    return Promise.resolve({blob:new Blob(['test'],{type:'image/png'}),extension:'png'});
  }};
});
const screenImage=await p.locator('#measureCanvas').evaluate(canvas=>canvas.toDataURL());
await p.locator('#exportImage').click();
await p.locator('#zoomIn').click();
await p.locator('#exportImage').click();
const exported=await p.evaluate(()=>exports);
if(exported[0]?.image===screenImage)throw Error('Export omitted vector labels');
if(exported.length!==2 || exported[0].image!==exported[1].image || exported[0].unit!==1)throw Error('Export depends on viewport zoom');
await p.evaluate(()=>document.documentElement.dataset.theme='dark');
await p.emulateMedia({reducedMotion:'reduce',contrast:'more'});
await p.locator('#zoomOut').click();
if(errors.length)throw Error(errors.join('\n'));
return {passed:true,checks:['dense labels','sharp 13px vector text at fit and maximum zoom','displaced label selection','mobile layout','zoom-independent export','dark and increased contrast render']};

}
