import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const context = { window: { addEventListener() {} }, document: { addEventListener() {} } };
vm.runInNewContext(readFileSync('apps/academy/framework/reliable-store.js', 'utf8'), context);
const { merge, split } = context.window.AcademyReliable;
const plain = value => JSON.parse(JSON.stringify(value));
test('different fields merge and deletion is retained', () => {
  assert.deepEqual(plain(merge({ a: 1, b: 1 }, { a: 2, b: 1 }, { a: 1, b: 2 })), { a: 2, b: 2 });
  assert.deepEqual(plain(merge({ a: 1, b: 1 }, { b: 1 }, { a: 1, b: 2 })), { b: 2 });
});
test('same-field edit and delete-vs-edit produce a conflict', () => {
  assert.throws(() => merge({ a: 1 }, { a: 2 }, { a: 3 }), /其他设备/);
  assert.throws(() => merge({ a: 1 }, {}, { a: 2 }), /其他设备/);
});
test('ID-keyed arrays preserve independent additions and updates', () => {
  const base = [{ id: 'a', title: 'A' }];
  assert.deepEqual(plain(merge(base, [...base, { id: 'b', title: 'B' }], [{ id: 'a', title: 'new A' }])), [{ id: 'a', title: 'new A' }, { id: 'b', title: 'B' }]);
});
test('schedule and feedback are split into independent records', () => {
  assert.equal(Object.keys(split('academy/schedule.json', { assignments: { '2026-01-01': [], '2026-01-02': [] } })).length, 2);
  assert.equal(Object.keys(split('academy/daily-feedback.json', { items: [{ id: 'one' }, { id: 'two' }] })).length, 2);
});

test('keeping a local conflicting field still preserves unrelated cloud edits', () => {
  assert.deepEqual(plain(merge({ a: 1, b: 1 }, { a: 2, b: 1 }, { a: 3, b: 2 }, '', 'local')), { a: 2, b: 2 });
});
