import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../apps/academy/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  function expandTaskItems('),source.indexOf('  function taskEntryLabel('));
const expand=new Function('taskBoardEntryKey',code+';return expandTaskItems;')((kind,id)=>kind+':'+id);
test('group tasks expand current membership and deduplicate individually selected content',()=>{
 const items=[{kind:'lesson-group',id:'g'},{kind:'lesson',id:'l'},{kind:'exam-group',id:'g'}];
 const lessons=[{id:'l',groupIds:['g']},{id:'other',groupIds:[]}];
 assert.deepEqual(expand(items,lessons,[{id:'e',track:'g'}]),[{kind:'lesson',id:'l'},{kind:'exam',id:'e'}]);
 assert.equal(expand(items,[...lessons,{id:'new',groupIds:['g']}],[]).length,2);
 assert.deepEqual(expand([{kind:'lesson-group',id:'empty'}],lessons,[]),[]);
});

test('home groups render disclosure, progress and retain expansion after refresh',()=>{
 const renderCode=source.slice(source.indexOf('  function renderHomeTaskItems('),source.indexOf('  function renderHome('));
 const render=new Function('expandTaskItems','examById','lessonById','taskBoardEntryKey','renderHomeTaskRow','taskBoardEntry','bestScore','isDone','taskEntryLabel','escapeHtml',renderCode+';return renderHomeTaskItems;')(
  items=>expand(items,[{id:'l',groupIds:['g']}],[]),()=>null,id=>({id}), (kind,id)=>kind+':'+id,task=>`<button>${task.data.id}</button>`,()=>({title:'前厅课程'}),()=>0,()=>true,()=> '课程分组',value=>value
 );
 const html=render([{kind:'lesson-group',id:'g'},{kind:'lesson',id:'l'}],'stage',new Set(['stage:lesson-group:g']));
 assert.match(html,/<details[^>]* open>/);
 assert.match(html,/前厅课程/); assert.match(html,/1\/1/);
 assert.equal((html.match(/<button>/g)||[]).length,1);
});

test('a group counts as one progress item and completes only when all members complete',()=>{
 const code=source.slice(source.indexOf('  function taskItemProgress('),source.indexOf('  function taskEntryLabel('));
 const calculate=new Function('expandTaskItems','examById','lessonById',code+';return taskItemProgress;')(items=>expand(items,[{id:'a',groupIds:['g']},{id:'b',groupIds:['g']}],[]),()=>null,id=>({id}));
 const items=[{kind:'lesson-group',id:'g'}];
 assert.deepEqual(calculate(items,entry=>entry.id==='a'),{done:0,total:1});
 assert.deepEqual(calculate(items,()=>true),{done:1,total:1});
 assert.deepEqual(calculate([{kind:'lesson-group',id:'empty'}],()=>true),{done:0,total:1});
});
