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
  assert.equal((await f.client.listTools()).tools.length,21);
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
  assert.equal((await client.listTools()).tools.length,21);
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

test('dimensions MCP preview/apply/undo use CAS, retain fields and deduplicate uncertain replies', async t => {
  const projectId='10000000-0000-4000-8000-000000000001';
  let row={user_id:`doc:dimensions:${projectId}`,ts:10,payload:{meta:{id:projectId,width:900,height:650},annotations:{a:{id:'a',type:'line',start:{x:10,y:10},end:{x:100,y:100},label:'before',version:'v1',createdAt:'2026',unknown:1}},future:true}},writes=0,conflict=false;
  const backend=new OfficeBackend({url:'https://project.supabase.co',key:'public',session:{userId:'u',sessionToken:'secret'},request:async(url,init)=>{
    if(url.includes('/rpc/'))return Response.json({ok:true,user:{id:'u',name:'测试',role:'manager'}});
    const query=new URL(url).searchParams;assert.equal(query.get('user_id'),`eq.doc:dimensions:${projectId}`);
    if(init.method==='PATCH'){writes++;assert.equal(query.get('ts'),`eq.${row.ts}`);if(conflict)return Response.json([]);row={...row,...JSON.parse(init.body)};}
    return Response.json([row]);
  }});
  const server=createServer(backend),client=new Client({name:'test',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);t.after(async()=>{await client.close();await server.close();});
  const call=async(name,args)=>result(await client.callTool({name:`office_dimensions_${name}`,arguments:args}));
  assert.equal((await call('get',{projectId})).annotations[0].label,'before');
  const input={projectId,expectedVersion:10,requestId:'batch1',operations:[{op:'update',id:'a',changes:{label:'after'}}]};
  assert.equal((await call('preview',input)).changes.length,1);assert.equal(writes,0);
  const saved=await call('apply',input);assert.equal(saved.annotations[0].label,'after');assert.equal(saved.annotations[0].unknown,1);assert.equal(row.payload.future,true);
  assert.equal((await call('apply',input)).alreadyApplied,true);assert.equal(writes,1);
  conflict=true;assert.equal((await call('apply',{...input,requestId:'batch2',expectedVersion:row.ts})).code,'CONFLICT');assert.equal(writes,2);conflict=false;
  const undone=await call('undo',{projectId,expectedVersion:row.ts,requestId:'undo1'});assert.equal(undone.annotations[0].label,'before');
});

test('multi-project operations isolate conflicts and deduplicate retries', async t => {
  const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'];
  const rows=new Map(ids.map(id=>[id,{user_id:`doc:dimensions:${id}`,ts:10,payload:{meta:{id,width:100,height:100},annotations:{},future:true}}]));
  let writes=0;
  const backend={authorize:async()=>({id:'u',name:'测试',role:'manager'}),readDimensions:async id=>structuredClone(rows.get(id)),saveDimensions:async(row,payload)=>{writes++;const id=row.payload.meta.id;if(id===ids[1]) throw new (await import('../tools/auto-office-mcp/backend.mjs')).OfficeError('CONFLICT','冲突');const next={...row,ts:row.ts+1,payload};rows.set(id,next);return next;}};
  const server=createServer(backend),client=new Client({name:'test',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);t.after(async()=>{await client.close();await server.close();});
  const call=async(name,args)=>result(await client.callTool({name:`office_dimensions_${name}`,arguments:args}));
  const projects=ids.map((projectId,i)=>({projectId,expectedVersion:10,requestId:`r${i}`,operations:[{op:'create',id:'x',changes:{type:'line',start:{x:1,y:1},end:{x:2,y:2},label:'待测 cm'}}]}));
  assert.equal((await call('get_many',{projectIds:ids})).results.length,2);
  assert.equal((await call('preview_many',{projects})).results.filter(r=>r.ok).length,2);assert.equal(writes,0);
  const applied=await call('apply_many',{projects});assert.equal(applied.results[0].ok,true);assert.equal(applied.results[1].code,'CONFLICT');assert.equal(rows.get(ids[0]).payload.future,true);
  const retry=await call('apply_many',{projects});assert.equal(retry.results[0].alreadyApplied,true);assert.equal(retry.results[1].code,'CONFLICT');assert.equal(writes,3);
});

test('image retrieval validates project paths and returns MCP image blocks', async t => {
  const id='10000000-0000-4000-8000-000000000001';
  const row={user_id:`doc:dimensions:${id}`,ts:1,payload:{meta:{id,width:100,height:80,thumbnailPath:`academy/dimensions/${id}/preview.jpg`},annotations:{}}};
  const backend=new OfficeBackend({url:'https://project.supabase.co',key:'public',session:{userId:'u'},request:async(url)=>url.includes('/rpc/')?Response.json({ok:true,user:{id:'u',name:'测试',role:'manager'}}):url.includes('/rest/')?Response.json([row]):new Response(new Uint8Array([1,2,3]),{status:200})});
  const server=createServer(backend),client=new Client({name:'test',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);t.after(async()=>{await client.close();await server.close();});
  const response=await client.callTool({name:'office_dimensions_images',arguments:{projectIds:[id]}});
  assert.equal(response.structuredContent.results[0].width,100);assert.equal(response.content[1].type,'image');assert.equal(response.content[1].mimeType,'image/jpeg');
  row.payload.meta.thumbnailPath='academy/dimensions/other/preview.jpg';
  const invalid=await client.callTool({name:'office_dimensions_images',arguments:{projectIds:[id]}});assert.equal(invalid.structuredContent.results[0].code,'NOT_FOUND');
});


test('MCP uploads images independently, reconciles retries and never overwrites existing bytes', async t => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lYkAAAAASUVORK5CYII=';
  const id = '10000000-0000-4000-8000-000000000001', badId = '10000000-0000-4000-8000-000000000002';
  const rows = new Map(), objects = new Map(); let posts = 0, rowWrites = 0, loseResponse = true;
  const backend = new OfficeBackend({url:'https://project.supabase.co',key:'public',session:{userId:'u',sessionToken:'secret'},request:async(url,init)=>{
    if(url.includes('/rpc/')) return Response.json({ok:true,user:{id:'u',name:'店长',role:'manager'}});
    if(url.includes('/storage/')) {
      if(init.method === 'POST') { posts++; if(objects.has(url)) return Response.json({}, {status:409}); objects.set(url,Buffer.from(init.body)); if(loseResponse){loseResponse=false;throw Error('lost');} return Response.json({}); }
      return objects.has(url) ? new Response(objects.get(url)) : new Response('',{status:404});
    }
    if(init.method === 'POST') {rowWrites++; const row=JSON.parse(init.body); rows.set(row.user_id,row); return Response.json([row]);}
    const key=new URL(url).searchParams.get('user_id').slice(3); return Response.json(rows.has(key)?[rows.get(key)]:[]);
  }});
  const server=createServer(backend),client=new Client({name:'test',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);t.after(async()=>{await client.close();await server.close();});
  const call=async images=>result(await client.callTool({name:'office_dimensions_upload_many',arguments:{images}}));
  const input={projectId:id,name:'测试.png',mimeType:'image/png',data:png};
  const first=await call([input,{projectId:badId,name:'错误.png',mimeType:'image/png',data:'bad'}]);
  assert.deepEqual(first.results.map(x=>x.code),['NETWORK','INVALID_IMAGE']);
  const retry=await call([input]); assert.equal(retry.results[0].ok,true); assert.equal(rowWrites,1); assert.equal(posts,2);
  const repeat=await call([input]); assert.equal(repeat.results[0].alreadyApplied,true); assert.equal(posts,2);
  assert.equal((await call([{...input,name:'不同.png'}])).results[0].code,'IDEMPOTENCY_CONFLICT');
  const row=rows.get('doc:dimensions:'+id); assert.equal(row.payload.meta.width,1);assert.equal(row.payload.meta.height,1);assert.deepEqual(row.payload.annotations,{});
});

test('read-only MCP denies image upload before authenticating', async t => {
  const f=await fixture(t,{readOnly:true});
  const response=await f.client.callTool({name:'office_dimensions_upload_many',arguments:{images:[{projectId:'10000000-0000-4000-8000-000000000001',name:'a.png',mimeType:'image/png',data:'AAAA'}]}});
  assert.equal(result(response).code,'READ_ONLY'); assert.equal(f.requests.length,0);
});

test('feedback uses isolated rows, insert-only idempotency and reconciles a lost response', async t => {
  const prefix='doc:academy/daily-feedback.json:';
  const rows=new Map([[prefix+'$ready',{user_id:prefix+'$ready'}]]);
  let writes=0, loseResponse=true;
  const backend=new OfficeBackend({url:'https://project.supabase.co',key:'public',session:{userId:'u',sessionToken:'secret'},request:async(url,init)=>{
    if(url.includes('/rpc/')) return Response.json({ok:true,user:{id:'u',name:'店长',role:'manager'}});
    const q=new URL(url).searchParams;
    if(init.method==='POST') {writes++;const row=JSON.parse(init.body);assert.ok(row.user_id.startsWith(prefix));assert.equal(init.headers.Prefer,'return=representation');if(rows.has(row.user_id))return new Response('',{status:409});rows.set(row.user_id,row);if(loseResponse){loseResponse=false;throw Error('lost');}return Response.json([row]);}
    if(q.get('user_id').startsWith('eq.')) return Response.json(rows.has(q.get('user_id').slice(3))?[rows.get(q.get('user_id').slice(3))]:[]);
    return Response.json([...rows.values()].filter(row=>row.payload?.value?.id));
  }});
  const server=createServer(backend), client=new Client({name:'test',version:'1'});
  const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
  t.after(async()=>{await client.close();await server.close();});
  const args={requestId:'20000000-0000-4000-8000-000000000001',title:'汤底偏咸',detail:'10号桌反馈',category:'product'};
  const call=(name,args)=>client.callTool({name,arguments:args});
  const first=result(await call('office_feedback_create',args));
  assert.equal(first.item.status,'open');assert.equal(first.item.createdBy.id,'u');assert.equal(first.alreadyApplied,true);
  assert.equal(result(await call('office_feedback_create',args)).item.id,first.item.id);assert.equal(writes,1);
  assert.equal(result(await call('office_feedback_create',{...args,detail:'不同'})).code,'IDEMPOTENCY_CONFLICT');
  assert.equal(result(await call('office_feedback_get',{id:first.item.id})).version,first.version);
  assert.equal(result(await call('office_feedback_list',{})).items.length,1);
  assert.equal((await call('office_feedback_create',{...args,title:'长'.repeat(41)})).isError,true);
  assert.equal((await call('office_feedback_create',{...args,createdBy:{id:'other'}})).isError,true);
  const row=rows.get(prefix+first.item.id);row.payload.value=null;
  assert.equal(result(await call('office_feedback_create',args)).code,'NOT_FOUND');assert.equal(writes,1);
  rows.delete(prefix+'$ready');
  assert.equal(result(await call('office_feedback_create',{...args,requestId:'20000000-0000-4000-8000-000000000002'})).code,'NOT_READY');assert.equal(writes,1);
});

test('feedback creation rejects readonly and staff access before data writes', async t=>{
  const args={requestId:'20000000-0000-4000-8000-000000000001',title:'标题',detail:'正文'};
  const f=await fixture(t,{readOnly:true});
  assert.equal(result(await f.client.callTool({name:'office_feedback_create',arguments:args})).code,'READ_ONLY');assert.equal(f.requests.length,0);
  const staff=await fixture(t);staff.role('staff');
  assert.equal(result(await staff.client.callTool({name:'office_feedback_create',arguments:args})).code,'FORBIDDEN');
  assert.ok(staff.requests.every(r=>r.url.includes('/rpc/')));
});
