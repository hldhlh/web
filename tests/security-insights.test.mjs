import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import vm from 'node:vm';
const script=readFileSync('apps/academy/framework/security-insights.js','utf8');
const root='apps/academy/data/login-geo/20260901/';
const manifest=JSON.parse(readFileSync(root+'manifest.json'));
function fixture({fail=false}={}){
 const calls=[];
 const context={window:{},document:{currentScript:{src:'https://example.test/apps/academy/framework/security-insights.js'}},URL,Intl,AbortSignal,Response,Blob,DecompressionStream,crypto:webcrypto,Uint8Array,
 fetch:async url=>{calls.push(String(url));if(fail)throw Error('offline');const path=new URL(url).pathname.replace('/apps/academy/data/login-geo/20260901/','');assert.ok(!path.includes('/'));return new Response(readFileSync(root+path));}};
 vm.runInNewContext(script,context);return {api:context.window.AcademySecurityInsights,calls};
}
test('labels recorded Apple, Android, Windows and embedded browser information conservatively',()=>{
 const {api}=fixture();
 const iphone=api.deviceInfo('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1');
 assert.equal(iphone.device,'iPhone');assert.equal(iphone.os,'iOS 18.6');assert.equal(iphone.browser,'Safari 18.6');
 assert.equal(api.deviceInfo('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) Version/17.5 Safari/604.1').device,'iPad');
 const android=api.deviceInfo('Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1) Chrome/124.0 Mobile Safari/537.36');assert.equal(android.device,'SM-S918B');assert.equal(android.os,'Android 14');
 assert.equal(api.deviceInfo('Mozilla/5.0 (Linux; Android 10; K) Chrome/133.0 Mobile Safari/537.36').device,'Android 手机');
 assert.equal(api.deviceInfo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36 Edg/140.0').browser,'Edge 140.0');
 assert.equal(api.deviceInfo('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) MicroMessenger/8.0.61').browserName,'微信');
 assert.equal(api.deviceInfo('').device,'未知设备');
});
test('parses forwarded IPv4, bracketed IPv6, mapped IPv4 and rejects malformed inputs',()=>{
 const {api}=fixture();
 assert.equal(api.parseIP('8.8.8.8, 10.0.0.1').ip,'8.8.8.8');
 assert.equal(api.parseIP('[240e:1::1]:443').key,'240e0001000000000000000000000001');
 assert.equal(api.parseIP('::ffff:8.8.8.8').key,134744072);
 assert.equal(api.parseIP('::ffff:0808:0808').key,134744072);
 for(const ip of ['999.1.1.1','1.2.3','1.2.3.4.evil',':::', '1::2::3','1:2:3:4:5:6:7:8:9','nonsense, 8.8.8.8'])assert.equal(api.parseIP(ip),null,ip);
 for(const ip of ['127.0.0.1','10.0.0.1','172.16.1.1','100.64.1.1','192.168.1.1','192.0.2.1','::1','fe80::1','fc00::1','2001:db8::1'])assert.equal(api.parseIP(ip).reserved,true,ip);
});
test('private and missing addresses do not download a region database',async()=>{
 const {api,calls}=fixture();assert.equal((await api.locate('10.0.0.1')).state,'private');assert.equal((await api.locate('')).state,'unknown');assert.equal(calls.length,0);
});
test('offline lookup supports historical IPv4 and IPv6 logs, coalesces shards and only requests this site',async()=>{
 const {api,calls}=fixture();
 const results=await Promise.all(['223.5.5.5','223.5.5.6','240e:1::1','8.8.8.8'].map(ip=>api.locate(ip)));
 assert.ok(results.every(r=>r.state==='estimated'),JSON.stringify(results));assert.equal(results[0].iso,'CN');assert.ok(results[0].province);assert.equal(results[2].iso,'CN');
 assert.ok(calls.every(url=>url.startsWith('https://example.test/apps/academy/data/login-geo/20260901/')));assert.equal(calls.length,4);
 assert.ok(!calls.some(url=>/223\.5|240e:|8\.8\.8/.test(url)));
});
test('region download failure leaves raw audit records usable and can be retried',async()=>{
 const {api,calls}=fixture({fail:true});assert.equal((await api.locate('8.8.8.8')).state,'unavailable');await api.locate('8.8.8.8');assert.equal(calls.length,2);
});
test('every shipped shard is bounded, ordered and correct at range boundaries',()=>{
 const {api}=fixture();let files=0;
 for(const entries of Object.values(manifest.shards))for(const entry of entries){
  const compressed=readFileSync(root+entry.file);assert.ok(compressed.length<160000);
  const data=JSON.parse(gunzipSync(compressed));assert.ok(data.rows.length<=8192);
  let previous;
  for(const [start,end,id] of data.rows){assert.ok(start<=end);if(previous!==undefined)assert.ok(previous<start);previous=end;assert.ok(data.regions[id]);}
  for(const [start,end,id] of [data.rows[0],data.rows.at(-1)]){assert.equal(api.search(data,start),data.regions[id]);assert.equal(api.search(data,end),data.regions[id]);}
  files++;
 }
 assert.ok(files>200);
});
