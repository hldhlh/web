import test from 'node:test';
import assert from 'node:assert/strict';
import batch from '../apps/academy/pages/dimensions/batch.js';
const actor={id:'u',name:'测试'};
const projectId='10000000-0000-4000-8000-000000000001';
const line={id:'a',type:'line',start:{x:10,y:10},end:{x:100,y:100},label:'旧值',version:'v1',createdAt:'2026-01-01',custom:'preserved'};
const row=()=>({ts:10,payload:{meta:{id:projectId,width:900,height:650,custom:1},annotations:{a:structuredClone(line)},future:{preserved:true}}});
const request=(operations)=>({projectId,expectedVersion:10,requestId:'batch1',operations});
const update={op:'update',id:'a',changes:{label:'新值'}};
test('batch validation is atomic and preserves unknown fields without mutating snapshot',()=>{
 const original=row(), plan=batch.plan(original,request([update,{op:'create',id:'b',changes:{type:'line',start:{x:0,y:0},end:{x:100,y:0},label:'宽'}}]),actor);
 assert.equal(original.payload.annotations.a.label,'旧值');assert.equal(plan.payload.annotations.a.custom,'preserved');assert.deepEqual(plan.payload.future,{preserved:true});assert.equal(plan.payload.meta.count,2);
 assert.throws(()=>batch.plan(original,request([update,{op:'update',id:'missing',changes:{label:'x'}}]),actor),{code:'NOT_FOUND'});assert.equal(original.payload.annotations.a.label,'旧值');
});
test('retry deduplicates, rejects changed request and stale versions',()=>{
 const input=request([update]),plan=batch.plan(row(),input,actor),saved={ts:11,payload:plan.payload};
 assert.equal(batch.plan(saved,input,actor).alreadyApplied,true);
 assert.throws(()=>batch.plan(saved,{...input,operations:[{...update,changes:{label:'different'}}]},actor),{code:'IDEMPOTENCY_CONFLICT'});
 assert.throws(()=>batch.plan(saved,{...input,requestId:'batch2'},actor),{code:'CONFLICT'});
});
test('undo restores updates and deletes and tombstones new annotations',()=>{
 const original=row();original.payload.annotations.c={...line,id:'c'};
 const plan=batch.plan(original,request([update,{op:'delete',id:'c'},{op:'create',id:'b',changes:{type:'line',start:{x:0,y:0},end:{x:1,y:1}}}]),actor);
 const saved={ts:11,payload:plan.payload},undone=batch.plan(saved,{projectId,expectedVersion:11,requestId:'undo1',undo:true},actor);
 assert.equal(undone.payload.annotations.a.label,'旧值');assert.equal(undone.payload.annotations.c.deleted,undefined);assert.equal(undone.payload.annotations.b.deleted,true);assert.equal(undone.payload.meta.count,2);
 saved.payload.annotations.a.version='remote';assert.throws(()=>batch.plan(saved,{projectId,expectedVersion:11,requestId:'undo2',undo:true},actor),{code:'CONFLICT'});
});
test('strict schema, unique IDs, locked items and geometry are enforced',()=>{
 for (const operations of [[{...update,id:'__proto__'}],[update,update],[{...update,changes:{version:'overwrite'}}],[{...update,changes:{end:{x:901,y:0}}}],[{op:'delete',id:'a',changes:{}}]]) assert.throws(()=>batch.plan(row(),request(operations),actor));
 const locked=row();locked.payload.annotations.a.locked=true;
 assert.throws(()=>batch.plan(locked,request([update]),actor),{code:'LOCKED'});
 assert.equal(batch.plan(locked,request([{...update,changes:{locked:false}}]),actor).payload.annotations.a.locked,false);
 assert.throws(()=>batch.plan(row(),request([{...update,changes:{type:'circle',end:{x:100,y:10}}}]),actor),{code:'BOUNDS'});
});
test('rectangle endpoint changes rebuild renderer geometry and snapshot uses original dimensions',()=>{
 const original=row();original.payload.annotations.a={...line,type:'rect',points:[line.start,{x:100,y:10},line.end,{x:10,y:100}]};
 const planned=batch.plan(original,request([{...update,changes:{end:{x:200,y:200}}}]),actor);
 assert.deepEqual(planned.payload.annotations.a.points[2],{x:200,y:200});assert.equal(batch.snapshot(original).image.width,900);
});

test('curve control is validated, note supports a single anchor, and type conversion clears obsolete geometry',()=>{
 const curve=batch.plan(row(),request([{op:'create',id:'curve',changes:{type:'curve',start:{x:10,y:10},end:{x:100,y:100},control:{x:100,y:10},label:'R20'}}]),actor);
 assert.deepEqual(curve.payload.annotations.curve.control,{x:100,y:10});
 assert.throws(()=>batch.plan(row(),request([{...update,changes:{type:'curve',control:{x:1000,y:10}}}]),actor),{code:'BOUNDS'});
 const note=batch.plan(row(),request([{...update,changes:{type:'note',start:{x:50,y:50},end:{x:50,y:50},label:'模型说明'}}]),actor);
 assert.equal(note.payload.annotations.a.type,'note');
 const original=row();original.payload.annotations.a={...line,type:'rect',points:[line.start,{x:100,y:10},line.end,{x:10,y:100}]};
 const converted=batch.plan(original,request([{...update,changes:{type:'curve',control:{x:50,y:20}}}]),actor);
 assert.equal(converted.payload.annotations.a.points,undefined);
 assert.throws(()=>batch.plan(row(),request([{...update,changes:{type:'curve'}}]),actor));
});
