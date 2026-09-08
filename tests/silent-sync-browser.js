async page => {
  const source = await (await page.request.get('http://127.0.0.1:8772/apps/academy/framework/save-status.js')).text();
  await page.goto('about:blank');
  return page.evaluate(async source => {
    const assert = (ok, message) => { if (!ok) throw new Error(message); };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    document.body.innerHTML = '<main><input id="draft" value="正在输入"></main>';
    let notify;
    window.AcademyStore = {reliable:{subscribe(fn) { notify = fn; fn({pending:0,conflicts:0,entries:[]}); return () => {}; },flush:async () => {}}};
    new Function(source)();
    const box = document.querySelector('.save-status');
    const pending = {pending:1,conflicts:0,entries:[{key:'test',path:'progress:test'}]};
    const done = {pending:0,conflicts:0,entries:[]};
    const input = document.querySelector('#draft'); input.focus();
    notify(pending); assert(box.hidden, 'quick sync starts silently');
    notify(done); await wait(1900); assert(box.hidden, 'fast acknowledgement never flashes a toast');
    notify(pending); await wait(1900); assert(!box.hidden, 'persistent queue is visible');
    assert(document.activeElement === input && input.value === '正在输入', 'sync status does not interrupt typing');
    notify(done); await wait(1900); assert(box.hidden, 'resolved status dismisses itself');
    notify({...pending,conflicts:1,entries:[{...pending.entries[0],conflict:true,next:{completed:{}}}]});
    assert(!box.hidden && box.dataset.state === 'error', 'conflicts are never hidden by the grace period');
    const retry = box.querySelector('button');
    notify({...pending,conflicts:1,entries:[{...pending.entries[0],conflict:true,next:{completed:{}}}]});
    assert(retry === box.querySelector('button'), 'unchanged status preserves conflict controls');
    return {passed:true,scenarios:['silent fast sync','persistent queue warning','input preservation','automatic dismissal','visible stable conflict controls']};
  }, source);
}
