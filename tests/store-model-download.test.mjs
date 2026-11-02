import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {loadModel} from '../apps/academy/pages/store-model/download.js';
const bytes=new Uint8Array([103,108,84,70,2,0,0,0]);
const zipped=gzipSync(bytes);
const manifest={version:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,gzipBytes:zipped.length,url:'shop.glb',gzipUrl:'shop.glb.gz'};
const base='https://example.test/model/';
const unavailable={open:async()=>{throw Error('quota');}};
test('compressed cloud download returns original bytes when storage is unavailable',async()=>{
 const events=[];
 const result=await loadModel(manifest,e=>events.push(e),{base,storage:unavailable,fetcher:async url=>{assert.match(url,/\.gz\?v=/);return new Response(zipped);}});
 assert.deepEqual(new Uint8Array(result),bytes);assert.ok(events.some(e=>e.loaded===zipped.length));
});
test('corrupt compressed download falls back to verified original model',async()=>{
 let calls=0;
 const result=await loadModel(manifest,()=>{},{base,storage:unavailable,fetcher:async()=>new Response(++calls===1?new Uint8Array([0]):bytes)});
 assert.equal(calls,2);assert.deepEqual(new Uint8Array(result),bytes);
});
test('valid cache avoids network and stale corrupt cache is discarded',async()=>{
 let removed=false;
 const cache={match:async()=>new Response(bytes),delete:async()=>{removed=true;},put:async()=>{},keys:async()=>[]};
 const options={base,storage:{open:async()=>cache},fetcher:async()=>{throw Error('must not download');}};
 assert.deepEqual(new Uint8Array(await loadModel(manifest,()=>{},options)),bytes);
 cache.match=async()=>new Response(new Uint8Array(8));options.fetcher=async()=>new Response(zipped);
 assert.deepEqual(new Uint8Array(await loadModel(manifest,()=>{},options)),bytes);assert.equal(removed,true);
});
test('HTTP failures do not produce a cached partial model',async()=>{
 await assert.rejects(loadModel(manifest,()=>{},{base,storage:unavailable,fetcher:async()=>new Response('missing',{status:404})}),/HTTP 404/);
});
