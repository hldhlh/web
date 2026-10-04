import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { OfficeBackend, CONTENT_KEY } from '../tools/auto-office-mcp/backend.mjs';
import { createServer } from '../tools/auto-office-mcp/server.mjs';

async function fixture(t, options = {}) {
  let row = { user_id: CONTENT_KEY, ts: 10, payload: { value: { rev: 10, data: {
    lessons: [{ id: 'l', title: '课程', blocks: ['保留正文'] }], exams: [],
    notices: [{ id: 'n', title: '原通知', detail: '正文', tone: 'info', createdAt: 1, notify: true, audience: {mode:'all',userIds:[]} }],
    unknownFutureField: { preserved: true }
  } }, token: 'original' } };
  const requests = [];
  let conflict = false, role = 'manager', revoked = false;
  const backend = new OfficeBackend({ url: 'https://project.supabase.co', key: 'public-key', session: { userId: 'u', sessionToken: 'secret-token' }, request: async (url, init) => {
    const body = init.body && JSON.parse(init.body); requests.push({url,init,body});
    if (url.includes('/rpc/')) {
      if (revoked) return Response.json({ok:false,code:'SESSION_REPLACED'});
      if (body.p_action === 'people') return Response.json({ok:true,users:[{id:'u',name:'店长',role,access:'full',secret:'must not escape'}]});
      return Response.json({ok:true,user:{id:'u',name:'店长',role,access:'full'}});
    }
    if (init.method === 'PATCH') {
      assert.equal(new URL(url).searchParams.get('ts'),`eq.${row.ts}`);
      if (conflict) return Response.json([]);
      row = {...row,...body}; return Response.json([row]);
    }
    return Response.json([row,...(options.notReady ? [] : [{user_id:'doc:academy/content.json:$ready'}])]);
  } });
  const server = createServer(backend, options);
  const client = new Client({name:'test',version:'1'});
  const [a,b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b);
  t.after(async () => { await client.close(); await server.close(); });
  return { client, requests, row:()=>row, conflict:()=>{conflict=true;}, role:value=>{role=value;}, revoke:()=>{revoked=true;} };
}
const result = value => JSON.parse(value.content[0].text);

