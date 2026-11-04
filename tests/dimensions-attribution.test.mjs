import test from 'node:test';
import assert from 'node:assert/strict';
import model from '../apps/academy/pages/dimensions/model.js';
import batch from '../apps/academy/pages/dimensions/batch.js';
const actor={id:'employee-1',name:'李世麟'};
const row={ts:1,payload:{meta:{id:'project',width:100,height:100},annotations:{}}};
const request={projectId:'project',expectedVersion:1,requestId:'ai-create',operations:[{op:'create',id:'a',changes:{type:'line',start:{x:1,y:1},end:{x:80,y:80},label:'8 cm'}}]};
test('AI batch attributed as AI even when authenticated through a human account; manual edit takes authorship',()=>{
 const result=batch.plan(row,request,actor);
 const ai=result.payload.annotations.a;
 assert.equal(model.attribution(ai),'AI标注');
 const session=new model.Session({row:{ts:2,payload:result.payload},actor,transport:{}});
 const edited=session.edit({...ai,label:'8.5 cm'});
 assert.equal(model.attribution(edited),'制作：李世麟');
 assert.equal(edited.attribution.kind,'human');
 assert.deepEqual(edited.createdBy,ai.createdBy);
 assert.equal(model.attribution(ai),'AI标注');
 const again=batch.plan({ts:3,payload:{...result.payload,annotations:{a:edited}}},{...request,expectedVersion:3,requestId:'ai-update',operations:[{op:'update',id:'a',changes:{label:'9 cm'}}]},actor);
 assert.equal(model.attribution(again.payload.annotations.a),'AI标注');
 const undo=batch.plan({ts:4,payload:again.payload},{projectId:'project',expectedVersion:4,requestId:'undo',undo:true},actor);
 assert.equal(model.attribution(undo.payload.annotations.a),'制作：李世麟');
});
test('legacy Codex data and human modifications are distinguished without affecting ordinary authors',()=>{
 const ai={createdBy:{id:'codex',name:'Codex'},updatedBy:{id:'codex',name:'Codex'}};
 assert.equal(model.attribution(ai),'AI标注');
 assert.equal(model.attribution({...ai,updatedBy:actor}),'制作：李世麟');
 assert.equal(model.attribution({createdBy:actor}),'制作：李世麟');
});
