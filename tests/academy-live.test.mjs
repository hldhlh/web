import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync('apps/academy/app.js', 'utf8').split('  const Live = {')[1].split('\n  const ContentSync =')[0];
function fixture() {
  const channels = [], timers = new Map(); let seq = 0, reads = 0, resolveRead;
  const response = new Promise(resolve => { resolveRead = resolve; });
  const el = { dataset: {}, textContent: '' };
  const client = { channel() { const c = { on(type, filter, fn) { this.deliver = fn; return this; }, subscribe(fn) { this.status = fn; } }; channels.push(c); return c; }, removeChannel() {} };
  const state = { progress: { completed: { local: true } } };
  const saved = new Map();
  const context = { state, normalizeProgress: value => value, localStorage: { setItem: (key, value) => saved.set(key, value) }, defaults: () => ({}), Auth: { session: { id: 'a' } }, navigator: { onLine: true }, document: { hidden: false, getElementById: () => el },
    progressTable: () => 'progress', setTimeout: (fn, delay) => { timers.set(++seq, { fn, delay }); return seq; }, clearTimeout: id => timers.delete(id), setInterval: () => ++seq, clearInterval() {},
    window: { AcademyStore: { realtimeClient: () => client, reliable: { status: async () => ({ entries: [] }) }, restSelect: () => { reads++; return response; } } } };
  vm.runInNewContext('const Live = {' + source + '\nglobalThis.live = Live;', context);
  context.live.ingestStaff = () => {};
  context.live.refreshView = () => {};
  return { ...context, saved, channels, timers, el, resolveRead, reads: () => reads, settle: () => new Promise(setImmediate) };
}
test('subscribes before slow HTTP finishes; polling and events share a read', async () => {
  const f = fixture(); const connecting = f.live.connect();
  assert.equal(f.channels.length, 1);
  f.live.pull(); f.live.startPoll(); await f.settle();
  assert.equal(f.reads(), 1);
  f.channels[0].status('SUBSCRIBED');
  f.resolveRead([]); await connecting;
  assert.equal(f.el.dataset.state, 'live');
});
test('slow handshake is not destroyed by fallback timers; failure can retry', async () => {
  const f = fixture(); f.live.connect(); await f.settle();
  for (const timer of [...f.timers.values()]) timer.fn();
  await f.settle();
  assert.equal(f.live.reconnectTimer, 0);
  assert.equal(f.channels.length, 1);
  f.channels[0].status('TIMED_OUT');
  assert.ok(f.live.reconnectTimer);
  f.resolveRead([]);
});
test('SDK readiness replaces a delayed retry and offline does not retry', () => {
  const f = fixture(); f.live.scheduleReconnect(); const previous = f.live.reconnectTimer;
  f.live.scheduleReconnect(true);
  assert.equal(f.timers.has(previous), false);
  assert.equal(f.timers.get(f.live.reconnectTimer).delay, 180);
  f.live.reconnectTimer = 0; f.navigator.onLine = false; f.live.scheduleReconnect();
  assert.equal(f.live.reconnectTimer, 0);
});
function update(id = 'a', ts = 10) {
  return { eventType: 'UPDATE', new: { user_id: id, ts, payload: { completed: { remote: true } } } };
}
test('pending offline writes protect progress and cache from early UPDATE and DELETE', async () => {
  for (const event of [update(), { eventType: 'DELETE', old: { user_id: 'a' } }]) {
    const f = fixture(); let finish;
    f.window.AcademyStore.reliable.status = () => new Promise(resolve => { finish = resolve; });
    const connecting = f.live.connect();
    f.channels[0].deliver(event);
    assert.equal(f.state.progress.completed.local, true);
    assert.equal(f.saved.size, 0);
    finish({ entries: [{ path: 'progress:a' }] }); await connecting;
    assert.equal(f.state.progress.completed.local, true);
    assert.equal(f.saved.size, 0);
    assert.equal(f.reads(), 0);
  }
});
test('clean queue replays deferred update and rejects an older HTTP snapshot', async () => {
  const f = fixture(); let finish;
  f.window.AcademyStore.reliable.status = () => new Promise(resolve => { finish = resolve; });
  const connecting = f.live.connect(); f.channels[0].deliver(update());
  finish({ entries: [] }); await f.settle();
  assert.equal(f.state.progress.completed.remote, true);
  f.resolveRead([{ user_id: 'a', ts: 5, payload: { completed: { stale: true } } }]);
  await connecting;
  assert.equal(f.state.progress.completed.remote, true);
});
test('failed queue inspection stays closed and recovers on a later successful check', async () => {
  const f = fixture();
  f.window.AcademyStore.reliable.status = async () => { throw Error('IndexedDB unavailable'); };
  await f.live.connect(); f.channels[0].deliver(update());
  assert.equal(f.state.progress.completed.local, true); assert.equal(f.saved.size, 0);
  f.window.AcademyStore.reliable.status = async () => ({ entries: [] });
  f.resolveRead([]); await f.live.pull();
  assert.equal(f.state.progress.completed.remote, true);
});
test('account switch discards delayed queue results and old-channel deliveries', async () => {
  const f = fixture(); const checks = [];
  f.window.AcademyStore.reliable.status = () => new Promise(resolve => checks.push(resolve));
  const first = f.live.connect(); f.channels[0].deliver(update());
  f.Auth.session = { id: 'b' };
  const second = f.live.connect(); f.channels[0].deliver(update('b'));
  checks[0]({ entries: [] }); await first;
  assert.equal(f.live.progressGate.ready, false); assert.equal(f.saved.size, 0);
  checks[1]({ entries: [] }); f.resolveRead([]); await second;
  assert.equal(f.state.progress.completed.local, true); assert.equal(f.saved.size, 0);
});
test('local save during queue inspection takes priority over its stale result', async () => {
  const f = fixture(); let finish;
  f.window.AcademyStore.reliable.status = () => new Promise(resolve => { finish = resolve; });
  f.window.AcademyStore.saveProgress = async () => {};
  const connecting = f.live.connect();
  f.live.push(); f.channels[0].deliver(update());
  finish({ entries: [] }); await connecting;
  assert.equal(f.state.progress.completed.local, true);
  assert.equal(JSON.parse(f.saved.get('academy-progress-cache-a')).completed.local, true);
  assert.equal(f.reads(), 0);
});

test('network reset replaces an apparently healthy channel without waiting for stale flags', async () => {
  const f=fixture(); f.resolveRead([]); await f.live.connect();
  f.channels[0].status('SUBSCRIBED');
  f.live.joining=true; f.live.reconnectAttempt=5;
  const app=readFileSync('apps/academy/app.js','utf8');
  const start=app.indexOf('    window.addEventListener("academy-realtime-reset"');
  const listener=app.slice(start,app.indexOf('    window.addEventListener("app-network-change"',start));
  let recover;
  vm.runInNewContext(listener,{Live:f.live,window:{addEventListener:(_,fn)=>recover=fn},clearTimeout(){}});
  recover(); await f.settle();
  assert.equal(f.channels.length,2);assert.equal(f.live.reconnectAttempt,0);assert.equal(f.live.socketLive,false);
  f.channels[0].status('SUBSCRIBED');assert.equal(f.live.socketLive,false);
  f.channels[1].status('SUBSCRIBED');assert.equal(f.live.socketLive,true);
});
