import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../apps/academy/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  function estimateLessonDuration('),source.indexOf('  function updateLessonDuration('));
const estimate=new Function(code+';return estimateLessonDuration;')();
test('duration combines text, tables, video and optional exam without counting metadata',()=>{
 const result=estimate({type:'video',videoDurationSeconds:120,requiredExamId:'e',blocks:[{type:'p',text:'字'.repeat(300),id:'ignored'},{type:'table',headers:['Header'],rows:[['word']]}]},[{id:'e',minutes:5}]);
 assert.equal(result.characters,300);assert.equal(result.words,2);assert.equal(result.video,2);assert.equal(result.examination,5);assert.equal(result.minutes,9);assert.equal(result.incomplete,false);
});
test('courses without an exam estimate reading only and missing videos are marked incomplete',()=>{
 assert.equal(estimate({type:'article',blocks:[{text:'字'.repeat(600)}]}).minutes,2);
 assert.equal(estimate({type:'video',blocks:[]}).incomplete,true);
 assert.equal(estimate({type:'article',blocks:[]}).minutes,1);
});
