import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
const source = readFileSync('apps/academy/pages/feedback/app.js','utf8');
test('edit eligibility requires the current author and the same Shanghai calendar day', () => {
  const state = { session: {id:'staff'} };
  const window = {AcademyAuth:{session:state.session}};
  const canEdit = new Function('window','state',`const hydrated=true; ${source.slice(source.indexOf('  function localDateKey'),source.indexOf('  function timeLabel'))} return canEdit;`)(window,state);
  const item = {createdBy:{id:'staff'},createdAt:Date.parse('2026-09-25T00:00:00+08:00')};
  assert.equal(canEdit(item,Date.parse('2026-09-25T23:59:59+08:00')),true);
  assert.equal(canEdit(item,Date.parse('2026-09-26T00:00:00+08:00')),false);
  assert.equal(canEdit({...item,createdBy:{id:'other'}},item.createdAt),false);
  window.AcademyAuth.session={id:'manager',role:'manager'};
  assert.equal(canEdit(item,item.createdAt),false);
  window.AcademyAuth.session=null;
  assert.equal(canEdit(item,item.createdAt),false);
});
test('database enforces author/day, immutable attribution and separate manager status permission', async t => {
  const db = new PGlite({extensions:{pgcrypto}});
  t.after(()=>db.close());
  await db.exec('create role anon; create role authenticated;');
  await db.exec(readFileSync('apps/academy/sql/academy_auth.sql','utf8'));
  await db.exec(`create table public.academy_progress(user_id text primary key,payload jsonb,ts bigint,updated_at timestamptz);
    grant select,insert,update,delete on public.academy_progress to anon;`);
  await db.exec(readFileSync('apps/academy/sql/academy_feedback_edit.sql','utf8'));
  const users = ['staff','other','manager'].map(id=>({id,name:id,role:id==='manager'?'manager':'staff',access:'full',salt:'s',pass:createHash('sha256').update(`s:${id}:password`).digest('hex')}));
  await db.query('select academy_private.import_accounts($1::jsonb)',[JSON.stringify({users})]);
  await db.exec('update academy_private.settings set enabled=true; set role anon;');
  const sessions = {};
  for (const user of users) sessions[user.id] = (await db.query("select public.academy_auth('login',$1::jsonb) as result",[JSON.stringify({name:user.id,password:'password',deviceId:'device-test'})])).rows[0].result;
  const now = Date.now();
  const original = {id:'today',title:'原问题',detail:'具体情况',category:'other',status:'open',createdAt:now,createdBy:{id:'staff',name:'staff'},updatedAt:now,updatedBy:'staff'};
  const key = id=>`doc:academy/daily-feedback.json:${id}`;
  for (const id of ['today','yesterday']) await db.query('insert into academy_progress(user_id,payload) values($1,$2)',[key(id),{value:{...original,id,createdAt:id==='today'?now:now-86400000}}]);
  const auth = id=>db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-academy-user-id':id,'x-academy-session-token':sessions[id]?.sessionToken||'forged'})]);
  const update = (value,id='today')=>db.query('update academy_progress set payload=$1 where user_id=$2',[{value},key(id)]);
  await auth('staff');
  await update({...original,title:'修改一次'});
  await update({...original,title:'修改两次'});
  await assert.rejects(update({...original,createdBy:{id:'other'}}),/归属/);
  await assert.rejects(update({...original,status:'resolved'}),/只有店长/);
  await assert.rejects(update({...original,id:'yesterday',createdAt:now-86400000,title:'昨天改动'},'yesterday'),/本人当天/);
  await auth('other');
  await assert.rejects(update({...original,title:'他人改动'}),/本人当天/);
  await auth('manager');
  await assert.rejects(update({...original,title:'店长改动'}),/本人当天/);
  await update({...original,title:'修改两次',status:'resolved'});
  await auth('staff');
  await update({...original,title:'解决后修改',status:'resolved'});
  await assert.rejects(db.query('delete from academy_progress where user_id=$1',[key('today')]),/删除标记/);
  await assert.rejects(update(null,'yesterday'),/本人当天/);
  await auth('other');
  await assert.rejects(update(null),/本人当天/);
  await auth('manager');
  await assert.rejects(update(null),/本人当天/);
  await auth('forged');
  await assert.rejects(update(null),/登录状态/);
  await auth('staff');
  await update(null);
  const deleted = (await db.query('select payload from academy_progress where user_id=$1',[key('today')])).rows[0];
  assert.equal(deleted.payload.value,null);
  await assert.rejects(update(original),/已删除/);
  await auth('forged');
  await assert.rejects(update(original),/登录状态/);
});
test('saving an edit updates the existing item without resetting status or attribution; expiry prevents writes', async () => {
  const original = {id:'one',title:'旧标题',detail:'旧内容',category:'other',createdAt:Date.now(),createdBy:{id:'staff',name:'员工'},status:'resolved'};
  const state = {editingId:'one',session:{id:'staff',name:'员工'},filter:'resolved',data:{items:[original]}};
  const fields = {'#feedback-title':{value:'新标题'},'#feedback-detail':{value:'新内容'},'#feedback-category':{value:'service'}};
  const $ = key=>fields[key] ||= {};
  let allowed = true, writes = 0;
  const messages = [];
  const submit = new Function('state','$','window','crypto','canEdit','readLatest','writeData','closeCompose','showToast',`
    const hydrated=true,CATEGORIES={service:'服务'}; let writeGeneration=0,pullAgain=false;
    function render(){};
    ${source.slice(source.indexOf('  async function submitFeedback'),source.indexOf('  async function updateStatus'))}
    return submitFeedback;
  `)(state,$,{AcademyAuth:{session:state.session}},{randomUUID:()=> 'unused'},()=>allowed,
    async()=>structuredClone(state.data),async next=>{state.data=next;writes++;},()=>{state.editingId=null;},message=>messages.push(message));
  await submit();
  assert.equal(writes,1);
  assert.equal(state.data.items.length,1);
  assert.deepEqual(state.data.items[0],{...original,title:'新标题',detail:'新内容',category:'service',updatedAt:state.data.items[0].updatedAt,updatedBy:'staff'});
  assert.equal(state.filter,'resolved');
  state.editingId='one'; allowed=false;
  await submit();
  assert.equal(writes,1);
  assert.match(messages.at(-1),/本人当天/);
  assert.equal(state.editingId,'one');
  assert.equal($('#submit-feedback').disabled,false);
});
test('deletion confirms, preserves other items, and rechecks permission before saving', async () => {
  const item={id:'one',title:'反馈'};
  const other={id:'two',title:'其他反馈'};
  const state={data:{items:[item,other]},saving:false};
  let allowed=true,confirmed=true,writes=0,confirmations=0,expire=false,fail=false;
  const messages=[];
  const remove=new Function('state','window','canEdit','readLatest','writeData','showToast',`
    const hydrated=true; let writeGeneration=0,pullAgain=false;
    function render(){};
    ${source.slice(source.indexOf('  async function deleteFeedback'),source.indexOf('  async function updateStatus'))}
    return deleteFeedback;
  `)(state,{confirm:()=>{confirmations++;return confirmed;}},value=>Boolean(value && allowed),
    async()=>{if(expire)allowed=false;return structuredClone(state.data);},
    async next=>{if(fail)throw new Error('offline');writes++;state.data=next;},message=>messages.push(message));
  confirmed=false;await remove('one');assert.equal(writes,0);
  confirmed=true;allowed=false;await remove('one');assert.equal(confirmations,1);
  allowed=true;expire=true;await remove('one');assert.equal(writes,0);assert.match(messages.at(-1),/本人当天/);
  allowed=true;expire=false;fail=true;await remove('one');assert.equal(state.data.items.length,2);assert.equal(state.saving,false);
  fail=false;await remove('one');assert.equal(writes,1);assert.deepEqual(state.data.items,[other]);
  await remove('one');assert.equal(writes,1);
});
