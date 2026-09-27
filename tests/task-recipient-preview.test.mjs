import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../apps/academy/app.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('  function refreshTaskRecipientPreview('), source.indexOf('  function renderOpsTaskBoard('));
test('recipient preview combines roles and named members without duplicates', () => {
  const count = {}, preview = {};
  const people = [{id:'a',name:'小夏'}, {id:'b',name:'艾巧琴'}, {id:'c',name:'停用',access:'blocked'}];
  const stage = {
    dataset: {}, querySelectorAll: selector => selector.includes('role') ? [{value:'kitchen'}] : selector.includes(':checked') ? [{value:'a'}, {value:'b'}] : [],
    querySelector: selector => selector.includes('count') ? count : preview
  };
  const update = new Function('Auth','noticeVisibleTo','escapeHtml','staffGroupFor', code+'; return refreshTaskRecipientPreview;')(
    {list:()=>people}, ({audience},user)=>user.access !== 'blocked' && (audience.userIds.includes(user.id) || audience.departments.includes('kitchen') && user.id === 'a'), value=>value, ()=>({departments:[]})
  );
  update(stage,true);
  assert.equal(count.textContent,'2 人');
  assert.match(preview.innerHTML,/将推送给 2 人/);
  assert.match(preview.innerHTML,/小夏、艾巧琴/);
  assert.equal(stage.dataset.taskRecipientsChanged,'true');
});
