import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

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
