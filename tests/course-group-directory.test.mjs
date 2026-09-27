import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../apps/academy/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  function normalizeCourseGroups('),source.indexOf('  function taskBoardEntryKey('));
const normalize=new Function('defaultCourseGroups','coerceId','coerceString',code+';return normalizeCourseGroups;')(()=>[{id:'seed',name:'默认'}],(prefix,id)=>id,(value,fallback)=>value||fallback);
test('deleted cloud directory stays empty instead of restoring bundled groups',()=>{assert.deepEqual(normalize([]),[]);assert.equal(normalize(undefined)[0].id,'seed');});
test('cloud names and custom identifiers persist with duplicate identifiers removed',()=>{assert.deepEqual(normalize([{id:'custom',name:'新版分组'},{id:'custom',name:'重复'}]),[{id:'custom',name:'新版分组'}]);});
