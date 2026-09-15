import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';

const source = readFileSync('apps/academy/framework/auth.js', 'utf8');
const copy = value => structuredClone(value);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture(sessionOverrides = {}) {
  const user = { id: 'employee', name: '测试员工', role: 'staff', access: 'full', salt: 'salt',
    pass: createHash('sha256').update('salt:测试员工:password').digest('hex') };
  const initial = { id: user.id, name: user.name, role: user.role, access: user.access,
    sessionToken: 'current-token', deviceId: 'this-browser', ...sessionOverrides };
  const storage = () => { const map = new Map(); return {
    getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key)
  }; };
  const localStorage = storage(), sessionStorage = storage();
  localStorage.setItem('academy-device-id-v1', initial.deviceId);
  localStorage.setItem('academy-people-cache-v1', JSON.stringify([user]));
  sessionStorage.setItem('academy-session-v1', JSON.stringify(initial));
  const state = { lease: { userId: user.id, token: initial.sessionToken, deviceId: initial.deviceId, issuedAt: 1 },
    reads: [], writes: [], broadcasts: [], events: {}, user };
  const store = {
    async getJSON(path, options) {
      if (path === 'academy/accounts.json') return { rev: 1, users: [copy(user)] };
      state.reads.push({ path, options });
      return copy(state.lease);
    },
    async putJSON(path, value) { state.writes.push({ path, value: copy(value) }); state.lease = copy(value); },
    channel(_, handlers) { state.handlers = handlers; return { send: async value => { state.broadcasts.push(copy(value)); } }; }
  };
  const document = { hidden: false, visibilityState: 'visible', addEventListener: (name, fn) => { state.events[name] = fn; } };
  const window = { AcademyStore: store, addEventListener() {} };
  vm.runInNewContext(source, { window, document, localStorage, sessionStorage, crypto: webcrypto, TextEncoder,
    setInterval() { return 1; }, clearInterval() {} });
  return { auth: window.AcademyAuth, store, state, document };
}

test('stale or forged session broadcasts cannot directly sign out a valid session', async () => {
  const f = fixture();
  f.auth.connectRealtime();
  await f.state.handlers.session({ userId: 'employee', token: 'old-or-forged-token', deviceId: 'elsewhere' });
  assert.equal(f.auth.session?.sessionToken, 'current-token');
  assert.ok(f.state.reads.length > 0, 'broadcast must be checked against storage');
});

test('a pending verification cannot sign out a newer login to the same account', async () => {
  const f = fixture(), pending = deferred();
  const get = f.store.getJSON;
  let held = false;
  f.store.getJSON = (path, options) => {
    if (path.includes('/sessions/') && !held) { held = true; return pending.promise; }
    return get(path, options);
  };
  const oldCheck = f.auth.verifySession();
  f.state.lease = { userId: 'employee', token: 'other-token', deviceId: 'other-device', issuedAt: 2 };
  await f.auth.login('测试员工', 'password');
  const currentToken = f.auth.session.sessionToken;
  pending.resolve({ userId: 'employee', token: 'outdated-token', deviceId: 'other-device', issuedAt: 0 });
  await oldCheck;
  assert.equal(f.auth.session?.sessionToken, currentToken);
});

test('overlapping foreground checks share one read without writing a new login', async () => {
  const f = fixture(), pending = deferred();
  let reads = 0;
  f.store.getJSON = () => { reads++; return pending.promise; };
  const checks = Array.from({ length: 8 }, () => f.auth.verifySession());
  pending.resolve(copy(f.state.lease));
  assert.deepEqual(await Promise.all(checks), Array(8).fill(true));
  assert.equal(reads, 1);
  assert.equal(f.state.writes.length, 0);
});

test('one stale storage response is rechecked before ending the current session', async () => {
  const f = fixture(), get = f.store.getJSON;
  let first = true;
  f.store.getJSON = (...args) => {
    if (first) { first = false; return Promise.resolve({ userId: 'employee', token: 'old-token', deviceId: 'other-device', issuedAt: 0 }); }
    return get(...args);
  };
  assert.equal(await f.auth.verifySession(), true);
  assert.equal(f.auth.session?.sessionToken, 'current-token');
});

test('confirmed replacement on another device still signs out', async () => {
  const f = fixture();
  f.state.lease = { userId: 'employee', token: 'new-token', deviceId: 'other-device', issuedAt: 2 };
  assert.equal(await f.auth.verifySession(), false);
  assert.equal(f.auth.session, null);
  assert.match(f.auth.consumeNotice(), /其他终端登录/);
  assert.equal(f.state.reads.length, 2);
});

test('missing, malformed, or unavailable records do not prove another login', async () => {
  for (const lease of [null, {}, { userId: 'someone-else', token: 'foreign-token' }]) {
    const f = fixture(); f.state.lease = lease;
    await f.auth.verifySession();
    assert.equal(f.auth.session?.sessionToken, 'current-token');
    assert.equal(f.auth.consumeNotice(), '');
  }
  const f = fixture(); f.store.getJSON = async () => { throw new Error('offline'); };
  await f.auth.verifySession();
  assert.equal(f.auth.session?.sessionToken, 'current-token');
});

