import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const reader = readFileSync(new URL('../apps/academy/document-course.js',import.meta.url),'utf8');
function api(){
 const context={window:{},URL,document:{currentScript:{src:'https://shop.example/apps/academy/document-course.js'}},crypto:{randomUUID:()=> 'upload-1'}};
 vm.runInNewContext(reader,context);return context.window.AcademyDocuments;
}
test('document validation rejects legacy DOC, empty and oversized files with actionable errors',()=>{
 const documents=api();
 assert.equal(documents.validate({name:'安全入门.DOCX',size:2048}),'docx');
 assert.equal(documents.validate({name:'安全.pdf',size:1024}),'pdf');
 assert.throws(()=>documents.validate({name:'安全.doc',size:1024}),/另存为 DOCX 或 PDF/);
 assert.throws(()=>documents.validate({name:'安全.docx',size:0}),/为空/);
 assert.throws(()=>documents.validate({name:'安全.pdf',size:21*1024*1024}),/超过20MB/);
});
test('document URLs reject active protocols and preserve relative assets across environments',()=>{
 const documents=api();
 assert.equal(documents.normalize({url:'javascript:alert(1)',format:'docx'}),null);
 assert.equal(documents.normalize({url:'data:text/html,x',format:'txt'}),null);
 const local=documents.normalize({url:'./materials/front-safety-onboarding.docx',format:'docx',name:'安全.docx'});
 assert.equal(local.url,'./materials/front-safety-onboarding.docx');
 assert.equal(documents.safeUrl(local.url),'https://shop.example/apps/academy/materials/front-safety-onboarding.docx');
});
test('front safety exam is bound and requires every question correct',()=>{
 const context={window:{}};vm.runInNewContext(readFileSync(new URL('../apps/academy/front-safety.js',import.meta.url),'utf8'),context);
 const {lesson,exam}=context.window.AcademyFrontSafety;
 assert.equal(lesson.requiredExamId,exam.id);
 assert.equal(exam.questions.length,20);assert.equal(exam.pass,100);
 assert.equal(new Set(exam.questions.map(q=>q.id)).size,20);
 assert.ok(exam.questions.every(q=>q.explain&&q.stem));
 assert.ok(readFileSync(new URL('../apps/academy/materials/front-safety-onboarding.docx',import.meta.url)).length>10000);
});
const source=readFileSync(new URL('../apps/academy/app.js',import.meta.url),'utf8');
const estimate=new Function(source.slice(source.indexOf('  function estimateLessonDuration('),source.indexOf('  function updateLessonDuration('))+';return estimateLessonDuration;')();
test('document learning duration includes the uploaded text and linked exam',()=>{
 const result=estimate({type:'document',document:{text:'字'.repeat(600)},blocks:[],requiredExamId:'safety'},[{id:'safety',minutes:12}]);
 assert.equal(result.reading,2);assert.equal(result.minutes,14);
});