test('MCP protocol discovers tools and guide without accessing backend', async t => {
  const f = await fixture(t);
  assert.equal((await f.client.listTools()).tools.length,7);
  assert.match((await f.client.readResource({uri:'auto-office://guide'})).contents[0].text,/version/);
  assert.equal(f.requests.length,0);
});
test('update preserves unknown data, audience and publication time and writes CAS', async t => {
  const f = await fixture(t);
  const before = result(await f.client.callTool({name:'office_notice_get',arguments:{id:'n'}}));
  const updated = await f.client.callTool({name:'office_notice_update',arguments:{id:'n',expectedVersion:before.version,changes:{title:'新标题',detail:'【物品】更新内容'}}});
  assert.equal(updated.isError,undefined);
  assert.equal(result(updated).notice.createdAt,1);
  assert.deepEqual(result(updated).notice.audience,{mode:'all',userIds:[]});
  assert.deepEqual(f.row().payload.value.data.unknownFutureField,{preserved:true});
  assert.deepEqual(f.row().payload.value.data.lessons[0].blocks,['保留正文']);
  assert.ok(result(updated).version>10);
  const stale = await f.client.callTool({name:'office_notice_update',arguments:{id:'n',expectedVersion:10,changes:{title:'覆盖'}}});
  assert.equal(result(stale).code,'CONFLICT');
  assert.equal(f.requests.filter(r=>r.init.method==='PATCH').length,1);
});
test('atomic concurrent conflict does not report success or retry writes', async t => {
  const f = await fixture(t); f.conflict();
  const response = await f.client.callTool({name:'office_notice_update',arguments:{id:'n',expectedVersion:10,changes:{title:'新标题'}}});
  assert.equal(result(response).code,'CONFLICT');
  assert.equal(f.row().ts,10);
  assert.equal(f.requests.filter(r=>r.init.method==='PATCH').length,1);
});
test('create request ID deduplicates retries and rejects reuse with changed text', async t => {
  const f = await fixture(t);
  const args = {requestId:'10000000-0000-4000-8000-000000000001',title:'通知',detail:'正文'};
  const first = result(await f.client.callTool({name:'office_notice_create',arguments:args}));
  const second = result(await f.client.callTool({name:'office_notice_create',arguments:args}));
  assert.equal(second.alreadyApplied,true);
  assert.equal(first.notice.id,second.notice.id);
  assert.equal(f.row().payload.value.data.notices.length,2);
  const third = await f.client.callTool({name:'office_notice_create',arguments:{...args,detail:'不同内容'}});
  assert.equal(result(third).code,'IDEMPOTENCY_CONFLICT');
});
test('staff and revoked sessions cannot read content or write', async t => {
  const f = await fixture(t); f.role('staff');
  assert.equal(result(await f.client.callTool({name:'office_notices_list',arguments:{}})).code,'FORBIDDEN');
  f.role('manager'); f.revoke();
  assert.equal(result(await f.client.callTool({name:'office_notices_list',arguments:{}})).code,'SESSION_REPLACED');
  assert.ok(f.requests.every(r=>r.url.includes('/rpc/')));
  assert.ok(f.requests.every(r=>r.body.p_action!=='login'));
});
test('read-only mode blocks writes and people output excludes secrets', async t => {
  const f = await fixture(t,{readOnly:true});
  assert.equal(result(await f.client.callTool({name:'office_notice_update',arguments:{id:'n',expectedVersion:10,changes:{title:'拒绝'}}})).code,'READ_ONLY');
  assert.equal(f.requests.length,0);
  const people = await f.client.callTool({name:'office_people_list',arguments:{}});
  assert.ok(!JSON.stringify(people).includes('secret'));
});
test('unknown recipient, invalid schema and unmigrated content never write', async t => {
  const f = await fixture(t);
  const args = {requestId:'10000000-0000-4000-8000-000000000002',title:'通知',detail:'正文',audience:{mode:'selected',userIds:['missing']}};
  assert.equal(result(await f.client.callTool({name:'office_notice_create',arguments:args})).code,'RECIPIENT');
  assert.equal((await f.client.callTool({name:'office_notice_update',arguments:{id:'n',expectedVersion:10,changes:{createdAt:0}}})).isError,true);
  assert.equal(f.requests.filter(r=>r.init.method==='PATCH').length,0);
  const old = await fixture(t,{notReady:true});
  assert.equal(result(await old.client.callTool({name:'office_notices_list',arguments:{}})).code,'NOT_READY');
});
test('network errors and login errors cannot leak credentials', async () => {
  const backend = new OfficeBackend({url:'https://project.supabase.co',key:'public-key',name:'店长',password:'private-password',request:async()=>{throw Error('private-password');}});
  await assert.rejects(backend.authorize(),error=>error.code==='NETWORK'&&!error.message.includes('private-password'));
  await assert.rejects(backend.authorize(),error=>error.code==='CONFIG');
});

test('real stdio process initializes and exposes tools without credentials or network login', async t => {
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const { fileURLToPath } = await import('node:url');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../tools/auto-office-mcp/index.mjs', import.meta.url))],
    env: { AUTO_OFFICE_SUPABASE_URL:'https://example.invalid', AUTO_OFFICE_SUPABASE_ANON_KEY:'test-public-key' },
    stderr: 'pipe'
  });
  const client = new Client({name:'stdio-test',version:'1'});
  t.after(() => client.close());
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length,7);
  const status = result(await client.callTool({name:'office_status',arguments:{}}));
  assert.equal(status.code,'CONFIG');
});

test('write network uncertainty is surfaced without retry or leaking response data', async () => {
  let calls=0;
  const backend = new OfficeBackend({url:'https://project.supabase.co',key:'public-key',request:async()=>{calls++;throw Error('secret-response');}});
  const snapshot={row:{ts:1,payload:{}},value:{data:{}}};
  await assert.rejects(backend.saveContent(snapshot,{notices:[]},'operation'),error=>error.code==='NETWORK' && /核实/.test(error.message) && !error.message.includes('secret'));
  assert.equal(calls,1);
});
