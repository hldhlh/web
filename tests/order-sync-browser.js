async page => {
  const base='http://127.0.0.1:8772';
  const html=await (await page.request.get(base+'/apps/jlhcdh/index.html')).text();
  const queue=await (await page.request.get(base+'/apps/jlhcdh/cart-sync.js')).text();
  await page.route('**/order-sync-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));
  await page.goto(base+'/order-sync-fixture');
  const result=await page.evaluate(async ({html,queue})=>{
    const assert=(ok,message)=>{if(!ok)throw new Error(message)};
    new Function(queue)();
    window.OrderCartSync.configure({from:()=>({upsert:async()=>({error:{message:'offline test'}})})},()=>{});
    document.body.innerHTML='<style>.agg-item{height:100px}body{margin:0}</style><div id="summaryTotalBar"></div><div id="orderCountTop"></div><div id="summaryList"></div>';
    const state={editMode:true,currentDate:'2026-09-09',orders:{},products:[],cartItems:Array.from({length:80},(_,i)=>({id:i+1,name:`商品${i+1}`,qty:1,is_purchased:false}))};
    const reconcile=html.slice(html.indexOf('        function reconcileProductCards('),html.indexOf('        let renderedProductFilter'));
    const summary=html.slice(html.indexOf('        function renderSummary()'),html.indexOf('        window.toggleEditMode'));
    const render=new Function('state','iconSvg',`${reconcile}\n${summary}\nconst fetchDayData=renderSummary; const renderProducts=renderSummary;return renderSummary;`)(state,()=> '');
    window.startLongPress=()=>{};window.cancelLongPress=()=>{};
    render();
    const card=document.querySelector('[data-id="20"]');
    const input=card.querySelector('input[type=number]');
    input.focus();input.value='12';window.scrollTo(0,1900);
    const top=card.getBoundingClientRect().top;
    state.cartItems[30].qty=9;state.cartItems[30].is_purchased=true;render();
    assert(card===document.querySelector('[data-id="20"]'),'unchanged order row remains connected');
    assert(document.activeElement===input && input.value==='12','active quantity draft remains intact');
    assert(Math.abs(card.getBoundingClientRect().top-top)<1,'checklist scroll anchor stays fixed');
    assert(document.querySelector('[data-id="31"]').classList.contains('checked'),'changed purchase styling updates');
    assert(document.querySelector('[data-id="31"] input[type=number]').value==='9','remote quantity displayed');
    const writes=html.slice(html.indexOf('        function saveCartEdit('),html.indexOf('        function getDynamicLocations('));
    new Function('state','writeCache','updateFooter','showToast','renderProducts','applyPredictionHintsToDOM','fetchDayData',`const CACHE_KEYS={cart:'test-cart'};${writes}`)(state,()=>{},()=>{},()=>{},render,()=>{},render);
    window.onQtyChange(99999,'12');
    state.currentDate='2026-09-10';window.onQtyChange(99999,'4');
    await window.OrderCartSync.flush();
    assert(window.OrderCartSync.overlay('2026-09-09',{})[99999].qty===12,'date captured before switching');
    assert(window.OrderCartSync.overlay('2026-09-10',{})[99999].qty===4,'new date has separate pending quantity');
    assert(window.OrderCartSync.pendingCount===2,'failed writes retained');
    return {passed:true,scenarios:['stable summary nodes','scroll anchor','active input','purchase styling','date isolation','failed-write retention']};
  },{html,queue});
  await page.reload();
  const recovered=await page.evaluate(queue=>{
    new Function(queue)();
    if(window.OrderCartSync.overlay('2026-09-09',{})[99999]?.qty!==12)throw new Error('Reload lost pending order');
    return true;
  },queue);
  return {...result,reloadRecovered:recovered,productionWrites:0};
}
