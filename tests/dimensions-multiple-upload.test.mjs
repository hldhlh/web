import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../apps/academy/pages/dimensions/collaboration.js', import.meta.url), 'utf8');
const implementation = source.slice(source.indexOf('  async function createMany('), source.indexOf('  async function create(file, pending'));
function fixture() {
  const events=[], elements = {imageOperationFile:{}}; let failure=true, retry, shown;
  const api = new Function('events','elements','shouldFail','setRetry','setShown',`
    let opening=false, currentFolder='child', session=null;
    const $=id=>elements[id], ensureAllowed=()=>{}, imageProgress=()=>{}, editor={notice:message=>events.push(message)};
    const showProject=async(row)=>setShown(row);
    async function createItem(file,pending) {
      events.push([file.name,pending.folderId]);
      if (file.name==='second' && shouldFail()) throw new Error('offline');
      return {row:file.name,blob:{}};
    }
    async function imageOperation(action,again) { setRetry(again); try {await action();} catch(e) {events.push(e.message);} }
    ${implementation}
    return {createMany};
  `)(events,elements,()=>{if(failure){failure=false;return true}return false},fn=>retry=fn,row=>shown=row);
  return { ...api, events, retry:()=>retry(), shown:()=>shown };
}
test('multi-image upload resumes at failed image and opens last project', async()=>{
  const f=fixture(); await f.createMany([{name:'first'},{name:'second'},{name:'third'}]);
  assert.match(f.events[2],/已完成 1 张/); assert.equal(f.shown(),undefined);
  await f.retry();
  assert.deepEqual(f.events.filter(Array.isArray),[['first','child'],['second','child'],['second','child'],['third','child']]);
  assert.equal(f.shown(),'third'); assert.equal(f.events.at(-1),'已上传 3 张图片');
});
test('batch limit prevents any image from being uploaded', async()=>{
  const f=fixture(); await f.createMany(Array.from({length:51},(_,i)=>({name:String(i)})));
  assert.match(f.events[0],/最多上传 50 张/); assert.equal(f.events.filter(Array.isArray).length,0);
});
