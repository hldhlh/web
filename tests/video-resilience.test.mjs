import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {sourcesFor,Recovery}=createRequire(import.meta.url)('../apps/academy/video-resilience.js');
const sources=[{url:'https://media.example/low.mp4',label:'流畅'},{url:'https://media.example/high.mp4',label:'清晰'}];
class Video extends EventTarget {
 constructor(){super();this.src=sources[1].url;this.paused=false;this.currentTime=23;this.playbackRate=1.5;this.duration=100;this.loads=0;}
 load(){this.loads++;} play(){this.paused=false;return Promise.resolve();}
 emit(type){this.dispatchEvent(new Event(type));}
}
test('manifest allows only HTTPS, deduplicates, preserves original fallback',()=>{
 assert.deepEqual(sourcesFor(sources[1].url,{videos:[{original:sources[1].url,sources:[sources[0],sources[0],{url:'javascript:alert(1)'},{url:'http://insecure.example/x'}]}]}),[sources[0],{url:sources[1].url,label:'原画'}]);
 assert.equal(sourcesFor(sources[1].url,{}).length,1);
});
test('recovery preserves playback position and speed when loading the low rendition',()=>{
 const v=new Video();const c=new Recovery(v,sources,()=>{});v.emit('error');assert.equal(v.src,sources[0].url);
 v.currentTime=0;v.playbackRate=1;v.emit('loadedmetadata');assert.equal(v.currentTime,23);assert.equal(v.playbackRate,1.5);assert.equal(v.paused,false);
});
test('manual switch while paused does not start playback and allows restart at zero',()=>{
 const v=new Video();v.paused=true;const c=new Recovery(v,sources,()=>{});v.currentTime=0;c.switchTo(0,true);v.emit('loadedmetadata');assert.equal(v.paused,true);assert.equal(v.currentTime,0);
});
test('errors stop after finite fallback attempts and manual retry resets budget',()=>{
 const v=new Video();let exhausted=false;const c=new Recovery(v,sources,(_,__,x)=>{exhausted=!!x});
 for(let i=0;i<6;i++)v.emit('error');assert.equal(exhausted,true);assert.equal(c.deadline,0);assert(v.loads<=4);
 c.switchTo(0,true);assert.equal(c.retries,0);assert.equal(c.failed.size,0);
});
test('buffering watchdog recovers while playing, not while paused or ended',()=>{
 let now=0;const v=new Video();const c=new Recovery(v,sources,()=>{},()=>now);v.emit('waiting');now=16000;c.tick();assert.equal(v.loads,1);
 v.emit('loadedmetadata');v.paused=true;v.emit('pause');now=60000;c.tick();assert.equal(v.loads,1);
 v.emit('ended');c.tick();assert.equal(v.loads,1);
});
test('playback progress prevents a stale buffering timeout',()=>{
 let now=0;const v=new Video();const c=new Recovery(v,sources,()=>{},()=>now);v.emit('waiting');v.currentTime=25;v.emit('timeupdate');now=16000;c.tick();assert.equal(v.loads,0);
});
test('dispose removes listeners and disables retries after navigation',()=>{
 const v=new Video();const c=new Recovery(v,sources,()=>{});c.dispose();v.emit('error');c.tick();assert.equal(v.loads,0);
});
test('autoplay rejection prompts a user gesture without retrying the network',async()=>{
 const v=new Video();v.play=()=>Promise.reject(new Error('NotAllowedError'));let message='';const c=new Recovery(v,sources,m=>message=m);c.switchTo(0);v.emit('loadedmetadata');await Promise.resolve();assert.match(message,/点击播放/);assert.equal(c.deadline,0);assert.equal(v.loads,1);
});
