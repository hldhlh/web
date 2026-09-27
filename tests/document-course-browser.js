async page => {
  const results=[];const check=(value,label)=>{if(!value)throw new Error(label);results.push(label);};
  await page.getByRole('button',{name:'创建课程与考试',exact:true}).click();
  await page.waitForSelector('#ops-lesson-document',{state:'attached'});
  await page.waitForFunction(()=>document.querySelector('[data-document-preview] .document-body')?.textContent.includes('现场带训与上岗确认'));
  check(await page.locator('#ops-lesson-type').inputValue()==='document','created document course');
  check(await page.locator('#ops-lesson-required-exam').inputValue()==='front-safety-exam','exam bound by identifier');
  check((await page.locator('[data-document-preview] table tr').count())===9,'Word table preserves header and eight practical checks');
  check((await page.locator('#ops-course-group-label').innerText()).includes('前厅'),'placed in front-of-house group');
  const persisted=await page.evaluate(()=>({lesson:ACADEMY_CONTENT.lessons.find(x=>x.id==='front-safety-onboarding'),exam:ACADEMY_CONTENT.exams.find(x=>x.id==='front-safety-exam')}));
  check(persisted.exam.pass===100&&persisted.exam.questions.length===20,'twenty questions require all correct');
  check(persisted.lesson.document.url.includes('/storage/v1/object/public/'),'starter uploads Word to document storage');
  const sanitized=await page.evaluate(()=>{
    const host=document.createElement('div');host.appendChild(AcademyDocuments.sanitize('<p onclick="alert(1)">安全<strong>正文</strong></p><script>alert(1)</script><a href="javascript:alert(1)">链接</a><img src="https://example.invalid/track" onerror="alert(1)"><iframe src="https://example.invalid"></iframe>'));
    return {text:host.textContent,unsafe:!!host.querySelector('script,iframe,[onclick],[onerror],a[href],img')};
  });
  check(!sanitized.unsafe&&sanitized.text.includes('安全正文'),'Word HTML rejects scripts, event handlers and external tracking images');
  await page.locator('#ops-lesson-document-file').setInputFiles('/Users/hulidehulihua/Documents/web/output/front-safety/前厅安全入门.docx');
  await page.waitForFunction(()=>document.querySelector('#ops-lesson-document').dataset.previewState==='ready');
  check((await page.locator('.document-editor-status').innerText()).includes('已预览'),'local Word upload previews before publishing');
  await page.getByRole('button',{name:'保存修改',exact:true}).click();
  await page.waitForURL(url=>url.hash==='#/ops?section=lessons');
  await page.reload();
  await page.getByRole('button',{name:'查看课程',exact:true}).click();
  await page.waitForSelector('[data-document-preview] .document-body');
  check((await page.locator('[data-document-preview]').innerText()).includes('洗手步骤'),'uploaded Word remains readable after reload');
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.goto('http://127.0.0.1:5503/apps/academy/index.html#/lesson/front-safety-onboarding');
  await page.waitForSelector('[data-document-preview] .document-body');
  await page.setViewportSize({width:390,height:844});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile Word preview has no page overflow');
  await page.screenshot({path:'output/playwright/front-safety-mobile-light.png',fullPage:false});
  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce',contrast:'more'});
  await page.evaluate(()=>{document.documentElement.dataset.theme='dark';document.documentElement.style.fontSize='24px';});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'dark, high contrast, large text remains within viewport');
  await page.screenshot({path:'output/playwright/front-safety-mobile-dark.png',fullPage:false});
  await page.getByRole('button',{name:'参加考试',exact:true}).click();
  await page.locator('[data-act="exam-start"]').click();
  const questions=persisted.exam.questions;
  for(let i=0;i<questions.length;i++){
    const q=questions[i];const answer=i===0?(q.answer+1)%q.options.length:q.answer;
    const label=q.type==='judge'?(answer?'正确':'错误'):q.options[answer];
    await page.locator('.opt').filter({hasText:label}).click();
    await page.getByRole('button',{name:i===questions.length-1?'交卷':'下一题',exact:true}).click();
  }
  await page.waitForURL('**/result*');
  check((await page.locator('#view').innerText()).includes('未通过'),'one wrong answer fails at 95');
  await page.goto('http://127.0.0.1:5503/apps/academy/index.html#/lesson/front-safety-onboarding');
  check((await page.locator('.lesson-completion-panel').innerText()).includes('通过考试后完成本课'),'failed exam leaves lesson incomplete');
  await page.getByRole('button',{name:'参加考试',exact:true}).click();await page.locator('[data-act="exam-start"]').click();
  for(let i=0;i<questions.length;i++){
    const q=questions[i];const label=q.type==='judge'?(q.answer?'正确':'错误'):q.options[q.answer];
    await page.locator('.opt').filter({hasText:label}).click();
    await page.getByRole('button',{name:i===questions.length-1?'交卷':'下一题',exact:true}).click();
  }
  await page.waitForURL('**/result*');
  await page.goto('http://127.0.0.1:5503/apps/academy/index.html#/lesson/front-safety-onboarding');
  check((await page.locator('.lesson-completion-panel').innerText()).includes('本课已完成'),'all correct completes linked lesson');
  await page.goto('http://127.0.0.1:5503/apps/academy/index.html#/ops?section=lessons&mode=edit&id=front-safety-onboarding');
  await page.locator('#ops-lesson-document-file').setInputFiles('/Users/hulidehulihua/Documents/web/output/front-safety/render-final/front-safety-onboarding.pdf');
  await page.waitForFunction(()=>document.querySelector('#ops-lesson-document').dataset.previewState==='ready');
  check(await page.locator('[data-document-preview] canvas').count()===1,'PDF renders without native browser plugin');
  check((await page.locator('.document-pagination').innerText()).includes('1 / 5'),'PDF page count correct');
  await page.getByRole('button',{name:'下一页',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.document-pagination span').textContent.includes('2 / 5')&&!document.querySelector('.document-pagination button:last-child').disabled);
  check((await page.locator('.document-body details').textContent()).includes('食品'),'PDF page navigation and text transcript work');
  await page.screenshot({path:'output/playwright/front-safety-pdf-mobile.png',fullPage:false});
  await page.getByRole('button',{name:'保存修改',exact:true}).click();await page.waitForURL(url=>url.hash==='#/ops?section=lessons');await page.reload();
  await page.getByRole('button',{name:'查看课程',exact:true}).click();await page.waitForSelector('[data-document-preview] canvas');
  check((await page.locator('.document-pagination').innerText()).includes('1 / 5'),'uploaded PDF survives publish and reload');
  await page.locator('#ops-lesson-document-file').setInputFiles('/Users/hulidehulihua/Documents/web/output/front-safety/broken.docx');
  await page.waitForFunction(()=>document.querySelector('#ops-lesson-document').dataset.previewState==='error');
  check((await page.locator('.document-editor-status').innerText()).includes('未能成功预览'),'corrupt Word is rejected instead of silent success');
  return {passed:results.length,results,backend:'all Supabase requests mocked'};
}
