import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';

test('image hashing coalesces identical immutable Blobs but verifies fresh disk Blobs', async () => {
  let calls = 0;
  const ctx = { window: {}, crypto: { subtle: { digest: (...args) => { calls++; return webcrypto.subtle.digest(...args); } } }, Uint8Array, URL,
    location: { origin: 'https://example.test' }, caches: { open: async () => null } };
  vm.runInNewContext(readFileSync('apps/academy/pages/dimensions/image-cache.js', 'utf8'), ctx);
  const cache = ctx.window.DimensionImageCache, blob = new Blob(['image']);
  const [a, b] = await Promise.all([cache.digest(blob), cache.digest(blob)]);
  assert.equal(a, b); assert.equal(calls, 1);
  await cache.put('source', blob, a); assert.equal(calls, 1);
  await assert.rejects(cache.put('source', new Blob(['tampered']), a), /校验失败/);
  assert.equal(calls, 2);
  assert.equal(await cache.digest(new Blob(['image'])), a); assert.equal(calls, 3);
});

test('SDK and editor dependencies start together using the exact hashed preload URLs', async () => {
  const names = ['image-cache.js', 'model.js', 'batch.js', 'image-processing.js', 'editor.js', 'collaboration.js', 'batch-ui.js'];
  const nodes = {}, scripts = [];
  const node = id => nodes[id] ||= { hidden: true, dataset: {}, getAttribute: () => 'false' };
  const parent = { AcademyAuth: {}, AcademyStore: {}, document: { documentElement: { dataset: {} } } };
  const ctx = { window: { parent, addEventListener() {}, DimensionCollab: {} },
    document: { querySelectorAll: () => names.map(name => ({ dataset: { dimensionScript: name }, href: `https://example.test/${name}?v=1234567890abcdef` })),
      createElement: () => ({}), getElementById: node, documentElement: { dataset: {} }, head: { append: script => scripts.push(script) } },
    MutationObserver: class { observe() {} disconnect() {} }, setTimeout: () => 1, clearTimeout() {} };
  vm.runInNewContext(readFileSync('apps/academy/pages/dimensions/bootstrap.js', 'utf8'), ctx);
  assert.equal(scripts.length, 6);
  assert.equal(scripts[0].src, '../../../vendor/supabase.min.js');
  for (const script of scripts.slice(1)) assert.ok(script.src.endsWith('?v=1234567890abcdef'));
  scripts.slice(1).forEach(script => script.onload()); await new Promise(setImmediate);
  assert.equal(scripts.length, 6); // Collaboration still waits for the SDK.
  scripts[0].onload(); await new Promise(setImmediate);
  assert.equal(scripts[6].src, 'https://example.test/collaboration.js?v=1234567890abcdef');
  scripts[6].onload(); await new Promise(setImmediate);
  assert.equal(scripts[7].src, 'https://example.test/batch-ui.js?v=1234567890abcdef');
  scripts[7].onload(); await new Promise(setImmediate);
});
