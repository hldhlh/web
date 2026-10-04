import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const handlers = {};
const context = { URL, Request, self: { location: { origin: 'https://example.test' }, addEventListener: (name, fn) => { handlers[name] = fn; } } };
vm.runInNewContext(readFileSync('sw.js', 'utf8'), context);
test('same-origin backend APIs are never served by the static cache', () => {
  for (const name of ['rest', 'auth', 'storage', 'functions', 'realtime']) {
    assert.equal(context.canCache(new Request(`https://example.test/${name}/v1/data`)), false);
  }
  assert.equal(context.canCache(new Request('https://example.test/apps/academy/app.js')), true);
});
test('version manifests, ranged media, writes and raw data bypass static caching', () => {
  assert.equal(context.canCache(new Request('https://example.test/version.json')), false);
  assert.equal(context.canCache(new Request('https://example.test/media.mp4', { headers: { Range: 'bytes=0-' } })), false);
  assert.equal(context.canCache(new Request('https://example.test/app.js', { method: 'POST' })), false);
  assert.equal(context.canCache(new Request('https://example.test/data.csv')), false);
});

function worker(fetcher, cached) {
  const callbacks = {}, writes = [], waits = [], timers = [];
  const cache = { match: async () => cached, put: async (request, response) => { writes.push(await response.text()); } };
  const ctx = { URL, Request, Promise, fetch: fetcher, caches: { open: async () => cache },
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
    self: { location: { origin: 'https://example.test' }, addEventListener: (name, fn) => { callbacks[name] = fn; } } };
  vm.runInNewContext(readFileSync('sw.js', 'utf8'), ctx);
  return { writes, waits, timers, async request(url) {
    let response;
    callbacks.fetch({ request: new Request(url), waitUntil: promise => waits.push(promise), respondWith: promise => { response = promise; } });
    await new Promise(resolve => setImmediate(resolve));
    return { response };
  } };
}
function basicResponse(body) {
  const response = new Response(body);
  Object.defineProperty(response, 'type', { value: 'basic' });
  return response;
}
test('versioned Auto scripts load from local cache without a network roundtrip', async () => {
  let calls = 0;
  const fixture = worker(async () => { calls++; return basicResponse('new'); }, basicResponse('cached'));
  const { response } = await fixture.request('https://example.test/apps/academy/app.js?v=abcdef1');
  assert.equal(await (await response).text(), 'cached');
  assert.equal(calls, 0);
});
test('slow unversioned scripts fall back promptly and still finish cache refresh', async () => {
  let finish;
  const fixture = worker(() => new Promise(resolve => { finish = resolve; }), basicResponse('cached'));
  const { response } = await fixture.request('https://example.test/apps/academy/app.js');
  fixture.timers[0]();
  assert.equal(await (await response).text(), 'cached');
  finish(basicResponse('updated'));
  await Promise.all(fixture.waits);
  assert.deepEqual(fixture.writes, ['updated']);
});
test('unversioned scripts serve the current network response when it is fast', async () => {
  let mode;
  const fixture = worker(async (request, init) => { mode = init.cache; return basicResponse('updated'); }, basicResponse('cached'));
  const { response } = await fixture.request('https://example.test/apps/network.js');
  assert.equal(await (await response).text(), 'updated');
  assert.equal(mode, 'no-cache');
});
