import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync('apps/academy/pages/feedback/app.js','utf8');
const start = source.indexOf('  async function pullFeedback(');
const body = source.slice(start, source.indexOf('  let toastTimer',start));
function fixture() {
  const state = {data:{rev:1,items:[]},saving:false,renderDay:new Date().toDateString()};
  const calls=[]; let renders=0;
  const api = new Function('state','window','document','normalizeData','cacheData','$','render', `
    const FILE='test'; let pullPromise=null,pullAgain=false,writeGeneration=0;
    ${body}
    return {pull:pullFeedback,beginSave(){state.saving=true;writeGeneration++},endSave(){state.saving=false;writeGeneration++}};
  `)(state,{AcademyStore:{getJSON:()=>new Promise((resolve,reject)=>calls.push({resolve,reject}))}},
    {hidden:false},v=>v,()=>{},()=>({}),()=>renders++);
  return {api,state,calls,renders:()=>renders};
}
test('feedback event bursts have one active request and one catch-up read',async()=>{
  const f=fixture(); const first=f.api.pull();
  const burst=Array.from({length:10},()=>f.api.pull());
  assert.equal(f.calls.length,1);
  f.calls[0].resolve({rev:2,items:['a']});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.calls.length,2);
  f.calls[1].resolve({rev:2,items:['a']});
  await Promise.all([first,...burst]);
  assert.equal(f.renders(),1);
});
test('a read begun before a local save cannot replace the saved feedback',async()=>{
  const f=fixture(); const old=f.api.pull();
  f.api.beginSave(); f.state.data={rev:3,items:['local']};
  f.calls[0].resolve({rev:4,items:['old remote']}); await old;
  assert.deepEqual(f.state.data.items,['local']);
  f.api.endSave(); const next=f.api.pull();
  f.calls[1].resolve({rev:5,items:['local','remote']}); await next;
  assert.equal(f.state.data.items.length,2);
});
test('failed feedback reads release the request for reconnect retry',async()=>{
  const f=fixture(); const failed=f.api.pull(true);
  f.calls[0].reject(new Error('offline')); await failed;
  const next=f.api.pull(true); f.calls[1].resolve({rev:2,items:['recovered']}); await next;
  assert.deepEqual(f.state.data.items,['recovered']);
});
