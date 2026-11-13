import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function fixture() {
  const events = {}, timers = new Map(), clients = []; let seq = 0, now = 0;
  const document = {hidden:false, addEventListener:(type, fn) => (events[type] ||= []).push(fn)};
  const navigator = {onLine:true};
  const createClient = (origin) => {
    const client = {origin, channels:[], closed:false,
      channel(name) {
        const channel = {name, bindings:[], sent:[], tracked:[], removed:false,
          on(type, filter, fn) {this.bindings.push({type,filter,fn}); return this;},
          subscribe(fn) {this.status=fn; return this;},
          send(data) {this.sent.push(data);return Promise.resolve('ok');},
          track(data) {this.tracked.push(data);return Promise.resolve('ok');},
          presenceState() {return {user:[{name:'测试'}]};}
        }; this.channels.push(channel); return channel;
      },
      removeChannel(channel) {channel.removed=true; channel.status?.('CLOSED'); return new Promise(()=>{});},
      removeAllChannels() {this.closed=true;this.channels.forEach(c=>c.status?.('CLOSED'));return new Promise(()=>{});}
    };clients.push(client);return client;
  };
  const window = {document, ACADEMY_CONFIG:{url:'https://project.test',key:'public'}, supabase:{createClient},
    AcademyReliable:{configure(){},tracked:()=>true},
    addEventListener:(type,fn)=>(events[type] ||= []).push(fn),dispatchEvent:event=>emit(event.type)};
  const emit = type => { for (const fn of events[type] || []) fn(); };
  const context = {window,navigator,URL,CustomEvent:class{constructor(type){this.type=type;}},
    Date:{now:()=>now},Math,
    setTimeout:(fn,delay=0)=>{timers.set(++seq,{fn,at:now+delay});return seq;},clearTimeout:id=>timers.delete(id),localStorage:{getItem:()=>null}};
  vm.runInNewContext(readFileSync('apps/academy/framework/store.js','utf8'),context);
  const settle = async () => {for(let i=0;i<10;i++) await Promise.resolve();};
  const advance = async ms => {
    const end=now+ms;
    for (;;) {
      const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next) break;
      now=next[1].at;timers.delete(next[0]);next[1].fn();await settle();
    }
    now=end;await settle();
  };
  return {store:window.AcademyStore,window,document,navigator,clients,timers,emit,advance,settle};
}
test('network recovery rebuilds one shared transport without awaiting old socket closure', async () => {
  const f=fixture();let connected=0;
  const a=f.store.channel('a',{connected:()=>connected++}),b=f.store.channel('b',{});
  a.send({type:'broadcast',event:'update',payload:1});b.unsubscribe();
  f.emit('app-network-recovered');f.emit('app-network-recovered');await f.advance(180);
  assert.equal(f.clients.length,2);assert.equal(f.clients[0].closed,true);
  assert.deepEqual(f.clients[1].channels.map(c=>c.name),['a']);
  f.clients[0].channels[0].status('SUBSCRIBED');assert.equal(connected,0);
  f.clients[1].channels[0].status('SUBSCRIBED');assert.equal(connected,1);
  assert.equal(f.clients[1].channels[0].sent[0].payload,1);a.unsubscribe();
});
test('parent and child consumers share a topic and unsubscribe independently', () => {
  const f=fixture();let first=0,second=0;
  const a=f.store.channel('shared',{'changed':()=>first++});
  const b=f.store.channel('shared',{'changed':()=>second++});
  const raw=f.clients[0].channels[0];assert.equal(f.clients[0].channels.length,1);
  const send=()=>raw.bindings[0].fn({event:'changed',payload:{}});
  raw.status('SUBSCRIBED');send();assert.equal(first,1);assert.equal(second,1);
  a.unsubscribe();send();assert.equal(first,1);assert.equal(second,2);assert.equal(raw.removed,false);
  b.unsubscribe();assert.equal(raw.removed,true);send();assert.equal(second,2);
});
test('split schedule rows invalidate all subscribers but unrelated progress rows do not', () => {
  const f=fixture();let count=0;
  f.store.channel('academy-schedule-live',{'schedule-version':()=>count++});
  const binding=f.clients[0].channels[0].bindings.find(b=>b.type==='postgres_changes');
  binding.fn({new:{user_id:'doc:academy/schedule.json:2026-11-14',ts:1}});
  binding.fn({new:{user_id:'person',ts:2}});
  binding.fn({old:{user_id:'doc:academy/schedule.json:2026-11-14'}});
  assert.equal(count,2);
});
test('watchdog recovers a silent handshake and ignores old data callbacks', async () => {
  const f=fixture();let deliveries=0;
  const handle=f.store.realtimeClient().channel('progress').on('postgres_changes',{},()=>deliveries++).subscribe(()=>{});
  const old=f.clients[0].channels[0];await f.advance(15000);
  assert.equal(f.clients[0].channels.length,2);
  old.bindings[0].fn({});assert.equal(deliveries,0);
  f.clients[0].channels[1].bindings[0].fn({});assert.equal(deliveries,1);
  handle.unsubscribe();await f.advance(40000);assert.equal(f.clients[0].channels.length,2);
});
test('presence rejoins and mutation payloads are not queued for replay', async () => {
  const f=fixture();const handle=f.store.realtimeClient().channel('project').subscribe(()=>{});
  f.clients[0].channels[0].status('SUBSCRIBED');await handle.track({name:'测试'});
  f.emit('app-network-recovered');await f.advance(180);
  await handle.send({type:'postgres_changes',payload:{write:true}});
  f.clients[1].channels[0].status('SUBSCRIBED');
  assert.equal(f.clients[1].channels[0].tracked[0].name,'测试');assert.equal(f.clients[1].channels[0].sent.length,0);
});
test('offline suspends reconnects and online restores registrations on one transport', async () => {
  const f=fixture();const c=f.store.realtimeClient().channel('a').subscribe(()=>{});
  f.clients[0].channels[0].status('SUBSCRIBED');f.navigator.onLine=false;f.emit('offline');await f.advance(40000);
  assert.equal(f.clients.length,1);assert.equal(c.connected,false);
  f.navigator.onLine=true;f.emit('online');await f.advance(180);assert.equal(f.clients.length,2);
});
test('SDK arriving late starts registered channels without polling', () => {
  const f=fixture();const sdk=f.window.supabase;delete f.window.supabase;
  f.store.realtimeClient().channel('late').subscribe(()=>{});assert.equal(f.clients.length,0);
  f.window.supabase=sdk;f.emit('academy-sdk-ready');assert.equal(f.clients[0].channels.length,1);
});
test('one scheduler timer services independent jobs and never overlaps an in-flight job', async () => {
  const f=fixture();let a=0,b=0,finish;
  const first=f.store.poll(()=>{a++;return new Promise(resolve=>finish=resolve);},{interval:1000});
  const second=f.store.poll(()=>{b++;},{interval:1000});
  assert.equal(f.timers.size,1);await f.advance(3000);assert.equal(a,1);assert.equal(b,3);
  first.refresh();first.refresh();finish();await f.settle();await f.advance(0);assert.equal(a,2);
  first.stop();second.stop();assert.equal(f.timers.size,0);
});
test('hidden polling pauses, foreground refreshes immediately, failed jobs back off', async () => {
  const f=fixture();let calls=0;
  const job=f.store.poll(()=>{calls++;throw Error('offline');},{interval:1000});
  await f.advance(1000);assert.equal(calls,1);await f.advance(1000);assert.equal(calls,1);
  f.document.hidden=true;f.emit('visibilitychange');await f.advance(10000);assert.equal(calls,1);
  f.document.hidden=false;f.emit('visibilitychange');await f.advance(0);assert.equal(calls,2);job.stop();
});
test('selected WebSocket route replaces all registrations together', async () => {
  const f=fixture();f.window.APP_NETWORK={realtimeOrigin:'https://ws-a.test'};
  f.store.realtimeClient().channel('one').subscribe(()=>{});f.store.realtimeClient().channel('two').subscribe(()=>{});
  f.window.APP_NETWORK.realtimeOrigin='https://ws-b.test';f.emit('app-network-change');await f.advance(180);
  assert.equal(f.clients.length,2);assert.equal(f.clients[1].origin,'https://ws-b.test');assert.equal(f.clients[1].channels.length,2);
});
test('lost realtime accelerates an already-scheduled healthy reconciliation deadline', async () => {
  const f=fixture();let calls=0;
  const c=f.store.channel('document',{});f.clients[0].channels[0].status('SUBSCRIBED');
  f.store.poll(()=>calls++,{interval:()=>c.connected?60000:5000});
  f.clients[0].channels[0].status('CHANNEL_ERROR');await f.advance(5000);
  assert.equal(calls,1);
});
test('connection diagnostics count shared subscriptions without exposing keys', () => {
  const f=fixture();f.store.channel('same',{});f.store.channel('same',{});
  const status=f.store.connectionStatus();assert.equal(status.transportStarts,1);assert.equal(status.subscriptions,1);
  assert.equal(JSON.stringify(status).includes('public'),false);
});

