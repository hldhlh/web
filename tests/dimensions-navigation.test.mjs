import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../apps/academy/pages/dimensions/collaboration.js', import.meta.url), 'utf8');
const loadFolders = source.slice(source.indexOf('  async function loadFolders()'), source.indexOf('  function folderPath('));
const parent = { id: 'parent', kind: 'folder', parentId: '' };
const child = { id: 'child', kind: 'folder', parentId: 'parent' };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture(rest) {
  return new Function('rest', 'initialFolders', `
    let catalogRequest = 0, currentFolder = 'parent', folders = initialFolders, folderRead = null;
    const folderPrefix = 'doc:dimension-folder:', allowed = () => true, deadline = p => p;
    function enterFolder(id) { currentFolder = id; catalogRequest++; }
    ${loadFolders}
    return { loadFolders, enterFolder, state: () => ({ currentFolder, folders }) };
  `)(rest, [parent, child]);
}
test('late parent listing cannot reset a newly entered subdirectory', async () => {
  const pending = deferred();
  const f = fixture(() => pending.promise);
  const read = f.loadFolders();
  f.enterFolder('child');
  pending.resolve([{ meta: parent }]);
  await read;
  assert.equal(f.state().currentFolder, 'child');
  assert.deepEqual(f.state().folders, [parent, child]);
});
test('shared stale listing verifies the selected folder instead of returning to its parent', async () => {
  const pending = deferred(); let reads = 0;
  const f = fixture(params => { reads++; return params.user_id.startsWith('eq.') ? [{ meta: child }] : pending.promise; });
  const oldRead = f.loadFolders(); f.enterFolder('child'); const newRead = f.loadFolders();
  pending.resolve([{ meta: parent }]); await Promise.all([oldRead, newRead]);
  assert.equal(f.state().currentFolder, 'child');
  assert.deepEqual(f.state().folders, [parent, child]);
  assert.equal(reads, 2);
});
test('confirmed deletion returns to the surviving parent', async () => {
  const f = fixture(params => params.user_id.startsWith('eq.') ? [] : [{ meta: parent }]);
  f.enterFolder('child'); await f.loadFolders();
  assert.equal(f.state().currentFolder, 'parent');
});
test('navigation during deletion verification cannot be overridden', async () => {
  const pending = deferred(); const verifying = deferred();
  const f = fixture(params => {
    if (params.user_id.startsWith('eq.')) { verifying.resolve(); return pending.promise; }
    return [{ meta: parent }];
  });
  f.enterFolder('child'); const read = f.loadFolders(); await verifying.promise;
  f.enterFolder('another'); pending.resolve([]); await read;
  assert.equal(f.state().currentFolder, 'another');
});
test('a failed directory check preserves the current location and known folders', async () => {
  const f = fixture(params => params.user_id.startsWith('eq.') ? Promise.reject(Error('offline')) : []);
  f.enterFolder('child'); await assert.rejects(f.loadFolders(), /offline/);
  assert.equal(f.state().currentFolder, 'child');
  assert.deepEqual(f.state().folders, [parent, child]);
});
const appSource = readFileSync(new URL('../apps/academy/app.js', import.meta.url), 'utf8');
const renderSource = appSource.slice(appSource.indexOf('  function renderEmbeddedApp('), appSource.indexOf('  function updateNotificationButton('));
for (const id of ['notes', 'jlhcdh', 'schedule', 'feedback', 'dimensions', 'store-model', 'meat-template']) test(`repeated host renders preserve ${id} but revoking permission removes it`, () => {
  let writes = 0, permitted = true;
  const app = { id, src: `./pages/${id}/index.html`, title: id };
  const frame = { getAttribute: () => app.src };
  const view = { querySelector: () => frame, set innerHTML(value) { writes++; } };
  const render = new Function('Auth', 'view', `const setTop=()=>{}, setTab=()=>{}, escapeHtml=x=>x; ${renderSource}; return renderEmbeddedApp;`)(
    { shortcuts: [app], session: {}, canShortcut: () => permitted }, () => view);
  render(id); render(id); assert.equal(writes, 0);
  permitted = false; render(id); assert.equal(writes, 1);
});

test('opening a linked project and returning restores its folder and reloads navigation', async () => {
  const showProject = source.slice(source.indexOf('  async function showProject('), source.indexOf('  async function open('));
  const backHandler = source.slice(source.indexOf("  $('libraryButton').addEventListener('click', async () => {"), source.indexOf("  $('emptyCreate').addEventListener"));
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { hidden: false, textContent: '', addEventListener(_type, fn) { this.click = fn; } });
    return elements.get(id);
  };
  const fixture = new Function('$', 'row', `
    let currentFolder = '', session = null, projectChannel = null, connected = false, retryTimer, opening = false, returnedTo;
    const editor = { openImage: async () => {}, fit() {}, notice() {} }, actor = { id: 'actor' };
    const window = { DimensionModel: { Session: class { constructor() { this.dirty = false; } checkConflicts() {} notify() {} } } };
    const document = { body: { dataset: {} } }, localStorage = { getItem: () => null }, transport = {};
    const ensureAllowed = () => {}, update = () => {}, setProjectLocation = () => {}, subscribeProject = () => {}, schedule = () => {};
    const sb = { removeChannel() {} }, enterFolder = id => { returnedTo = id; };
    ${showProject}
    ${backHandler}
    return { showProject, back: () => $('libraryButton').click(), location: () => returnedTo };
  `)(element, {});
  await fixture.showProject({ payload: { meta: { id: 'project', folderId: 'child', name: 'image' } } }, {});
  await fixture.back();
  assert.equal(fixture.location(), 'child');
  assert.equal(element('library').hidden, false);
});
