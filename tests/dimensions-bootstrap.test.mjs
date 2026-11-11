import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const base = 'apps/academy/pages/dimensions/';
const source = readFileSync(base + 'bootstrap.js', 'utf8');
const published = new Set(JSON.parse(readFileSync('deploy/public-files.json', 'utf8')));

for (const sharedClient of [false, true]) {
  test(`dimensions bootstrap dependencies are published (shared client: ${sharedClient})`, async () => {
    const requested = [], missing = [], nodes = new Map();
    const node = id => {
      if (!nodes.has(id)) nodes.set(id, { dataset: {}, hidden: true, getAttribute: () => null, focus() {} });
      return nodes.get(id);
    };
    const parent = { AcademyAuth: {}, AcademyStore: {}, document: { documentElement: { dataset: {} } } };
    if (sharedClient) parent.supabase = { createClient() {} };
    const window = { parent, addEventListener() {} };
    const document = {
      documentElement: { dataset: {} }, getElementById: node, querySelector: node, querySelectorAll: () => [],
      createElement: () => ({ remove() {} }),
      head: { append(script) {
        requested.push(script.src);
        const path = new URL(script.src, `https://test.invalid/${base}`).pathname.slice(1);
        queueMicrotask(() => {
          if (!published.has(path)) { missing.push(path); script.onerror(); return; }
          if (script.src.endsWith('supabase.min.js')) window.supabase = { createClient() {} };
          if (script.src === 'collaboration.js') window.DimensionCollab = {};
          script.onload();
        });
      } }
    };
    vm.runInNewContext(source, { window, document, URL, setTimeout, clearTimeout,
      MutationObserver: class { observe() {} disconnect() {} } });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(missing, [], 'Every dynamically requested script must be in the deployment allowlist');
    assert.ok(requested.includes('image-cache.js'));
    assert.deepEqual(requested.slice(-2), ['collaboration.js', 'batch-ui.js']);
    assert.ok(window.DimensionCollab);
    assert.equal(node('imageOperation').hidden, true);
  });
}
