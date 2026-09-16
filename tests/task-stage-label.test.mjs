import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../apps/academy/app.js', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('  function taskBoardEntryKey('), source.indexOf('  function normalizeLessonGroupIds('));
const normalize = new Function('DATA', 'coerceId', 'coerceString', `${functions}; return normalizeTaskBoard;`)(
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
