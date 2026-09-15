import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rollout} from '../scripts/academy-auth-rollout.mjs';
const env={SUPABASE_ACCESS_TOKEN:'test-management-secret',SUPABASE_SERVICE_ROLE_KEY:'test-service-secret'};
const json=value=>({ok:true,json:async()=>value});
const asset=readFileSync('apps/academy/framework/secure-auth.js','utf8');
function fixture({active=false,changed=false,publicRetired=true}={}){
  const queries=[],writes=[],reports=[];
  const request=async(url,options={})=>{
    const path=String(url);
    if(path.includes('/database/query')){
      const body=JSON.parse(options.body);queries.push(body);
      if(body.query.startsWith('select enabled,import_fingerprint'))return json([{enabled:active,accounts:1}]);
      if(body.query.startsWith('select to_regclass'))return json([{installed:true}]);
      if(body.query.startsWith('select 1 from pg_policies'))return json(active?[{found:1}]:[]);
      if(body.query.startsWith('select import_fingerprint'))return json([{matches:!changed}]);
      if(body.query.startsWith('select enabled from'))return json([{enabled:active}]);
      if(body.query.startsWith('select id from'))return json([{id:'test-user'}]);
      if(body.query.startsWith('update academy_private.settings set enabled'))active=true;
      return json([]);
    }
    if(path.includes('/secure-auth.js'))return {ok:true,text:async()=>asset};
    if(path.includes('/index.html'))return {ok:true,text:async()=>"authMode: 'server-v1'"};
    if(options.method==='POST'){writes.push({path,body:JSON.parse(options.body)});return json({});}
    if(path.includes('/object/public/'))return json({retired:publicRetired});
    return json({users:[{id:'test-user'}]});
  };
  return {request,queries,writes,reports,report:value=>reports.push(value)};
}
test('deployment requires an explicit action and local credentials before any request',async()=>{
  let calls=0;const request=async()=>{calls++;};
  await assert.rejects(rollout(undefined,{env:{},request}),/用法/);
  await assert.rejects(rollout('activate',{env:{SUPABASE_ACCESS_TOKEN:'test'},request}),/SERVICE_ROLE_KEY/);
  assert.equal(calls,0);
});
test('status performs only read-only database calls and never logs keys',async()=>{
  const f=fixture();await rollout('status',{...f,env});
  assert.ok(f.queries.every(q=>q.read_only));assert.equal(f.writes.length,0);
  assert.ok(!JSON.stringify(f.reports).includes('secret'));
});
test('activation refuses a stale frontend before altering production settings',async()=>{
  const f=fixture();let calls=0;
  await assert.rejects(rollout('activate',{...f,env,request:async()=>{calls++;return {ok:true,text:async()=>'older-client'};}}),/拒绝切换/);
  assert.equal(calls,1);assert.equal(f.queries.length,0);
});
test('changed source accounts stop activation and undo only the new temporary guard',async()=>{
  const f=fixture({changed:true});await assert.rejects(rollout('activate',{...f,env}),/账号发生过修改/);
  assert.ok(f.queries.some(q=>q.query.startsWith('create policy')));
  assert.ok(f.queries.some(q=>q.query.startsWith('drop policy')));
  assert.ok(!f.queries.some(q=>q.query.startsWith('update academy_private.settings set enabled')));
  assert.equal(f.writes.length,0);
});
test('cutover retires only legacy auth files, retaining employee rows and other files',async()=>{
  const f=fixture();await rollout('activate',{...f,env});
  assert.equal(f.writes.length,2);
  assert.ok(f.writes.every(w=>/academy\/(accounts.json|sessions\/test-user.json)$/.test(w.path)&&w.body.retired));
  assert.ok(!f.queries.some(q=>/delete from academy_private.accounts|drop table/.test(q.query)));
  assert.equal(f.reports.at(-1).requiresFreshLogin,true);
});
test('cleanup can resume after activation without re-importing or reopening old credentials',async()=>{
  const f=fixture({active:true,publicRetired:false});
  await assert.rejects(rollout('activate',{...f,env}),/仍需核验/);
  assert.ok(!f.queries.some(q=>/drop policy|import_accounts|set enabled=false/.test(q.query)));
  assert.equal(f.writes.length,1);
});
