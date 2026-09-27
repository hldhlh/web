import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../apps/academy/app.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('  function staffTaskProgress('), source.indexOf('  function renderStaffTaskProgress('));
const tasks = [
  { id: 'course', items: [{ kind:'lesson', id:'l' }] },
  { id: 'mixed', items: [{kind:'lesson',id:'l'}, {kind:'exam',id:'e'}] },
  { id: 'empty', items: [] },
  { id: 'other', items: [{kind:'lesson',id:'l'}] }
];
const calculate = new Function('DATA','normalizeTaskBoard','noticeVisibleTo','examById','lessonById','lessonCompletedForProgress','expandTaskItems','taskItemProgress',code+'; return staffTaskProgress;')(
  {taskBoard:{stages:tasks}}, value=>value, task=>task.id !== 'other', id=>id === 'e' ? {pass:80}:null, id=>id === 'l' ? {id}:null, (lesson, progress)=>progress.done.includes(lesson.id), items=>items, (items, completed)=>({done:items.filter(completed).length,total:items.length})
);
test('task completion counts assigned content and does not require an exam',()=>{
  const result = calculate({id:'a'}, {done:['l'],examHistory:{e:[{score:60}]}});
  assert.equal(result.length,3);
  assert.equal(result[0].complete,true);
  assert.equal(result[1].complete,false);
  assert.equal(result[1].done,1);
  assert.equal(result[2].complete,false);
  assert.equal(calculate({}, {done:['l'],examHistory:{e:[80]}})[1].complete,true);
});
