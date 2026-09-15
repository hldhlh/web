import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
const source=readFileSync('apps/academy/framework/secure-auth.js','utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture(){
  const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};};
  const sessionStorage=storage(),localStorage=storage();
  const user={id:'u1',name:'测试员工',role:'staff',access:'full'};
  sessionStorage.setItem('academy-session-v2',JSON.stringify({...user,sessionToken:'old-token',deviceId:'device-id'}));
  sessionStorage.setItem('academy-session-v1',JSON.stringify({...user,sessionToken:'exposed-legacy-token'}));
  localStorage.setItem('academy-device-id-v1','device-id');
  let handlers;
  const state={calls:[],broadcasts:[],events:{},reply:async(action)=>action==='people'?{ok:true,users:[user]}:{ok:true,user}};
  const window={ACADEMY_CONFIG:{url:'https://example.invalid',key:'public-key'},navigator:{onLine:true},
    addEventListener:(k,fn)=>{state.events[k]=fn;},
    AcademyStore:{channel:(_,callbacks)=>{handlers=callbacks;return {send:x=>state.broadcasts.push(x)};}},
    fetch:async(url,options)=>{const {p_action,p_data}=JSON.parse(options.body);state.calls.push({action:p_action,data:p_data,options});return {ok:true,json:()=>state.reply(p_action,p_data)};}};
  const document={hidden:false,addEventListener:(k,fn)=>{state.events[k]=fn;}};
  vm.runInNewContext(source,{window,document,sessionStorage,localStorage,crypto:webcrypto,AbortController,setTimeout,clearTimeout,setInterval:()=>1});
  return {auth:window.AcademySecureAuth.create({}),state,user,document,sessionStorage,handlers:()=>handlers};
}
test('server mode never promotes publicly exposed legacy session tokens',()=>{
  const f=fixture();assert.equal(f.sessionStorage.getItem('academy-session-v1'),null);assert.equal(f.auth.session.sessionToken,'old-token');
});
test('foreground and concurrent verification share one server request',async()=>{
  const f=fixture(),pending=deferred();f.state.reply=()=>pending.promise;
  const checks=Array.from({length:6},()=>f.auth.verifySession());
  pending.resolve({ok:true,user:f.user});
  assert.ok((await Promise.all(checks)).every(Boolean));assert.equal(f.state.calls.length,1);
});
test('old verification cannot clear a new login to the same account',async()=>{
  const f=fixture(),pending=deferred();
  f.state.reply=async action=>action==='verify'?pending.promise:action==='people'?{ok:true,users:[f.user]}:{ok:true,user:f.user,sessionToken:'new-token'};
  const old=f.auth.verifySession();await f.auth.login('测试员工','correct-password');
  pending.resolve({ok:false,code:'SESSION_REPLACED'});await old;
  assert.equal(f.auth.session.sessionToken,'new-token');
});
test('untrusted broadcast verifies the server and cannot directly kick the user',async()=>{
  const f=fixture();f.auth.connectRealtime();
  await f.handlers().session({userId:'u1',token:'forged-token'});
  assert.equal(f.auth.session.sessionToken,'old-token');assert.equal(f.state.calls[0].action,'verify');
});
test('network failure preserves the session while confirmed server revocation clears it',async()=>{
  const f=fixture();f.state.reply=async()=>{throw new Error('offline');};
  await f.auth.verifySession();assert.ok(f.auth.session);
  f.state.reply=async()=>({ok:false,code:'PASSWORD_CHANGED'});
  await f.auth.verifySession();assert.equal(f.auth.session,null);assert.match(f.auth.consumeNotice(),/密码已修改/);
});
test('explicit logout wins over a pending login',async()=>{
  const f=fixture(),pending=deferred(),started=deferred();
  f.state.reply=async action=>{if(action==='login'){started.resolve();return pending.promise;}return {ok:true};};
  const login=f.auth.login('测试员工','correct-password');await started.promise;
  f.auth.logout();pending.resolve({ok:true,user:f.user,sessionToken:'new-token'});
  await assert.rejects(login,/登录状态已变化/);assert.equal(f.auth.session,null);
});
test('password change uses the server and never broadcasts a password or token',async()=>{
  const f=fixture();f.auth.connectRealtime();
  await assert.rejects(f.auth.changePassword('测试员工','old','short'),/10 至 128/);
  assert.equal(f.state.calls.length,0);
  await f.auth.changePassword('测试员工','old','new-password-strong');
  assert.equal(f.state.calls[0].action,'change_password');assert.equal(f.auth.session,null);
  assert.ok(!JSON.stringify(f.state.broadcasts).includes('new-password-strong'));
  assert.ok(!JSON.stringify(f.state.broadcasts).includes('old-token'));
  assert.equal(f.state.calls[0].options.cache,'no-store');
});
test('login failures do not create a session or claim that the password was changed',async()=>{
  const f=fixture();f.state.reply=async()=>({ok:false,code:'INVALID_CREDENTIALS'});
  await assert.rejects(f.auth.login('测试员工','incorrect'),/姓名或当前密码不正确/);
  assert.equal(f.auth.session.sessionToken,'old-token');
  await assert.rejects(f.auth.changePassword('测试员工','incorrect','new-password-strong'),/姓名或当前密码不正确/);
});
