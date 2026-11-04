/* Runs the real collaboration, batch UI and editor against an isolated REST transport. */
(async()=>{
 const results=[], $=id=>document.getElementById(id),check=(ok,msg)=>{if(!ok)throw Error(msg);results.push(msg);};
 const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.append(s);});
 const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('fixture timeout');};
 const projectId='10000000-0000-4000-8000-000000000001',actor={id:'fixture',name:'测试店长'};
 let row={user_id:`doc:dimensions:${projectId}`,ts:10,payload:{meta:{id:projectId,name:'AI 批量编辑测试',width:900,height:650,imagePath:`academy/dimensions/${projectId}/image.png`,createdBy:actor,updatedBy:actor,createdAt:'2026-11-04',updatedAt:'2026-11-04',count:1},annotations:{a:{id:'a',type:'line',start:{x:150,y:100},end:{x:750,y:100},label:'宽 140 mm',style:'light',version:'v1',createdAt:'2026-11-04'}}}},writes=0,loseReply=false;
 try {
  const params=new URLSearchParams(location.search);document.documentElement.dataset.theme=params.get('theme')||'light';if(params.has('large'))document.documentElement.style.fontSize='34px';
  const img=document.createElement('canvas');img.width=900;img.height=650;const ctx=img.getContext('2d');ctx.fillStyle='#e6e1d8';ctx.fillRect(0,0,900,650);ctx.fillStyle='#777';ctx.fillRect(150,120,600,400);const blob=await new Promise(r=>img.toBlob(r));
  window.AcademyAuth={session:actor,canShortcut:()=>true,onChange:()=>()=>{}};
  window.AcademyStore={origin:()=>location.origin,headers:()=>({}),objectUrl:path=>'/'+path};window.ACADEMY_CONFIG={url:location.origin,key:'fixture'};
  window.APP_NETWORK={request:async(url,init)=>{
   const query=new URL(url).searchParams;
   if(init.method==='PATCH'){writes++;if(query.get('ts')!==`eq.${row.ts}`)return Response.json([]);row={...row,...JSON.parse(init.body)};if(loseReply){loseReply=false;throw Error('模拟保存回包丢失');}return Response.json([row]);}
   return Response.json(query.get('user_id')===`eq.doc:dimensions:${projectId}`?[row]:[]);
  }};
  window.supabase={createClient:()=>({channel:()=>{const ch={on:()=>ch,subscribe:()=>ch,send:async()=>{},track:async()=>{},presenceState:()=>({})};return ch;},removeChannel:()=>{},removeAllChannels:()=>{}})};
  window.DimensionImageCache={get:async()=>blob};window.DimensionImages={formatBytes:n=>`${n} bytes`};
  location.hash=`#/apps/dimensions?project=${projectId}`;
  await load('collaboration.js');await load('batch-ui.js');
  await wait(()=>{try{return !!DimensionCollab.snapshot();}catch{return false;}});
  $('openBatch').click();check($('batchDialog').open,'入口打开并沿用当前会话');
  const input={projectId,expectedVersion:10,requestId:'browser1',operations:[{op:'update',id:'a',changes:{label:'宽 150 mm'}},{op:'create',id:'b',changes:{type:'line',start:{x:120,y:120},end:{x:120,y:520},label:'高 140 mm'}}]};
  $('batchInput').value=JSON.stringify(input);$('previewBatch').click();check(!$('batchPreview').hidden && !$('applyBatch').disabled,'整批校验后显示图片预览');check(writes===0 && row.payload.annotations.a.label==='宽 140 mm','预览没有写入云端');
  $('applyBatch').click();await wait(()=>$('batchStatus').textContent==='整批修改已保存至云端。');check(writes===1&&row.payload.meta.count===2,'一批多个修改仅一次 CAS 写入');
  $('undoBatch').click();check(!$('applyBatch').disabled,'撤销先预览');$('applyBatch').click();await wait(()=>$('batchStatus').textContent==='整批修改已保存至云端。');check(row.payload.annotations.a.label==='宽 140 mm'&&row.payload.annotations.b.deleted,'整批撤销恢复旧值并删除新增项');
  const invalid={...input,expectedVersion:row.ts,requestId:'invalid',operations:[input.operations[0],{op:'delete',id:'missing'}]};$('batchInput').value=JSON.stringify(invalid);$('previewBatch').click();check($('applyBatch').disabled&&writes===2,'错误指令整批拒绝');
  const next={...input,expectedVersion:row.ts,requestId:'lost',operations:[input.operations[0]]};$('batchInput').value=JSON.stringify(next);$('previewBatch').click();loseReply=true;$('applyBatch').click();await wait(()=>$('batchStatus').textContent.includes('模拟保存回包丢失'));check(writes===3,'不确定保存结果不自动重复写');
  $('previewBatch').click();$('applyBatch').click();await wait(()=>$('batchStatus').textContent==='整批修改已保存至云端。');check(writes===3,'相同 requestId 重试核实成功且不重复写');
  $('undoBatch').click();row.ts++;row.payload.annotations.a.version='external';$('applyBatch').click();await wait(()=>$('batchStatus').textContent.includes('项目已更新'));check(writes===3,'预览之后发生更新则拒绝覆盖');
  $('closeBatch').click();check(!$('batchDialog').open,'关闭后返回画布');
  $('openBatch').click(); // Leave the actual editor entry visible for visual review.
  const pre=document.createElement('pre');pre.id='fixtureResults';pre.textContent=JSON.stringify({ok:true,results});document.body.append(pre);
 }catch(error){const pre=document.createElement('pre');pre.id='fixtureResults';pre.textContent=JSON.stringify({ok:false,error:error.stack,results});document.body.append(pre);}
})();
