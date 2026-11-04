/* Local browser regression fixture. No authentication or production writes. */
(async () => {
  const results = [];
  const params = new URLSearchParams(location.search);
  document.documentElement.dataset.theme = params.get('theme') || 'light';
  if (params.has('large')) document.documentElement.style.fontSize = '34px';
  const check = (condition, message) => { if (!condition) throw Error(message); results.push(message); };
  const click = id => document.getElementById(id).click();
  const key = (key, extra = {}, target = document.body) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }));
  const canvas = document.getElementById('measureCanvas');
  const viewport = document.getElementById('viewport');
  viewport.setPointerCapture = () => {}; // Synthetic pointer events have no native capture ID.
  let records = [], version = 0;
  window.DimensionCollab = { actor: {id:'fixture'}, edit(item, deleted) {
    const value = {...structuredClone(item), deleted, version: String(++version)};
    records = records.filter(x => x.id !== item.id);
    if (!deleted) records.push(value);
    DimensionEditor.applyAnnotations(records);
    return value;
  }};
  const move = (type, point) => {
    const box = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent(type, {bubbles:true,cancelable:true,pointerId:1,pointerType:'mouse',button:0,
      clientX:box.left+point[0]*box.width/900,clientY:box.top+point[1]*box.height/650}));
  };
  const drag = (start,end) => {move('pointerdown',start);move('pointermove',end);move('pointerup',end);};
  const label = text => { const input=document.getElementById('labelInput');input.value=text;input.dispatchEvent(new Event('input',{bubbles:true})); };
  const select = id => [...document.querySelectorAll('.list-select')][records.findIndex(x=>x.id===id)].click();
  const settle = () => new Promise(resolve => requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  try {
    const img=document.createElement('canvas');img.width=900;img.height=650;
    const ctx=img.getContext('2d');ctx.fillStyle='#e6e1d8';ctx.fillRect(0,0,900,650);ctx.fillStyle='#777';ctx.fillRect(150,120,600,400);
    await DimensionEditor.openImage(await new Promise(r=>img.toBlob(r)), '交互回归测试.png');
    document.body.dataset.view='editor';document.getElementById('workspace').hidden=false;document.getElementById('library').hidden=true;document.getElementById('projectHeading').hidden=false;
    DimensionEditor.fit();
    records=[{id:'old',type:'line',start:{x:100,y:100},end:{x:700,y:100},label:'历史线 140 mm',style:'light',labelPosition:'center',version:'0'}];
    DimensionEditor.applyAnnotations(records);
    drag([100,100],[400,300]);check(records.length===1,'浏览拖动不修改标注');click('fitCanvas');click('toggleEdit');
    drag([100,100],[400,300]);check(records.length===2 && records[0].start.x===100 && records[0].end.y===100,'新建从历史端点起笔也不修改历史线');
    const created=records.find(x=>x.id!=='old').id;
    check(!document.getElementById('annotationActions').hidden,'新线出现就地操作条');
    const touchButton = new Event('touchstart', {bubbles:true,cancelable:true});
    document.getElementById('deleteSelected').dispatchEvent(touchButton);
    check(!touchButton.defaultPrevented, '触屏操作条不被画布手势拦截');
    label('新线 25 mm');
    key('Backspace',{},document.getElementById('labelInput'));check(records.length===2,'文字输入中的删除键不删线');
    key('Delete');check(records.length===1,'Delete 就地删除选中线');
    click('undoAction');check(records.length===2 && records.find(x=>x.id===created).label==='新线 25 mm','撤销删除恢复尺寸文字及标注');
    click('redoAction');check(records.length===1,'重做删除');click('undoAction');
    click('redrawSelected');move('pointerdown',[200,300]);move('pointermove',[600,450]);key('Escape');move('pointerup',[600,450]);
    check(records.find(x=>x.id===created).end.y>299 && records.find(x=>x.id===created).end.y<301,'取消重画保留原标注');
    select(created);click('redrawSelected');drag([200,300],[650,450]);
    check(records.length===2 && records.find(x=>x.id===created).end.x>649 && records.find(x=>x.id===created).end.x<651 && records.find(x=>x.id===created).label==='新线 25 mm','重画保留同一ID和文字且不新增重复线');
    click('undoAction');check(records.find(x=>x.id===created).end.x>399 && records.find(x=>x.id===created).end.x<401,'撤销重画恢复端点');
    click('lockSelected');drag([100,100],[220,240]);key('Delete');check(records.length===2,'锁定后不能拖动或删除');
    select(created);click('lockSelected');click('duplicateSelected');check(records.length===3,'就地复制创建独立标注');
    click('undoAction');check(records.length===2,'撤销新增只删除本次新增');click('redoAction');check(records.length===3,'重做新增可恢复已删除项');
    click('continueDrawing');drag([100,100],[500,100]);check(records.length===4,'继续标注跨越历史线仍可绘制');
    const newest=records.at(-1);records=records.map(x=>x.id===newest.id?{...x,label:'同事修改',version:'remote'}:x);DimensionEditor.applyAnnotations(records);
    click('undoAction');check(records.length===4 && records.at(-1).label==='同事修改','撤销拒绝覆盖协作方的更新');
    click('toggleEdit');key('Delete');check(records.length===4,'完成编辑后快捷键不写入');
    await settle();
    window.fixtureResult={passed:true,results};
  } catch(error) {window.fixtureResult={passed:false,results,error:error.stack};}
  const output=document.createElement('pre');output.id='fixtureResults';output.textContent=JSON.stringify(window.fixtureResult,null,2);document.body.append(output);
})();
