import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function harness(fetch, overrides = {}) {
  const context = { URL, Headers, Request, Response, Blob, AbortController, DOMException, Promise, Map, Set, Date, performance, setTimeout, clearTimeout,
    fetch, location: { protocol: 'http:', origin: 'http://localhost', hostname: 'localhost', href: 'http://localhost/' }, navigator: { onLine: true },
    document: { head: { querySelector: () => true } }, localStorage: { getItem: () => null, setItem() {} },
    addEventListener() {}, dispatchEvent() {}, requestIdleCallback() {}, CustomEvent: class {} };
  Object.assign(context, overrides);
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

const project = 'https://fmxddvjgkykuqwmasigo.supabase.co';
const backup = 'https://backup.test';
const third = 'https://third.test';
function cachedOptions(origin = backup) {
  const saved = new Map([['app-network-best-v3', JSON.stringify({ origin, savedAt: 1,
    rankings: [{ origin: third, latency: 10 }, { origin: project, latency: 100 }] })]]);
  return {
    APP_NETWORK_ENDPOINTS: [{ origin: backup }, { origin: third }],
    localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) }
  };
}
test('expired rankings start immediately and use sorted fallback without waiting for probes', async () => {
  const calls = [];
  const api = harness(async url => {
    calls.push(new URL(url).origin);
    if (url.startsWith(backup)) throw new TypeError('network changed');
    return new Response('fresh');
  }, cachedOptions());
  assert.equal(await (await api.request(project + '/rest/v1/logs')).text(), 'fresh');
  assert.deepEqual(calls, [backup, third]);
  assert.equal(api.origin, third);
});
test('slow cached route is hedged and losing transport is aborted', async () => {
  let aborted = false;
  const api = harness((url, init) => url.startsWith(backup)
    ? new Promise((resolve, reject) => init.signal.addEventListener('abort', () => {
      aborted = true; reject(new DOMException('aborted', 'AbortError'));
    })) : Promise.resolve(new Response('live')), cachedOptions());
  const start = performance.now();
  assert.equal(await (await api.request(project + '/rest/v1/logs')).text(), 'live');
  assert.equal(aborted, true);
  assert.ok(performance.now() - start < 1500);
});
test('caller cancellation stops transport without starting a fallback', async () => {
  let count = 0;
  const api = harness((url, init) => {
    count++;
    return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
  }, cachedOptions());
  const controller = new AbortController();
  const pending = api.request(project + '/rest/v1/logs', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(count, 1);
});
test('network change triggers background measurements without blocking a read', async () => {
  const events = {};
  const releases = [];
  const api = harness(url => url.includes('/health')
    ? new Promise(resolve => { releases.push(resolve); }) : Promise.resolve(new Response('fresh')),
  { ...cachedOptions(), navigator: { onLine: true, connection: { addEventListener: (name, fn) => { events[name] = fn; } } } });
  events.change();
  assert.equal(await (await api.request(project + '/rest/v1/logs')).text(), 'fresh');
  assert.ok(releases.length > 0);
  releases.forEach(resolve => resolve(Response.json({ status: 'ok' })));
});
test('only configured origins can be restored from persisted rankings', () => {
  const options = cachedOptions('https://untrusted.test');
  const api = harness(async () => new Response('{}'), options);
  assert.equal(api.origin, project);
  assert.ok(api.ranking.every(item => item.origin !== 'https://untrusted.test'));
});
test('ordinary writes are sent once to the project origin', async () => {
  const calls = [];
  const api = harness(async url => { calls.push(url); return new Response('{}'); }, {
    ...cachedOptions()
  });
  await api.request(project + '/rest/v1/logs', { method: 'POST', body: '{}' });
  assert.deepEqual(calls, [project + '/rest/v1/logs']);
});

test('a previously verified same-site gateway is restored before idle discovery', async () => {
  const site = 'https://site.test';
  const saved = new Map([
    ['app-network-gateway-v1', JSON.stringify({ origin: site, at: 1, available: true })],
    ['app-network-best-v3', JSON.stringify({ origin: site, savedAt: 1 })]
  ]);
  const calls = [];
  const api = harness(async url => { calls.push(url); return new Response('live'); }, {
    location: { protocol: 'https:', origin: site, hostname: 'site.test', href: site + '/' },
    localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) }
  });
  await api.request(project + '/rest/v1/logs');
  assert.deepEqual(calls, [site + '/rest/v1/logs']);
});
test('background benchmarking persists every measured candidate', async () => {
  const options = cachedOptions();
  const api = harness(async () => Response.json({ status: 'ok' }), options);
  await api.benchmark();
  const saved = JSON.parse(options.localStorage.getItem('app-network-best-v3'));
  assert.equal(saved.rankings.length, 3);
  assert.ok(saved.rankings.every(item => Number.isFinite(item.latency)));
});
