import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
const source = readFileSync('apps/academy/framework/auth.js', 'utf8');
function fixture(role = 'manager', fail = false) {
  let remote = { rev: 1, users: [{ id: 'boss', name: '店长', role, access: 'full' }, { id: 'staff', name: '员工', role: 'staff', access: 'basic' }] };
  const storage = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) }; };
  const localStorage = storage(), sessionStorage = storage();
  localStorage.setItem('academy-people-cache-v1', JSON.stringify(remote.users));
  sessionStorage.setItem('academy-session-v1', JSON.stringify(remote.users[0]));
  const window = { AcademyStore: { getJSON: async () => structuredClone(remote), putJSON: async (_, value) => { if (fail) throw new Error('offline'); remote = structuredClone(value); } } };
  vm.runInNewContext(source, { window, localStorage, sessionStorage, crypto: webcrypto, setInterval, clearInterval, document: { addEventListener() {} } });
  return { auth: window.AcademyAuth, remote: () => remote, localStorage };
}
test('legacy users retain access; denial overrides full access, blocked users and unknown apps cannot enter', () => {
  const { auth } = fixture();
  assert.equal(auth.canShortcut({ role: 'staff', access: 'basic' }, 'notes'), true);
  assert.equal(auth.canShortcut({ role: 'staff', access: 'full', shortcutAccess: { notes: false } }, 'notes'), false);
  assert.equal(auth.canShortcut({ role: 'manager', access: 'full', shortcutAccess: { notes: false } }, 'notes'), true);
  assert.equal(auth.canShortcut({ role: 'manager', access: 'blocked' }, 'notes'), false);
  assert.equal(auth.canShortcut(null, 'notes'), false);
  assert.equal(auth.canShortcut({ access: 'full' }, 'unknown'), false);
});
test('manager saves individual permissions and locked visibility to accounts and public cache', async () => {
  const { auth, remote, localStorage } = fixture();
  const choices = Object.fromEntries(auth.shortcuts.map(({ id }) => [id, id !== 'meat-template']));
  await auth.setShortcutAccess('staff', choices, false);
  const user = remote().users.find(u => u.id === 'staff');
  assert.equal(user.shortcutAccess['meat-template'], false);
  assert.equal(user.hideRestrictedShortcuts, false);
  assert.equal(auth.list().find(u => u.id === 'staff').shortcutAccess['meat-template'], false);
  assert.equal(JSON.parse(localStorage.getItem('academy-people-cache-v1'))[1].shortcutAccess['meat-template'], false);
});
test('non-managers and attempts to restrict a manager are rejected', async () => {
  await assert.rejects(fixture('staff').auth.setShortcutAccess('staff', {}), /只有店长/);
  await assert.rejects(fixture().auth.setShortcutAccess('boss', {}), /店长始终/);
});
test('failed save restores previous in-memory permissions and does not claim persisted success', async () => {
  const { auth, remote } = fixture('manager', true);
  const choices = Object.fromEntries(auth.shortcuts.map(({ id }) => [id, false]));
  await assert.rejects(auth.setShortcutAccess('staff', choices), /offline/);
  assert.equal(auth.canShortcut(auth.list()[1], 'notes'), true);
  assert.equal(remote().users[1].shortcutAccess, undefined);
});
