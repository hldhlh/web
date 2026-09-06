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