test('released session is reported as ended, without claiming another-device login', async () => {
  const f = fixture();
  f.state.lease = { userId: 'employee', token: '', deviceId: 'this-browser', releasedAt: 2 };
  await f.auth.verifySession();
  assert.equal(f.auth.session, null);
  assert.match(f.auth.consumeNotice(), /登录状态已结束/);
});

test('password-verified login in the same browser reuses its existing lease', async () => {
  const f = fixture();
  await f.auth.login('测试员工', 'password');
  assert.equal(f.auth.session.sessionToken, 'current-token');
  assert.equal(f.state.writes.length, 0);
  await assert.rejects(f.auth.login('测试员工', 'wrong-password'), /密码不正确/);
});

test('a new device login publishes an invalidation hint without a session token', async () => {
  const f = fixture(); f.auth.connectRealtime();
  f.state.lease.deviceId = 'other-device';
  await f.auth.login('测试员工', 'password');
  assert.notEqual(f.auth.session.sessionToken, 'current-token');
  assert.equal(f.state.broadcasts.length, 1);
  assert.equal(f.state.broadcasts[0].payload.token, undefined);
  assert.equal(f.state.broadcasts[0].payload.userId, 'employee');
});

test('account revocation during verification cannot restore a session', async () => {
  const f = fixture(), pending = deferred(), get = f.store.getJSON;
  f.store.getJSON = (path, options) => path.includes('/sessions/') ? pending.promise : get(path, options);
  const check = f.auth.verifySession();
  f.state.user.access = 'blocked';
  await f.auth.pull(true);
  pending.resolve(copy(f.state.lease));
  await check;
  assert.equal(f.auth.session, null);
  assert.match(f.auth.consumeNotice(), /停用/);
});

test('returning from photo selection or export leaves the valid session unchanged', async () => {
  const f = fixture();
  await f.auth.start();
  f.document.hidden = true; f.document.visibilityState = 'hidden'; f.state.events.visibilitychange();
  f.document.hidden = false; f.document.visibilityState = 'visible'; f.state.events.visibilitychange();
  await f.auth.verifySession();
  assert.equal(f.auth.session?.sessionToken, 'current-token');
  assert.equal(f.state.writes.length, 0);
  assert.ok(f.state.reads.every(read => read.options?.required === true));
});

test('a login waits for its previous logout write to finish', async () => {
  const f = fixture(), release = deferred(), releaseStarted = deferred(), put = f.store.putJSON;
  f.store.putJSON = async (path, value) => {
    if (value.token === '') { releaseStarted.resolve(); await release.promise; }
    return put(path, value);
  };
  f.auth.logout();
  await releaseStarted.promise;
  let loggedIn = false;
  const login = f.auth.login('测试员工', 'password').then(() => { loggedIn = true; });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(loggedIn, false);
  release.resolve();
  await login;
  assert.equal(f.state.lease.token, f.auth.session.sessionToken);
  assert.equal(await f.auth.verifySession(), true);
});

test('legacy tokenless state requires login instead of silently claiming the account', async () => {
  const f = fixture({ sessionToken: undefined }); f.state.lease = null;
  assert.equal(await f.auth.verifySession(), false);
  assert.equal(f.auth.session, null);
  assert.equal(f.state.writes.length, 0);
  assert.match(f.auth.consumeNotice(), /登录状态已失效/);
});

test('broadcast received during a stale valid read schedules a fresh verification', async () => {
  const f = fixture(), pending = deferred(), get = f.store.getJSON;
  const old = copy(f.state.lease);
  let first = true;
  f.store.getJSON = (...args) => { if (first) { first = false; return pending.promise; } return get(...args); };
  f.auth.connectRealtime();
  const check = f.auth.verifySession();
  f.state.lease = { userId: 'employee', token: 'new-token', deviceId: 'other-device', issuedAt: 2 };
  const event = f.state.handlers.session({ userId: 'employee', issuedAt: 2 });
  pending.resolve(old);
  await Promise.all([check, event]);
  assert.equal(f.auth.session, null);
  assert.match(f.auth.consumeNotice(), /其他终端登录/);
});

test('failed confirmation does not turn a single mismatch into a forced logout', async () => {
  const f = fixture(); let reads = 0;
  f.store.getJSON = async () => {
    if (++reads > 1) throw new Error('network unavailable');
    return { userId: 'employee', token: 'new-token', deviceId: 'other-device', issuedAt: 2 };
  };
  await f.auth.verifySession();
  assert.equal(f.auth.session?.sessionToken, 'current-token');
  assert.equal(f.auth.consumeNotice(), '');
});

test('metadata refresh does not suppress verification of a real session replacement', async () => {
  const f = fixture(), pending = deferred(), get = f.store.getJSON;
  let first = true;
  f.store.getJSON = (path, options) => {
    if (path.includes('/sessions/') && first) { first = false; return pending.promise; }
    return get(path, options);
  };
  const check = f.auth.verifySession();
  await f.auth.pull(true);
  f.state.lease = { userId: 'employee', token: 'new-token', deviceId: 'other-device', issuedAt: 2 };
  pending.resolve(copy(f.state.lease));
  assert.equal(await check, false);
  assert.equal(f.auth.session, null);
});
