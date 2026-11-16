import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const modules = ['reliable-store.js', 'store.js', 'secure-auth.js', 'auth.js', 'save-status.js', 'subprogram-bootstrap.js'];
const manifest = JSON.parse(readFileSync('deploy/public-files.json', 'utf8'));

test('Auto Office network modules have a single deployed location', () => {
  for (const name of modules) {
    const path = `apps/academy/network/${name}`;
    assert.ok(existsSync(path), path);
    assert.ok(manifest.includes(path), `${path} absent from deployment`);
    assert.equal(existsSync(`apps/academy/framework/${name}`), false, name);
  }
  const sw = readFileSync('sw.js', 'utf8');
  for (const name of ['reliable-store.js', 'store.js', 'save-status.js']) {
    assert.ok(sw.includes(`apps/academy/network/${name}`), `service worker: ${name}`);
  }
});

test('main and standalone subprograms load network modules in order', () => {
  const main = readFileSync('apps/academy/index.html', 'utf8');
  let last = -1;
  for (const name of modules.slice(0, 4)) {
    const at = main.indexOf(`./network/${name}`);
    assert.ok(at > last, `main loading order: ${name}`);
    last = at;
  }
  const boot = readFileSync('apps/academy/network/subprogram-bootstrap.js', 'utf8');
  let previous = -1;
  for (const module of modules.slice(0, 4)) {
    const at = boot.indexOf(`loadScript("../../network/${module}")`);
    assert.ok(at > previous, `subprogram loading order: ${module}`);
    previous = at;
  }
  assert.ok(boot.includes('loadScript("../../network/save-status.js")'));
  for (const name of ['schedule', 'feedback']) {
    const html = readFileSync(`apps/academy/pages/${name}/index.html`, 'utf8');
    assert.ok(html.includes(`src="../../network/subprogram-bootstrap.js" data-app="${name}"`));
    assert.equal(existsSync(`apps/academy/pages/${name}/bootstrap.js`), false);
  }
});
