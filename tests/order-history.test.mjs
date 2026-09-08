import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('apps/jlhcdh/index.html','utf8');
const history=source.slice(source.indexOf('        function parseDateOnly('),source.indexOf('        function getPredictionHintHtml('));
const labelSource=source.slice(source.indexOf('        function getHistoryLabel('),source.indexOf('        function showToast('));
const label=new Function('getLocalBusinessDate',`${labelSource};return getHistoryLabel;`)(()=> '2026-09-09');
function fixture() {
  const state={currentDate:'2026-09-09',predictionDate:'',products:[{id:1,last_purchased_date:'2026-04-19'}],predictions:{}};
  const data={jlhcdh_cart:[],jlhcdh_orders:[]};const reads=[];let fail=false,renders=0;
  const sb={from:table=>{
    const q={select(){return q},gte(){return q},lte(){return q},order(){return q},async range(a,b){reads.push({table,a,b});return fail?{error:new Error('offline')}:{data:data[table].slice(a,b+1)}}};return q;
  }};
  const api=new Function('state','sb','window','getLocalBusinessDate','writeCache','CACHE_KEYS','applyPredictionHintsToDOM','renderProducts','runAfterFirstPaint','console',`${history};return {fetch:fetchOrderPredictions,invalidate:()=>{historyRevision++;historyLoadedAt=0}};`)(state,sb,{OrderCartSync:{wasEdited:()=>false}},()=> '2026-09-09',()=>{},{products:'test'},()=>{},()=>renders++,()=>{},{log(){},warn(){}});
  return {state,data,reads,api,renders:()=>renders,fail:value=>fail=value};
}
test('badge uses calendar days, validates dates and never treats future orders as purchases',()=>{
  assert.equal(label('2026-09-09'),'今天买过');assert.equal(label('2026-09-08'),'昨天买过');
  assert.equal(label('2026-09-07'),'前天买过');assert.equal(label('2026-09-01'),'8天前买过');
  assert.equal(label('2026-09-10'),'');assert.equal(label('2026-02-30'),'');
});
test('history reads all pages and replaces a stale 143-day badge with the newest date',async()=>{
  const f=fixture();
  f.data.jlhcdh_cart=Array.from({length:1000},(_,i)=>({product_id:i+2,quantity:1,order_date:'2026-04-19'}));
  f.data.jlhcdh_cart.push({product_id:1,quantity:2,order_date:'2026-09-08'});
  await f.api.fetch();assert.equal(f.state.products[0].last_purchased_date,'2026-09-08');
  assert.equal(f.reads.filter(r=>r.table==='jlhcdh_cart').length,3);assert.equal(f.renders(),1);
});
test('today contributes to the history badge, but not to today quantity prediction',async()=>{
  const f=fixture();f.data.jlhcdh_cart=[{product_id:1,quantity:8,order_date:'2026-09-09'}];
  await f.api.fetch();assert.equal(f.state.products[0].last_purchased_date,'2026-09-09');
  assert.equal(f.state.predictions[1],undefined);
  f.data.jlhcdh_cart=[{product_id:1,quantity:2,order_date:'2026-09-06'}];f.api.invalidate();await f.api.fetch();
  assert.equal(f.state.products[0].last_purchased_date,'2026-09-06');
  f.data.jlhcdh_cart=[];f.api.invalidate();await f.api.fetch();assert.equal(f.state.products[0].last_purchased_date,'');
});
test('live cart days and newest legacy snapshots do not resurrect deleted entries',async()=>{
  const f=fixture();f.data.jlhcdh_cart=[{product_id:2,quantity:1,order_date:'2026-09-08'}];
  f.data.jlhcdh_orders=[
    {created_at:'2026-09-08T10:00:00Z',order_data:[{id:1,qty:3}]},
    {created_at:'2026-09-07T10:00:00Z',order_data:[]},
    {created_at:'2026-09-07T09:00:00Z',order_data:[{id:1,qty:3}]},
    {created_at:'2026-09-06T10:00:00Z',order_data:[{id:1,qty:1}]}
  ];await f.api.fetch();assert.equal(f.state.products[0].last_purchased_date,'2026-09-06');
});
test('failed reads preserve last good data and are eligible for retry',async()=>{
  const f=fixture();f.fail(true);await f.api.fetch();assert.equal(f.state.predictionDate,'');
  assert.equal(f.state.products[0].last_purchased_date,'2026-04-19');
  f.fail(false);f.data.jlhcdh_cart=[{product_id:1,quantity:1,order_date:'2026-09-08'}];
  await f.api.fetch();assert.equal(f.state.products[0].last_purchased_date,'2026-09-08');
});
