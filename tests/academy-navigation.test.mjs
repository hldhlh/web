import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../apps/academy/app.js', import.meta.url), 'utf8');
const navigation = source.slice(source.indexOf('  function currentHash()'), source.indexOf('  function setTheme('));

function fixture(hash = '#/home', savedState = null) {
  const location = { hash };
  const state = { route: { name: 'home' } };
  const entries = [{ url: '/launcher', state: null }, { url: hash, state: savedState }];
  let index = 1;
  const history = {
    get state() { return entries[index].state; },
    replaceState(value, title, url) { entries[index] = { state: structuredClone(value), url }; location.hash = url; },
    pushState(value, title, url) { entries.splice(++index, Infinity, { state: value, url }); location.hash = url; },
    back() { if (index > 0) location.hash = entries[--index].url; }
  };
  const create = () => new Function('history', 'location', 'state', 'onRoute',
    `const NAVIGATION_STATE_KEY = 'academyNavigation'; ${navigation}; return { initializeNavigationState, go, goToParentPage };`
  )(history, location, state, () => {});
  let api = create();
  api.initializeNavigationState();
  return { get api() { return api; }, location, state, history, entries, reload() { api = create(); api.initializeNavigationState(); } };
}

test('browser Back exits after tabs, details, and embedded apps without accumulating entries', () => {
  const f = fixture();
  for (const hash of ['#/learn', '#/lesson/example', '#/home', '#/apps/schedule']) f.api.go(hash);
  assert.equal(f.entries.length, 2);
  f.history.back();
  assert.equal(f.location.hash, '/launcher');
});

test('in-app Back follows the internal trail and survives reload', () => {
  const f = fixture();
  f.api.go('#/learn');
  f.api.go('#/lesson/example');
  f.reload();
  f.api.goToParentPage();
  assert.equal(f.location.hash, '#/learn');
  f.api.goToParentPage();
  assert.equal(f.location.hash, '#/home');
  assert.equal(f.entries.length, 2);
});

test('returning to the previous route consumes it without creating a navigation loop', () => {
  const f = fixture();
  f.api.go('#/apps/schedule');
  f.api.go('#/home');
  assert.deepEqual(f.history.state.academyTrail, []);
  f.api.goToParentPage();
  assert.equal(f.location.hash, '#/home');
});

test('replacing an operations filter keeps its parent, and selecting the same route adds nothing', () => {
  const f = fixture();
  f.api.go('#/ops?section=tasks');
  f.api.go('#/ops?section=staff', { replace: true });
  f.api.go('#/ops?section=staff');
  assert.deepEqual(f.history.state.academyTrail, ['#/home']);
  f.api.goToParentPage();
  assert.equal(f.location.hash, '#/home');
});

test('direct subpage entry has an in-app fallback without adding browser history', () => {
  const f = fixture('#/apps/schedule');
  f.state.route = { name: 'embedded-app' };
  f.api.goToParentPage();
  assert.equal(f.location.hash, '#/home');
  assert.equal(f.entries.length, 2);
});

test('legacy navigation preserves the known parent and unrelated state on upgrade', () => {
  const f = fixture('#/lesson/example', { academyNavigation: true, academyDepth: 2, academyFrom: '#/learn', other: 42 });
  f.api.goToParentPage();
  assert.equal(f.location.hash, '#/learn');
  assert.equal(f.history.state.other, 42);
  assert.equal('academyDepth' in f.history.state, false);
});
