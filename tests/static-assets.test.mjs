import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { versionStaticAssets } from '../scripts/version-static-assets.mjs';

test('content versions match preload, stay stable, and change with asset bytes', t => {
  const root = mkdtempSync(join(tmpdir(), 'static-assets-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'app.js'), 'console.log(1)');
  writeFileSync(join(root, 'style.css'), 'body{}');
  writeFileSync(join(root, 'dynamic.js'), 'void 0');
  const html = `<link rel="preload" href="./app.js?v=old" as="script"><script src="./app.js?v=old"></script><link rel="stylesheet" href="style.css"><link rel="preload" href="dynamic.js"><script src="https://cdn.example/sdk.js"></script>`;
  writeFileSync(join(root, 'index.html'), html);
  versionStaticAssets(root);
  const first = readFileSync(join(root, 'index.html'), 'utf8');
  const urls = [...first.matchAll(/\.\/app.js\?v=([a-f0-9]{16})/g)];
  assert.equal(urls.length, 2); assert.equal(urls[0][1], urls[1][1]);
  assert.match(first, /href="style.css\?v=[a-f0-9]{16}"/);
  assert.ok(first.includes('href="dynamic.js"'));
  assert.ok(first.includes('src="https://cdn.example/sdk.js"'));
  versionStaticAssets(root);
  assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), first);
  writeFileSync(join(root, 'app.js'), 'console.log(2)');
  versionStaticAssets(root);
  const next = readFileSync(join(root, 'index.html'), 'utf8');
  assert.ok(!next.includes(urls[0][0]));
  assert.equal(next.match(/style.css\?v=([a-f0-9]+)/)[1], first.match(/style.css\?v=([a-f0-9]+)/)[1]);
});

test('dynamic preloads receive content hashes and font changes invalidate stylesheet URLs', t => {
  const root = mkdtempSync(join(tmpdir(), 'static-fonts-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'dynamic.js'), 'void 0');
  writeFileSync(join(root, 'font.woff2'), 'font-one');
  writeFileSync(join(root, 'style.css'), '@font-face{src:url("./font.woff2")}');
  writeFileSync(join(root, 'index.html'), '<link rel="preload" as="script" href="dynamic.js" data-dimension-script="dynamic.js"><link rel="stylesheet" href="style.css">');
  versionStaticAssets(root);
  const first = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(first, /href="dynamic.js\?v=[a-f0-9]{16}" data-dimension-script="dynamic.js"/);
  assert.match(readFileSync(join(root, 'style.css'), 'utf8'), /font.woff2\?v=[a-f0-9]{16}/);
  versionStaticAssets(root); assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), first);
  writeFileSync(join(root, 'font.woff2'), 'font-two'); versionStaticAssets(root);
  const next = readFileSync(join(root, 'index.html'), 'utf8');
  assert.notEqual(next, first);
  assert.equal(next.match(/dynamic.js\?v=([a-f0-9]+)/)[1], first.match(/dynamic.js\?v=([a-f0-9]+)/)[1]);
});
