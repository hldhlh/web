import test from 'node:test';
import assert from 'node:assert/strict';
import {publishVersion} from '../scripts/version-notification.mjs';
const options={manifest:{version:'abcdef1'},url:'https://db.test',key:'test',siteUrl:'https://site.test/web/',sleep:async()=>{}};
test('waits for deployed version then sends both notification transports',async()=>{
  const calls=[];let reads=0;
  await publishVersion({...options,request:async(url,init)=>{
    calls.push({url:String(url),init});
    if(!init.method)return new Response(JSON.stringify({version:++reads===1?'abcdef0':'abcdef1'}));
    return new Response(null,{status:202});
  }});
  assert.equal(calls.length,4);assert.equal(calls[1].init.method,undefined);
  assert.equal(JSON.parse(calls[3].init.body).messages[0].topic,'auto-office-version-live');
});
test('one failed transport does not prevent the other; transient failures retry',async()=>{
  let row=0,broadcast=0;
  await publishVersion({...options,request:async(url,init)=>{
    if(!init.method)return new Response('{"version":"abcdef1"}');
    if(String(url).includes('/rest/'))return new Response(null,{status:++row<3?503:201});
    broadcast++;return new Response(null,{status:202});
  }});assert.equal(row,3);assert.equal(broadcast,1);
});
test('does not notify terminals before the public deployment is ready',async()=>{
  let writes=0;
  await assert.rejects(publishVersion({...options,request:async(url,init)=>{
    if(init.method)writes++;return new Response('{"version":"abcdef0"}');
  }}));assert.equal(writes,0);
});
