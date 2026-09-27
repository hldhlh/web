import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../apps/academy/app.js', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('  function taskBoardEntryKey('), source.indexOf('  function normalizeLessonGroupIds('));
const normalize = new Function('DATA', 'coerceId', 'coerceString', `${source.slice(source.indexOf("  function normalizeStaffGroups("), source.indexOf("  function noticeVisibleTo("))} ${functions}; return normalizeTaskBoard;`)(
  { tracks: [], lessons: [], exams: [] },
  (prefix, value) => value || prefix,
  (value, fallback) => typeof value === 'string' && value.trim() ? value.trim() : fallback
);

test('custom stage labels survive saving, reordering and reloading independently of stage titles', () => {
  const saved = normalize({ stages: [
    { id: 'one', label: '入职第一周', title: '前厅岗前必修', items: [] },
    { id: 'two', label: '独立上岗', title: '岗位考核', items: [] }
  ] });
  const reloaded = normalize(JSON.parse(JSON.stringify({ ...saved, stages: saved.stages.toReversed() })));
  assert.equal(reloaded.stages[1].label, '入职第一周');
  assert.equal(reloaded.stages[1].title, '前厅岗前必修');
  assert.equal(reloaded.stages[0].label, '独立上岗');
});

test('old stages and cleared labels preserve automatic label fallback', () => {
  for (const label of [undefined, '', '   ']) {
    const board = normalize({ stages: [{ id: 'one', title: '前厅岗前必修', label, items: [] }] });
    assert.equal(board.stages[0].label, '');
    assert.equal(board.stages[0].title, '前厅岗前必修');
  }
});

test('tasks preserve separate audiences and can share a course', () => {
  const board = normalize({ stages: [
    { id: 'one', audience: { mode: 'selected', userIds: ['a', 'a'] }, items: [{ kind: 'lesson', id: 'lesson' }] },
    { id: 'two', audience: { mode: 'manager' }, items: [{ kind: 'lesson', id: 'lesson' }] }
  ] }, [{ id: 'lesson' }], []);
  assert.deepEqual(board.stages[0].audience, { mode: 'selected', userIds: ['a'] });
  assert.equal(board.stages[1].audience.mode, 'manager');
  assert.equal(board.stages[0].items.length, 1);
  assert.equal(board.stages[1].items.length, 1);
  assert.deepEqual(normalize({ stages: [{ items: [] }] }).stages[0].audience, { mode: 'all', userIds: [] });
});

test('staff groups persist across task edits and discard invalid values', () => {
  const board = normalize({ staffGroups: { a: { department: 'front', employment: 'part' }, b: { department: 'other', employment: 'other' } }, stages: [{ items: [] }] });
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(board))).staffGroups.a, { departments: ['front'], department: 'front', employment: 'part' });
  assert.deepEqual(board.staffGroups.b, { departments: [], department: '', employment: '' });
});

test('group assignments normalize department and employment separately', () => {
  const board = normalize({ stages: [{ audience: { mode: 'group', department: 'kitchen', employment: 'full' }, items: [] }] });
  assert.equal(board.stages[0].audience.department, 'kitchen');
  assert.equal(board.stages[0].audience.employment, 'full');
});

const visible = new Function('DATA', 'Auth', 'coerceString', 'staffGroupFor', `${source.slice(source.indexOf('  function normalizeNoticeAudience('), source.indexOf('  function noticeAudienceLabel('))}; return noticeVisibleTo;`)(
  { taskBoard: { staffGroups: { a: { department: 'front', employment: 'part' }, b: { department: 'front', employment: 'full' }, c: { department: 'kitchen', employment: 'part' }, d: { departments: ['front', 'kitchen'], employment: 'part' } } } }, {},
  (value, fallback) => typeof value === 'string' && value.trim() ? value.trim() : fallback,
  id => ({ a: { department: 'front', employment: 'part' }, b: { department: 'front', employment: 'full' }, c: { department: 'kitchen', employment: 'part' }, d: { departments: ['front', 'kitchen'], employment: 'part' } })[id] || { departments: ['front'], employment: 'part' }
);
test('group audience matches both fields and excludes unassigned or blocked members', () => {
  const task = { audience: { mode: 'group', department: 'front', employment: 'part' } };
  assert.equal(visible(task, { id: 'a' }), true);
  assert.equal(visible(task, { id: 'missing' }), true);
  for (const id of ['b', 'c']) assert.equal(visible(task, { id }), false);
  assert.equal(visible(task, { id: 'a', access: 'blocked' }), false);
  assert.equal(visible({ audience: { mode: 'group', employment: 'part' } }, { id: 'c' }), true);
  assert.equal(visible({ audience: { mode: 'group' } }, { id: 'a' }), false);
});

test('multiple employee departments match either task and survive normalization', () => {
  for (const department of ['front', 'kitchen']) assert.equal(visible({ audience: { mode: 'group', department } }, { id: 'd' }), true);
  assert.equal(visible({ audience: { mode: 'group', department: 'dishwashing' } }, { id: 'd' }), false);
  const board = normalize({ staffGroups: { d: { departments: ['front', 'kitchen', 'front', 'invalid'], employment: 'part' } }, stages: [{ items: [] }] });
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(board))).staffGroups.d.departments, ['front', 'kitchen']);
});

test('role recipients match any selected department plus explicitly selected people', () => {
  const task = { audience: { mode: 'recipients', departments: ['front', 'kitchen'], userIds: ['extra'] } };
  for (const id of ['a', 'b', 'c', 'd', 'extra']) assert.equal(visible(task, { id }), true);
  assert.equal(visible(task, { id: 'a', access: 'blocked' }), false);
  assert.equal(visible({ audience: { mode: 'recipients', departments: ['dishwashing'], userIds: [] } }, { id: 'a' }), false);
  const board = normalize({ stages: [{ audience: task.audience, items: [] }] });
  assert.deepEqual(board.stages[0].audience, task.audience);
});
