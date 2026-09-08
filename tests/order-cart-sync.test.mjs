import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const source=readFileSync('apps/jlhcdh/cart-sync.js','utf8');
function fixture(storage=new Map()) {
  const calls=[],statuses=[];
  let handler=async()=>({error:null}), failStorage=false;
  const localStorage={get length(){return storage.size},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k)??null,
    setItem(k,v){if(failStorage)throw new Error('quota');storage.set(k,v)},removeItem:k=>storage.delete(k)};
  const navigator={onLine:true,locks:{request:async(_,work)=>work()}};
  const context={window:{addEventListener(){}},document:{addEventListener(){},hidden:false},navigator,localStorage,crypto:{randomUUID},console,setTimeout:()=>1,clearTimeout(){}};
  vm.runInNewContext(source,context);
  const sync=context.window.OrderCartSync;
  const send=async op=>{calls.push(op);return handler(op)};
  const queryFor=row=>{
    const query={eq(field,value){row[field]=value;return query},then(resolve,reject){return send(row).then(resolve,reject)}};
    return query;
  };
  sync.configure({from:()=>({upsert:row=>send({type:'upsert',...row}),delete:()=>queryFor({type:'delete'}),update:row=>queryFor({type:'update',...row})})},(op,status)=>statuses.push({op,status}));
  return {sync,calls,statuses,navigator,storage,setHandler:fn=>handler=fn,failStorage:()=>{failStorage=true}};
}
const date='2026-09-09';
test('purchase-only edits do not overwrite a remotely changed quantity',async()=>{
  const f=fixture();f.sync.enqueue(date,1,3,true,'purchase');
  assert.equal(f.sync.overlay(date,{1:{qty:8,purchased:false}})[1].qty,8);
  await f.sync.flush();assert.equal(f.calls[0].type,'update');assert.equal(f.calls[0].quantity,undefined);
  f.sync.enqueue(date,1,9,false);f.sync.enqueue(date,1,9,true,'purchase');
  await f.sync.flush();assert.equal(f.calls[1].type,'upsert');assert.equal(f.calls[1].quantity,9);assert.equal(f.calls[1].is_purchased,true);
});
test('offline queue survives reopening and overlays server values including deletions',async()=>{
  const f=fixture();f.navigator.onLine=false;
  f.sync.enqueue(date,1,12,false);f.sync.enqueue(date,2,0,false);await f.sync.flush();
  assert.equal(f.calls.length,0);
  const reopened=fixture(f.storage);
  const result=reopened.sync.overlay(date,{1:{qty:2},2:{qty:3}});
  assert.equal(result[1].qty,12);assert.equal(result[2],undefined);
  assert.equal(reopened.sync.wasEdited(date),true);
  await reopened.sync.flush();assert.equal(reopened.sync.pendingCount,0);
});
test('Supabase error results retain queue and never report saved',async()=>{
  const f=fixture();f.setHandler(async()=>({error:{message:'network failed'}}));
  f.sync.enqueue(date,1,3,false);await f.sync.flush();
  assert.equal(f.sync.pendingCount,1);
  assert.equal(f.statuses.some(s=>s.status==='saved'),false);
  f.setHandler(async()=>({error:null}));await f.sync.flush();
  assert.equal(f.sync.pendingCount,0);
});
test('rapid edits coalesce and older acknowledgements retain the newest quantity',async()=>{
  const f=fixture();let release,entered;
  const started=new Promise(resolve=>entered=resolve);
  f.setHandler(()=>{entered();return new Promise(resolve=>release=resolve)});
  f.sync.enqueue(date,1,1,false);f.sync.enqueue(date,1,2,false);
  const uploading=f.sync.flush();await started;
  f.sync.enqueue(date,1,9,true);release({error:null});await uploading;
  assert.equal(f.calls[0].quantity,2);assert.equal(f.sync.overlay(date,{})[1].qty,9);
  f.setHandler(async()=>({error:null}));await f.sync.flush();
  assert.equal(f.calls[1].quantity,9);assert.equal(f.calls[1].is_purchased,true);
  assert.equal(f.sync.pendingCount,0);
});
test('same product on different dates remains independent',async()=>{
  const f=fixture();f.sync.enqueue(date,1,2,false);f.sync.enqueue('2026-09-10',1,7,false);
  await f.sync.flush();
  assert.deepEqual(f.calls.map(c=>[c.order_date,c.quantity]),[[date,2],['2026-09-10',7]]);
});
test('batch upload concurrency is bounded and storage failure rejects before acknowledgement',async()=>{
  const f=fixture();let active=0,max=0;
  f.setHandler(async()=>{active++;max=Math.max(max,active);await new Promise(r=>setImmediate(r));active--;return {error:null}});
  for(let i=0;i<12;i++)f.sync.enqueue(date,i,1,false);
  await f.sync.flush();assert.equal(f.calls.length,12);assert.equal(max,4);
  f.failStorage();assert.throws(()=>f.sync.enqueue(date,99,1,false),/quota/);
  assert.equal(f.sync.pendingCount,0);
});
