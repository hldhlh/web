import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../apps/academy/app.js', import.meta.url), 'utf8');
const start = source.indexOf('    apply(payload) {');
const apply = source.slice(start, source.indexOf('    async pull()', start));
function fixture(route = 'home') {
  const DATA = {homeLayout:{},courseGroups:[],lessons:[],exams:[],notices:[],taskBoard:{}};
  let renders = 0, notifications = 0;
  const factory = new Function('DATA','state','Auth','HomeLayout','normalizeCourseGroups',
    'stripUnrelatedCurriculum','normalizeLesson','normalizeExam','normalizeNotice','normalizeTaskBoard',
    'saveOpsStore','currentOpsRoute','updateNotificationButton','render','refreshBackgroundView',
    `let contentRevision = 10; return { base: null, ${apply} };`);
  const identity = value => value;
  const sync = factory(DATA,{route:{name:route}},{session:{id:'test'}},{normalize:identity},
    identity,identity,identity,identity,identity,identity,() => {},() => ({}),
    () => notifications++,() => renders++,() => renders++);
  return {sync, DATA, counts:() => ({renders,notifications}), payload:() => ({rev:10,data:structuredClone(DATA)})};
}

test('equal curriculum payload and revision-only changes do not redraw', () => {
  const f = fixture();
  assert.equal(f.sync.apply(f.payload()), false);
  assert.equal(f.sync.apply({...f.payload(),rev:11}), false);
  assert.deepEqual(f.counts(), {renders:0,notifications:0});
});
test('changed content refreshes once, repeated/stale deliveries do not', () => {
  const f = fixture();
  const changed = f.payload(); changed.rev = 11; changed.data.lessons.push({id:'new'});
  assert.equal(f.sync.apply(changed), true);
  assert.equal(f.sync.apply(changed), false);
  assert.equal(f.sync.apply({rev:9,data:{...changed.data,lessons:[]}}), false);
  assert.equal(f.DATA.lessons.length, 1);
  assert.equal(f.counts().renders, 1);
});
test('active lessons, exams and subprograms update notifications without rebuilding', () => {
  for (const route of ['lesson','exam','embedded-app']) {
    const f = fixture(route);
    const changed = f.payload(); changed.data.lessons.push({id:'new'});
    assert.equal(f.sync.apply(changed), true);
    assert.deepEqual(f.counts(), {renders:0,notifications:1});
  }
});
