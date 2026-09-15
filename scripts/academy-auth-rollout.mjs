// Explicit deployment tool. Never run implicitly in the Pages workflow.
// Elevated keys stay in process memory and are never written to files or logs.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../',import.meta.url));
const fingerprint = value => createHash('sha256').update(value).digest('hex');
const documentSQL = value => `convert_from(decode('${Buffer.from(JSON.stringify(value)).toString('base64')}','base64'),'UTF8')::jsonb`;
const freeze = `create policy academy_auth_retired_files on storage.objects as restrictive for all to public
  using (not (bucket_id='cloud-files' and (name='academy/accounts.json' or name like 'academy/sessions/%')))
  with check (not (bucket_id='cloud-files' and (name='academy/accounts.json' or name like 'academy/sessions/%')));`;

export async function rollout(mode, { env=process.env, request=fetch, report=console.log } = {}) {
  if (!['prepare','activate','status'].includes(mode)) throw new Error('用法：node scripts/academy-auth-rollout.mjs prepare|activate|status');
  const accessToken=env.SUPABASE_ACCESS_TOKEN, serviceKey=env.SUPABASE_SERVICE_ROLE_KEY;
  if (!accessToken) throw new Error('请在本机环境变量中配置 SUPABASE_ACCESS_TOKEN；不要发送或提交密钥。');
  if (mode==='activate' && !serviceKey) throw new Error('启用前需要本机 SUPABASE_SERVICE_ROLE_KEY，用于清除旧公开文件中的凭据。');
  const context={window:{}};
  vm.runInNewContext(readFileSync(resolve(root,'apps/academy/index.html'),'utf8').match(/window\.ACADEMY_CONFIG = \{[\s\S]*?\};/)[0],context);
  const cfg=context.window.ACADEMY_CONFIG, ref=new URL(cfg.url).hostname.split('.')[0];
  async function sql(query,readOnly=false) {
    const response=await request(`https://api.supabase.com/v1/projects/${ref}/database/query`,{
      method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({query,read_only:readOnly}),signal:AbortSignal.timeout(30000)
    });
    if(!response.ok)throw new Error(`数据库操作未完成（HTTP ${response.status}），已隐藏请求内容。`);
    const result=await response.json();if(!Array.isArray(result))throw new Error('数据库返回格式异常');return result;
  }
  const storageURL=(path,publicRead=false)=>`${cfg.url}/storage/v1/object/${publicRead?'public/':''}${cfg.bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
  async function readObject(path,key=cfg.key) {
    const response=await request(storageURL(path),{headers:{apikey:key,Authorization:`Bearer ${key}`,'Cache-Control':'no-cache'},cache:'no-store',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error(`读取迁移源未完成（HTTP ${response.status}）`);return response.json();
  }
  const stateQuery="select enabled,import_fingerprint,(select count(*)::int from academy_private.accounts) as accounts from academy_private.settings where id";
  if(mode==='status') {
    const exists=(await sql("select to_regclass('academy_private.settings') is not null as installed",true))[0]?.installed;
    if(!exists){report({installed:false});return;}
    const state=(await sql(stateQuery,true))[0];report({installed:true,enabled:state.enabled,accounts:state.accounts});return;
  }
  if(mode==='prepare') {
    await sql(readFileSync(resolve(root,'apps/academy/sql/academy_auth.sql'),'utf8'));
    const state=(await sql(stateQuery,true))[0];
    if(state.enabled)throw new Error('新认证已启用，禁止重新导入旧账号文件。');
    const source=await readObject('academy/accounts.json');
    if(!Array.isArray(source.users)||!source.users.length)throw new Error('旧账号文件不可用，未执行导入。');
    const doc=documentSQL(source);
    if(state.accounts) {
      const unchanged=(await sql(`select import_fingerprint=academy_private.fingerprint((${doc})::text) as matches from academy_private.settings where id`,true))[0]?.matches;
      if(!unchanged)throw new Error('暂存账号与当前账号不一致，请核对迁移，不会覆盖现有账号。');
    }else await sql(`select academy_private.import_accounts(${doc}) as imported`);
    report({prepared:true,enabled:false,accounts:source.users.length});return;
  }
  // Refuse cutover until the deployed client matches this tested implementation.
  const site=env.AUTO_OFFICE_SITE_URL || 'https://hldhlh.github.io/web/';
  const asset=new URL('apps/academy/framework/secure-auth.js',site.endsWith('/')?site:site+'/');
  asset.searchParams.set('rollout',String(Date.now()));
  const deployed=await request(asset,{cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!deployed.ok || fingerprint(await deployed.text())!==fingerprint(readFileSync(resolve(root,'apps/academy/framework/secure-auth.js'),'utf8')))
    throw new Error('线上尚未部署本次安全登录代码，拒绝切换。');
  const indexURL=new URL('apps/academy/index.html',site.endsWith('/')?site:site+'/');indexURL.searchParams.set('rollout',String(Date.now()));
  const index=await request(indexURL,{cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!index.ok || !/authMode:\s*["']server-v1["']/.test(await index.text()))throw new Error('线上登录页尚未切换至新认证，拒绝激活。');
  const state=(await sql(stateQuery,true))[0];
  if(!state?.accounts)throw new Error('必须先准备并核对员工账号。');
  const policies=await sql("select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='academy_auth_retired_files'",true);
  let newlyFrozen=false;
  if(!policies.length){await sql(freeze);newlyFrozen=true;}
  if(!state.enabled) {
    try {
      const source=await readObject('academy/accounts.json',serviceKey),doc=documentSQL(source);
      const matches=(await sql(`select import_fingerprint=academy_private.fingerprint((${doc})::text) as matches from academy_private.settings where id`,true))[0]?.matches;
      if(!matches)throw new Error('准备后账号发生过修改，已停止切换，请先核对。');
      await sql('update academy_private.settings set enabled=true where id');
    }catch(error){
      // Only undo the temporary guard before activation; never reopen credentials after cutover.
      const active=(await sql('select enabled from academy_private.settings where id',true))[0]?.enabled;
      if(newlyFrozen&&!active)await sql('drop policy academy_auth_retired_files on storage.objects');
      throw error;
    }
  }
  const ids=await sql('select id from academy_private.accounts order by id',true);
  if(ids.some(row=>!/^[a-zA-Z0-9-]{1,100}$/.test(row.id)))throw new Error('发现非标准旧账号路径，需人工核对后清理。');
  // Former employees may still have public session objects; cover the whole retired prefix.
  const oldSessions=await sql("select name from storage.objects where bucket_id='cloud-files' and name like 'academy/sessions/%' order by name",true);
  if(oldSessions.some(row=>!/^academy\/sessions\/[a-zA-Z0-9-]{1,100}\.json$/.test(row.name)))throw new Error('发现非标准旧会话路径，需人工核对后清理。');
  const paths=[...new Set(['academy/accounts.json',...ids.map(row=>`academy/sessions/${row.id}.json`),...oldSessions.map(row=>row.name)])];
  for(const path of paths){
    const response=await request(storageURL(path),{
      method:'POST',headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json','x-upsert':'true','cache-control':'max-age=0'},
      body:JSON.stringify({retired:true,users:[],rev:Date.now()}),signal:AbortSignal.timeout(20000)
    });
    if(!response.ok)throw new Error(`新认证已启用，但旧凭据清理尚未完成（HTTP ${response.status}）。请重试 activate，不要回退到旧登录。`);
    // Public buckets bypass SELECT RLS, so verify the actual public object bytes too.
    const checkURL=new URL(storageURL(path,true));checkURL.searchParams.set('verify',String(Date.now()));
    const checked=await request(checkURL,{cache:'no-store',signal:AbortSignal.timeout(20000)});
    if(!checked.ok || (await checked.json()).retired!==true)throw new Error('旧公开文件仍需核验，请重试 activate。');
  }
  report({enabled:true,accounts:ids.length,retiredObjects:paths.length,requiresFreshLogin:true});
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  rollout(process.argv[2]).catch(error=>{console.error(error.message);process.exitCode=1;});
}
