import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function harness(fetch) {
  const context = { URL, Headers, Request, Response, Blob, AbortController, DOMException, Promise, Map, Set, Date, performance, setTimeout, clearTimeout,
    fetch, location: { protocol: 'http:', origin: 'http://localhost', hostname: 'localhost', href: 'http://localhost/' }, navigator: { onLine: true },
    document: { head: { querySelector: () => true } }, localStorage: { getItem: () => null, setItem() {} },
    addEventListener() {}, dispatchEvent() {}, requestIdleCallback() {}, CustomEvent: class {} };
  context.window = context;
  vm.runInNewContext(readFileSync('apps/network.js', 'utf8'), context);
  return context.APP_NETWORK;
}
test('identical inflight reads share one fetch with independent response bodies', async () => {
  let count = 0, complete;
  const api = harness(() => { count++; return new Promise(resolve => { complete = resolve; }); });
  const a = api.request('https://fmxddvjgkykuqwmasigo.supabase.co/rest/v1/logs');
  const b = api.request('https://fmxddvjgkykuqwmasigo.supabase.co/rest/v1/logs');
  complete(new Response('[1]'));
  assert.deepEqual(await (await a).json(), [1]); assert.deepEqual(await (await b).json(), [1]); assert.equal(count, 1);
});
test('different credentials are not coalesced', async () => {
  let count = 0;
  const api = harness(async () => { count++; return new Response('[]'); });
  await Promise.all(['one', 'two'].map(token => api.request('https://fmxddvjgkykuqwmasigo.supabase.co/rest/v1/logs', { headers: { Authorization: token } })));
  assert.equal(count, 2);
});
test('Request objects retain body and headers on writes', async () => {
  let received;
  const api = harness(async (url, init) => { received = { url, init }; return new Response('{}'); });
  await api.request(new Request('https://fmxddvjgkykuqwmasigo.supabase.co/rest/v1/logs', { method: 'POST', headers: { apikey: 'test' }, body: '{"content":"hello"}' }));
  assert.equal(new Headers(received.init.headers).get('apikey'), 'test');
  assert.equal(new TextDecoder().decode(received.init.body), '{"content":"hello"}');
});
test('conflicts and validation errors are returned without route retry', async () => {
  let count = 0;
  const api = harness(async () => { count++; return new Response('{}', { status: 409 }); });
  assert.equal((await api.request('https://fmxddvjgkykuqwmasigo.supabase.co/rest/v1/logs', { method: 'POST', appNetworkSafeWrite: true })).status, 409);
  assert.equal(count, 1);
});
