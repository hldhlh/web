import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({ window: {} });
vm.runInContext(readFileSync(new URL('../apps/academy/home-layout.js', import.meta.url), 'utf8'), context);
const normalize = value => JSON.parse(JSON.stringify(context.window.AcademyHomeLayout.normalize(value)));
test('old content without homepage settings keeps all six existing blocks', () => {
  assert.deepEqual(normalize(), { order: ['status', 'shortcuts', 'workbench', 'tasks', 'messages', 'exams'], hidden: [] });
});
test('layout migration preserves known order, drops unknown IDs and appends missing blocks', () => {
  assert.deepEqual(normalize({ order: ['exams', 'unknown', 'exams', 'status'], hidden: ['messages', 'unknown', 'messages'] }), {
    order: ['exams', 'status', 'shortcuts', 'workbench', 'tasks', 'messages'], hidden: ['messages']
  });
});
