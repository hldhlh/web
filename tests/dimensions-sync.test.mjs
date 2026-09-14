import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Session } = require('../apps/academy/pages/dimensions/model.js');
const clone = value => structuredClone(value);
const actor = id => ({ id, name: `员工${id}` });
const annotation = id => ({ id, type: 'line', start: { x: 0, y: 0 }, end: { x: 50, y: 50 }, label: '' });
function backend() {
  let row = { user_id: 'doc:dimensions:test', ts: 1, payload: { meta: { name: '图', count: 0 }, annotations: {} } };
  let offline = false, lostReply = false, hook;
  const transport = {
    read: async () => { if (offline) throw Error('offline'); return clone(row); },
    cas: async (base, payload) => {
      if (offline) throw Error('offline');
      if (base.ts !== row.ts) return null;
      row = { ...row, ts: row.ts + 1, payload: clone(payload) };
      const result = clone(row);
      if (hook) { const fn = hook; hook = null; await fn(); }
      if (lostReply) { lostReply = false; throw Error('lost response'); }
      return result;
    }
  };
  return { transport, row: () => clone(row), offline: value => { offline = value; }, loseReply: () => { lostReply = true; }, hook: fn => { hook = fn; },
    session: (id, extra = {}) => new Session({ row, actor: actor(id), transport, ...extra }) };
}
test('two simultaneous creators merge without losing annotations or authors', async () => {
  const db = backend(), a = db.session('A'), b = db.session('B');
  a.edit(annotation('one')); b.edit(annotation('two'));
  await Promise.all([a.flush(), b.flush()]);
  assert.equal(Object.keys(db.row().payload.annotations).length, 2);
  assert.equal(db.row().payload.annotations.one.createdBy.id, 'A');
  assert.equal(db.row().payload.annotations.two.createdBy.id, 'B');
  assert.equal(a.dirty || b.dirty, false);
});
test('same-annotation conflict retains local work, supports keeping it as a separate annotation', async () => {
  const db = backend(), seed = db.session('A'); seed.edit(annotation('one')); await seed.flush();
  const a = db.session('A'), b = db.session('B');
  a.edit({ ...a.view()[0], label: '100 cm' }); b.edit({ ...b.view()[0], label: '200 cm' });
  await a.flush(); await b.flush();
  assert.equal(b.conflicts.size, 1); assert.equal(b.view()[0].label, '200 cm');
  assert.equal(db.row().payload.annotations.one.label, '100 cm');
  b.resolve('copy'); await b.flush();
  assert.deepEqual(b.view().map(x => x.label).sort(), ['100 cm', '200 cm']);
  assert.equal(b.view().find(x => x.label === '200 cm').createdBy.id, 'B');
});
test('offline outbox survives reopening, merges remote edits and does not resurrect tombstones', async () => {
  const db = backend(), seed = db.session('A'); seed.edit(annotation('one')); seed.edit(annotation('two')); await seed.flush();
  let saved;
  const a = db.session('A', { persist: entries => { saved = clone(entries); } });
  db.offline(true); a.edit({ ...a.view()[0], label: 'offline' }); await a.flush();
  assert.match(a.error, /offline/); assert.ok(saved.length);
  db.offline(false);
  const b = db.session('B'); b.edit(b.view()[1], true); await b.flush();
  const reopened = db.session('A', { restored: saved }); await reopened.flush();
  assert.equal(reopened.view().length, 1); assert.equal(reopened.view()[0].label, 'offline');
});
test('lost commit response is idempotent and a later edit keeps original attribution', async () => {
  const db = backend(), a = db.session('A'); a.edit(annotation('one')); db.loseReply(); await a.flush();
  const committed = db.row().ts; assert.equal(a.dirty, true);
  await a.flush(); assert.equal(a.dirty, false); assert.equal(db.row().ts, committed);
  const b = db.session('B'); b.edit({ ...b.view()[0], label: 'changed' }); await b.flush();
  assert.equal(b.view()[0].createdBy.id, 'A'); assert.equal(b.view()[0].updatedBy.id, 'B');
});
test('typing during a write rebases onto the acknowledgement instead of creating a false conflict', async () => {
  const db = backend(), a = db.session('A'); a.edit(annotation('one'));
  db.hook(async () => { a.edit({ ...a.view()[0], label: 'typed during request' }); });
  await a.flush();
  assert.equal(a.conflicts.size, 0); assert.equal(a.dirty, false);
  assert.equal(db.row().payload.annotations.one.label, 'typed during request');
});
test('delete vs edit is a conflict and choosing the team version keeps the tombstone', async () => {
  const db = backend(), seed = db.session('A'); seed.edit(annotation('one')); await seed.flush();
  const a = db.session('A'), b = db.session('B');
  a.edit(a.view()[0], true); b.edit({ ...b.view()[0], label: 'changed' });
  await a.flush(); await b.flush(); assert.equal(b.conflicts.size, 1);
  b.resolve('remote'); assert.equal(b.dirty, false); assert.deepEqual(b.view(), []);
});
test('older realtime delivery cannot roll back a newer row', async () => {
  const db = backend(), a = db.session('A'), old = db.row(); a.edit(annotation('one')); await a.flush();
  a.receive(old); assert.equal(a.view().length, 1);
});
test('full local storage reports the risk without dropping pending edits', () => {
  const db = backend(), a = db.session('A', { persist() { throw Error('quota'); } });
  a.edit(annotation('one')); assert.equal(a.dirty, true); assert.match(a.cacheError, /存储已满/);
});
