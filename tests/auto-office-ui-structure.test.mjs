import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const pages = ['dimensions', 'feedback', 'jlhcdh', 'meat-template', 'notes', 'schedule', 'store-model'];
const files = JSON.parse(readFileSync('deploy/public-files.json', 'utf8'));

test('every Auto Office subprogram loads the shared UI and deployed layout files', () => {
  for (const name of pages) {
    const html = readFileSync(`apps/academy/pages/${name}/index.html`, 'utf8');
    assert.match(html, /href="\.\.\/\.\.\/ui\/appearance\.css(?:\?[^\"]*)?"/, name);
    const layouts = [...html.matchAll(/href="\.\.\/\.\.\/ui\/subprograms\/([^"?]+)(?:\?[^\"]*)?"/g)];
    assert.ok(layouts.length, `${name} has no shared-directory layout`);
    for (const [, file] of layouts) {
      const path = `apps/academy/ui/subprograms/${file}`;
      assert.ok(existsSync(path), path);
      assert.ok(files.includes(path), `${path} is not in the deployment manifest`);
    }
    for (const old of ['style.css', 'styles.css', 'collaboration.css', 'typography.css']) {
      assert.equal(existsSync(`apps/academy/pages/${name}/${old}`), false, `${name}/${old} should not be kept separately`);
    }
  }
});

test('subprogram primary actions opt into the shared component', () => {
  for (const name of ['feedback', 'schedule', 'meat-template', 'notes', 'store-model']) {
    const html = readFileSync(`apps/academy/pages/${name}/index.html`, 'utf8');
    assert.match(html, /class="[^"]*\bao-primary\b/, name);
  }
});

test('portable UI assets and ordering controls use the shared entry', () => {
  assert.ok(files.includes('apps/academy/ui/core.css'));
  const core = readFileSync('apps/academy/ui/core.css', 'utf8');
  assert.match(core, /\.ao-icon-button/);
  assert.match(core, /\.ao-control/);
  for (const [, path] of core.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    assert.ok(path.startsWith('./assets/'), `non-local UI asset: ${path}`);
    assert.ok(existsSync(`apps/academy/ui/${path}`), path);
  }
  for (const name of pages) {
    const html = readFileSync(`apps/academy/pages/${name}/index.html`, 'utf8');
    assert.match(html, /href="\.\.\/\.\.\/ui\/core\.css(?:\?[^\"]*)?"/, name);
  }
  const ordering = readFileSync('apps/academy/pages/jlhcdh/index.html', 'utf8');
  assert.doesNotMatch(ordering, /darkModeBtn|toggleDarkMode|icon-moon|icon-sun/);
  assert.match(ordering, /class="[^"]*ao-icon-button/);
  assert.match(ordering, /class="[^"]*ao-control[^"]*" id="datePickerIndex"/);
});

test('subprograms use deployed shared components and stylesheets', () => {
  for (const name of pages) {
    const html = readFileSync(`apps/academy/pages/${name}/index.html`, 'utf8');
    const links = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(match => match[1]);
    for (const href of links) assert.match(href, /^\.\.\/\.\.\/ui\//, `${name}: ${href}`);
    assert.match(html, /class="[^"]*\bao-(?:button|primary|card|control|icon-button|segmented)\b/, name);
  }
  assert.ok(files.includes('apps/academy/ui/save-status.css'));
  assert.equal(existsSync('apps/academy/framework/save-status.css'), false);
  const sw = readFileSync('sw.js', 'utf8');
  assert.match(sw, /apps\/academy\/ui\/save-status\.css/);
});


test('all shared UI styles keep their assets inside the portable directory', () => {
  const root = resolve('apps/academy/ui');
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? walk(path) : path.endsWith('.css') ? [path] : [];
  });
  for (const css of walk(root)) {
    const source = readFileSync(css, 'utf8');
    for (const match of source.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)) {
      const asset = (match[1] ?? match[2] ?? match[3]).trim();
      if (asset.startsWith('data:') || asset.startsWith('#')) continue;
      const path = resolve(dirname(css), asset.split(/[?#]/)[0]);
      const location = relative(root, path);
      assert.ok(location && !location.startsWith('..') && !location.startsWith('/'), `${css}: ${asset}`);
      assert.ok(existsSync(path), `${css}: missing ${asset}`);
    }
  }
});
