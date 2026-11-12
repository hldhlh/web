import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('network recovery coalesces, rebuilds shared channels, preserves queued broadcasts and discards old callbacks', () => {
  const events={},timers=new Map(),clients=[];let seq=0,resets=0;
  const createClient=()=>{
    const client={channels:[],closed:false,channel(name){const channel={name,sent:[],on(){return this;},subscribe(fn){this.status=fn;},send(data){this.sent.push(data);}};this.channels.push(channel);return channel;},removeChannel(){},removeAllChannels(){this.closed=true;this.channels.forEach(c=>c.status('CLOSED'));return Promise.resolve();}};
    clients.push(client);return client;
  };
  const ctx={navigator:{onLine:true},URL,CustomEvent:class{constructor(type){this.type=type;}},setTimeout:(fn)=>{timers.set(++seq,fn);return seq;},clearTimeout:id=>timers.delete(id),
    window:{ACADEMY_CONFIG:{url:'https://test.invalid',key:'test'},supabase:{createClient},AcademyReliable:{configure(){},tracked:()=>true},
      addEventListener:(type,fn)=>events[type]=fn,dispatchEvent:event=>{if(event.type==='academy-realtime-reset')resets++;}},localStorage:{getItem:()=>null}};
  vm.runInNewContext(readFileSync('apps/academy/framework/store.js','utf8'),ctx);
  const store=ctx.window.AcademyStore;let connected=0;
  const a=store.channel('a',{connected:()=>connected++}),b=store.channel('b',{});
  a.send({event:'update',payload:1});b.unsubscribe();
  events['app-network-recovered']();events['app-network-recovered']();assert.equal(timers.size,1);
  const fire=[...timers.values()][0];timers.clear();fire();
  assert.equal(clients.length,2);assert.equal(clients[0].closed,true);
  assert.deepEqual(clients[1].channels.map(c=>c.name),['a']);assert.equal(resets,1);
  clients[0].channels[0].status('SUBSCRIBED');assert.equal(connected,0);
  clients[1].channels[0].status('SUBSCRIBED');assert.equal(connected,1);
  assert.equal(clients[1].channels[0].sent[0].payload,1);
  a.unsubscribe();
});
