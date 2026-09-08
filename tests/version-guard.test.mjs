import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync('apps/academy/version-guard.js','utf8');
function fixture() {
  let now=0,status,push,fetcher=async()=>new Response('{"version":"abcdef0"}');
  const events={},timers=new Map(),intervals=[],requests=[],prompts=[];let timerId=0;
  const channel={on(type,filter,fn){push=fn;return this},subscribe(fn){status=fn;return this}};
  const document={readyState:'complete',visibilityState:'visible',baseURI:'https://example.test/web/apps/academy/index.html',
    querySelector:()=>({content:'abcdef0'}),addEventListener:(event,fn)=>events[event]=fn,
    getElementById:()=>true,createElement:()=>({setAttribute(){},querySelector:()=>({addEventListener(){},focus(){}}),remove(){}}),body:{appendChild:node=>prompts.push(node)}};
  const context={URL,AbortController,Response,document,Date:{now:()=>now},navigator:{onLine:true},location:{href:document.baseURI},
    sessionStorage:{getItem:()=>null,removeItem(){}},console:{debug(){}},
    fetch:(url,options)=>{requests.push({url:String(url),options});return fetcher(url,options)},
    setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId},clearTimeout:id=>timers.delete(id),setInterval:(fn,delay)=>intervals.push({fn,delay}),
    addEventListener:(event,fn)=>events[event]=fn,AcademyStore:{realtimeClient:()=>({channel:()=>channel,removeChannel(){}})}};
  context.window=context;vm.runInNewContext(source,context);
  const settle=async()=>{await new Promise(setImmediate)};
  return {context,requests,prompts,timers,settle,advance:ms=>now+=ms,event:name=>events[name]?.(),status:s=>status(s),push:version=>push({new:{payload:{version}}}),tick:()=>intervals[0].fn(),fetcher:fn=>fetcher=fn};
}
test('checks immediately and combines startup, connection and visibility events',async()=>{
  const f=fixture();f.status('SUBSCRIBED');f.event('online');f.event('visibilitychange');await f.settle();
  assert.equal(f.requests.length,1);
  assert.equal(new URL(f.requests[0].url).search,'');assert.equal(f.requests[0].options.cache,'no-cache');
  f.event('visibilitychange');await f.settle();assert.equal(f.requests.length,1);
});
test('healthy realtime uses five-minute HTTP fallback and pushes without another read',async()=>{
  const f=fixture();f.status('SUBSCRIBED');await f.settle();
  f.advance(30000);f.tick();await f.settle();assert.equal(f.requests.length,1);
  f.advance(270000);f.tick();await f.settle();assert.equal(f.requests.length,2);
  f.push('abcdef1');assert.equal(f.prompts.length,1);assert.equal(f.requests.length,2);
});
test('disconnected realtime polls every fifteen seconds and failures back off',async()=>{
  const f=fixture();await f.settle();f.advance(15000);f.tick();await f.settle();assert.equal(f.requests.length,2);
  f.fetcher(async()=>{throw Error('offline')});f.advance(15000);f.tick();await f.settle();assert.equal(f.requests.length,3);
  f.advance(15000);f.tick();await f.settle();assert.equal(f.requests.length,3);
  f.advance(15000);f.tick();await f.settle();assert.equal(f.requests.length,4);
});
test('hidden/offline checks pause; foreground and manual checks are immediate',async()=>{
  const f=fixture();f.status('SUBSCRIBED');await f.settle();f.advance(300000);
  f.context.document.visibilityState='hidden';f.tick();await f.settle();assert.equal(f.requests.length,1);
  f.context.document.visibilityState='visible';f.context.navigator.onLine=false;f.tick();await f.settle();assert.equal(f.requests.length,1);
  f.context.navigator.onLine=true;f.event('online');f.event('visibilitychange');await f.settle();assert.equal(f.requests.length,2);
  await f.context.AutoOfficeVersion.check();assert.equal(f.requests.length,3);
});
test('hung requests time out and do not lock future version checks',async()=>{
  const f=fixture();await f.settle();
  f.fetcher((url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout')))));
  const pending=f.context.AutoOfficeVersion.check();
  [...f.timers.values()].find(t=>t.delay===8000).fn();await pending;
  f.fetcher(async()=>new Response('{"version":"abcdef0"}'));await f.context.AutoOfficeVersion.check();
  assert.equal(f.requests.length,3);
});
