import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../apps/academy/app.js',import.meta.url),'utf8');
const start=source.indexOf('  function renderGroupedCourses(');
const code=source.slice(start,source.indexOf('  document.addEventListener("toggle"',start));
const render=new Function('DATA','courseGroupExpansion','escapeHtml',code+';return renderGroupedCourses;')({courseGroups:[{id:'g',name:'前厅'}]},new Map(),value=>value);
test('front and backend share grouped disclosure with orphan courses under ungrouped',()=>{
 const items=[{id:'a',groupIds:['g']},{id:'b',groupIds:['deleted']}];
 const cards=items=>items.map(item=>`<button>${item.id}</button>`).join('');
 for(const scope of ['learn','ops']){
  const html=render(items,cards,scope);
  assert.match(html,/前厅/);assert.match(html,/未分组/);
  assert.equal((html.match(/<details /g)||[]).length,2);
  assert.equal((html.match(/<button>/g)||[]).length,2);
  assert.equal((render(items,cards,scope,true).match(/ open>/g)||[]).length,2);
 }
});