test('a healthy heartbeat preserves one socket across repeated recovery events', async () => {
  const f=fixture();f.store.channel('a',{});
  const client=f.clients[0];let heartbeat, sent=0;
  // Install the socket API before creation in the next fixture transport.
  f.window.supabase.createClient=()=>({ ...client, realtime:{
    isConnected:()=>true, onHeartbeat:fn=>heartbeat=fn,
    sendHeartbeat:()=>{sent++;return Promise.resolve();}
  }});
  f.emit('offline');await f.advance(180);
  const starts=f.store.connectionStatus().transportStarts;
  f.emit('app-network-recovered');f.emit('app-network-recovered');
  assert.equal(sent,1);heartbeat('ok',125);await f.advance(1000);
  assert.equal(f.store.connectionStatus().transportStarts,starts);
  assert.equal(f.store.connectionStatus().reusedConnections,1);
  assert.equal(f.store.connectionStatus().heartbeatRttMs,125);
});
test('missing heartbeat acknowledgement replaces an apparently open stale socket', async () => {
  const f=fixture();let sends=0;
  const create=f.window.supabase.createClient;
  f.window.supabase.createClient=origin=>Object.assign(create(origin),{realtime:{
    isConnected:()=>true,onHeartbeat(){},sendHeartbeat(){sends++;return Promise.resolve();}
  }});
  f.store.channel('a',{});f.clients[0].channels[0].status('SUBSCRIBED');
  f.emit('app-network-recovered');await f.advance(3180);
  assert.equal(sends,1);assert.equal(f.clients.length,2);
});
test('recovery waits for a pending heartbeat instead of issuing a destructive second one', async () => {
  const f=fixture();let callback,sends=0;
  const create=f.window.supabase.createClient;
  f.window.supabase.createClient=origin=>Object.assign(create(origin),{realtime:{
    pendingHeartbeatRef:'pending',isConnected:()=>true,onHeartbeat:fn=>callback=fn,sendHeartbeat(){sends++;}
  }});
  f.store.channel('a',{});f.emit('app-network-recovered');callback('ok',80);await f.advance(4000);
  assert.equal(sends,0);assert.equal(f.clients.length,1);
});
