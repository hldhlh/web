import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const migration = readFileSync('apps/academy/sql/academy_auth.sql','utf8');
const digest = value => createHash('sha256').update(value).digest('hex');
const person = (id,name,role='staff') => ({ id,name,role,access:'full',salt:'test-salt',pass:digest(`test-salt:${name}:old-password`) });
test('protected auth database: credentials, atomic sessions, audit and password changes', async t => {
  const db = new PGlite({extensions:{pgcrypto}});
  t.after(() => db.close());
  await db.exec('create role anon; create role authenticated;');
  await db.exec(migration);
  await db.query('select academy_private.import_accounts($1::jsonb)',[JSON.stringify({users:[person('manager','测试店长','manager'),person('staff','测试员工')]})]);
  const rpc = async (action,data={}) => (await db.query('select public.academy_auth($1,$2::jsonb) as result',[action,JSON.stringify(data)])).rows[0].result;
  assert.equal((await rpc('health')).enabled,false);
  assert.equal((await rpc('login',{name:'测试店长',password:'old-password',deviceId:'device-a'})).code,'AUTH_NOT_READY');
  await db.exec('update academy_private.settings set enabled=true;');
  await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-forwarded-for':'192.0.2.10','user-agent':'Auth regression test'})]);
  await db.exec('set role anon;');
  const login = (name='测试店长',deviceId='device-a',password='old-password') => rpc('login',{name,password,deviceId});
  const creds = (result,deviceId='device-a') => ({userId:result.user.id,sessionToken:result.sessionToken,sessionVersion:result.sessionVersion,deviceId});
  let manager, staff;
  await t.test('anonymous callers cannot read or edit credentials, sessions, logs or import accounts', async () => {
    for (const table of ['accounts','sessions','login_events','settings']) {
      await assert.rejects(db.query(`select * from academy_private.${table}`),/permission denied/);
    }
    await assert.rejects(db.query("select academy_private.import_accounts('{\"users\":[]}'::jsonb)"),/permission denied/);
  });
  await t.test('legacy passwords authenticate on the server and responses contain no password material', async () => {
    manager = await login(); staff = await login('测试员工','device-staff');
    assert.equal(manager.ok,true); assert.equal(staff.ok,true);
    assert.match(manager.sessionToken,/^[a-f0-9]{64}$/);
    assert.equal(manager.user.pass,undefined); assert.equal(manager.user.salt,undefined);
    assert.equal((await rpc('people',creds(manager))).users.length,2);
    assert.equal((await rpc('people',{userId:'manager',sessionToken:'forged'})).ok,false);
  });
  await t.test('same device logins reuse one session; another device replaces it atomically', async () => {
    assert.equal((await login()).sessionToken,manager.sessionToken);
    const next = await login('测试店长','device-b');
    assert.notEqual(next.sessionToken,manager.sessionToken);
    assert.equal((await rpc('verify',creds(manager))).code,'SESSION_REPLACED');
    // Delayed logout from the old device must not overwrite the newer session.
    assert.equal((await rpc('logout',creds(manager))).code,'SESSION_REPLACED');
    assert.equal((await rpc('verify',creds(next,'device-b'))).ok,true);
    manager = next;
  });
  await t.test('late logout cannot revoke a newer same-browser login sharing its token', async () => {
    const old=manager;
    const next=await login('测试店长','device-b');
    assert.equal(next.sessionToken,old.sessionToken);
    assert.notEqual(next.sessionVersion,old.sessionVersion);
    assert.equal((await rpc('logout',creds(old,'device-b'))).code,'STALE_LOGOUT');
    assert.equal((await rpc('verify',creds(next,'device-b'))).ok,true);
    manager=next;
  });
  await t.test('manager-only append-only logs capture server facts without secrets', async () => {
    assert.equal((await login('测试员工','device-staff','wrong')).code,'INVALID_CREDENTIALS');
    assert.equal((await rpc('events',creds(staff))).code,'FORBIDDEN');
    const events = (await rpc('events',creds(manager))).events;
    assert.ok(events.some(e=>e.event==='login_failed'));
    assert.ok(events.some(e=>e.event==='session_replaced'));
    assert.ok(events.every(e=>e.forwarded_for==='192.0.2.10' && e.user_agent==='Auth regression test' && e.occurred_at));
    assert.ok(!JSON.stringify(events).includes('old-password'));
    assert.ok(!JSON.stringify(events).includes(manager.sessionToken));
    assert.ok(events.every((e,i)=>!i || BigInt(events[i-1].id)>BigInt(e.id)));
    assert.equal((await rpc('delete_events',creds(manager))).code,'INVALID_REQUEST');
  });
  await t.test('password change verifies the old password and revokes all prior sessions', async () => {
    assert.equal((await rpc('change_password',{name:'测试员工',password:'wrong',newPassword:'new-password-strong',deviceId:'device-staff'})).code,'INVALID_CREDENTIALS');
    assert.equal((await rpc('change_password',{name:'测试员工',password:'old-password',newPassword:'short',deviceId:'device-staff'})).code,'WEAK_PASSWORD');
    assert.equal((await rpc('change_password',{name:'测试员工',password:'old-password',newPassword:'new-password-strong',deviceId:'device-staff'})).ok,true);
    assert.equal((await rpc('verify',creds(staff))).code,'PASSWORD_CHANGED');
    assert.equal((await login('测试员工','device-staff')).code,'INVALID_CREDENTIALS');
    staff = await login('测试员工','device-staff','new-password-strong');
    assert.equal(staff.ok,true);
    assert.ok((await rpc('events',{...creds(manager),event:'password_changed'})).events.length);
  });
  await t.test('registration never permits self-assignment of manager privileges', async () => {
    const result = await rpc('register',{name:'新员工',password:'new-password-strong',deviceId:'device-new',role:'manager',access:'full'});
    assert.equal(result.ok,true); assert.equal(result.user.role,'staff'); assert.equal(result.user.access,'basic');
    assert.equal((await rpc('access',{...creds(result),targetId:'manager',access:'blocked'})).code,'FORBIDDEN');
  });
  await t.test('staff permission changes are enforced and old sessions cannot revive after unblocking', async () => {
    assert.equal((await rpc('access',{...creds(manager),targetId:'staff',access:'blocked'})).ok,true);
    assert.equal((await rpc('verify',creds(staff))).code,'ACCOUNT_BLOCKED');
    assert.equal((await rpc('access',{...creds(manager),targetId:'staff',access:'basic'})).ok,true);
    assert.equal((await rpc('verify',creds(staff))).code,'SESSION_ENDED');
    assert.equal((await rpc('access',{...creds(manager),targetId:'manager',access:'blocked'})).code,'MANAGER_PROTECTED');
  });
  await t.test('failed attempts are rate limited and paged logs have stable numeric ordering', async () => {
    for (let i=0;i<8;i++) assert.equal((await login('不存在员工','unknown-device','wrong')).code,'INVALID_CREDENTIALS');
    assert.equal((await login('不存在员工','unknown-device','wrong')).code,'RATE_LIMITED');
    const events = (await rpc('events',creds(manager))).events;
    assert.ok(events.length>10);
    assert.ok(events.every((e,i)=>!i || BigInt(events[i-1].id)>BigInt(e.id)));
    const before = events[5].id;
    const next = (await rpc('events',{...creds(manager),before})).events;
    assert.ok(next.every(e=>BigInt(e.id)<BigInt(before)));
  });
  await db.exec('reset role;');
  const accounts = (await db.query('select password_hash,legacy_salt from academy_private.accounts')).rows;
  assert.ok(accounts.every(a=>a.legacy_salt===null && a.password_hash.startsWith('$2')));
});
