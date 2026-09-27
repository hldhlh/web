import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../apps/academy/app.js', import.meta.url), 'utf8');
const openSource = source.slice(source.indexOf('  function openStaffGroupEditor('), source.indexOf('  function normalizeNoticeAudience('));

function fixture() {
  const listeners = {};
  const save = { disabled: false };
  const form = {};
  const cancel = {};
  const calls = [];
  const dialog = {
    querySelector(selector) { return selector === 'form' ? form : selector === '[type="submit"]' ? save : cancel; },
    addEventListener(type, handler) { listeners[type] = handler; },
    showModal() {}, remove() {}, close() {}
  };
  let created = false;
  const document = {
    activeElement: null,
    getElementById() { return created ? dialog : null; },
    body: { insertAdjacentHTML() { created = true; } }
  };
  const open = new Function('Auth', 'document', 'escapeHtml', 'staffGroupForm', 'onClick', `${openSource}; return openStaffGroupEditor;`)(
    { session: {}, isManager: () => true, list: () => [{ id: 'a', name: '员工' }] }, document, value => value, () => '', event => calls.push(event.target)
  );
  open('a');
  return { listeners, save, form, calls };
}

test('body-mounted staff dialog forwards save clicks without appRoot bubbling', () => {
  const f = fixture();
  f.listeners.click({ target: f.save });
  assert.deepEqual(f.calls, [f.save]);
});

test('keyboard submit invokes saving once without recursively clicking submit', () => {
  const f = fixture();
  let prevented = 0;
  f.form.onsubmit({ preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  assert.deepEqual(f.calls, [f.save]);
  f.save.disabled = true;
  f.form.onsubmit({ preventDefault() {} });
  assert.equal(f.calls.length, 1);
});

test('saving persists selected groups, publishes and updates the employee card', async () => {
  const branch = source.slice(source.indexOf('    if (act === "ops-staff-group-save")'), source.indexOf('    if (act === "ops-staff-auth")'));
  const summary = {};
  const identity = {};
  const row = { dataset: {}, querySelector: () => summary };
  const cancel = {};
  const editor = { querySelectorAll: () => [{ value: 'front' }, { value: 'kitchen' }], querySelector: selector => selector === '[data-staff-department]' ? { value: 'front' } : selector === '[data-staff-employment]' ? { value: 'part' } : {} };
  let closed = false;
  const dialog = { isConnected: true, querySelector: selector => selector === '[data-staff-group-id]' ? editor : cancel, close() { closed = true; this.isConnected = false; } };
  const btn = { dataset: { id: 'a' }, closest: () => dialog };
  const data = { taskBoard: { staffGroups: {} } };
  let saved = 0;
  let resolve;
  const published = new Promise(done => { resolve = done; });
  const invoke = new Function('act', 'event', 'btn', 'Auth', 'DATA', 'normalizeTaskBoard', 'saveOpsStore', 'ContentSync', 'document', 'staffGroupLabel', 'staffIdentityLabel', branch);
  invoke('ops-staff-group-save', { preventDefault() {} }, btn, { isManager: () => true, list: () => [{ id: 'a' }] }, data, value => value, () => saved++, { publish: () => published }, { querySelectorAll: () => [{ dataset: { syncKey: 'a' }, querySelector: selector => selector === '[data-staff-role]' ? identity : row }], querySelector: () => null }, () => '前厅 · 兼职', () => '前厅、后厨 · 兼职');
  assert.deepEqual(data.taskBoard.staffGroups.a, { departments: ['front', 'kitchen'], department: 'front', employment: 'part' });
  assert.equal(saved, 1);
  assert.equal(btn.disabled, true);
  assert.equal(closed, false);
  resolve();
  await published;
  await Promise.resolve();
  assert.equal(closed, true);
  assert.equal(identity.textContent, '前厅、后厨 · 兼职');
  assert.deepEqual(row.dataset, { departments: 'front,kitchen', employment: 'part' });
});
