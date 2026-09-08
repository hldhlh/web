export async function publishVersion({manifest, url, key, siteUrl, request=fetch, sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  const version=String(manifest?.version || '').trim();
  if (!/^[0-9a-f]{7,40}$/i.test(version)) throw new Error('Invalid build version.');
  if (!url || !key || !siteUrl) throw new Error('Version publishing is not configured.');
  async function retry(action, attempts=4) {
    for(let attempt=0;;attempt++) {
      try { return await action(); }
      catch(error) { if(attempt+1>=attempts) throw error; await sleep(Math.min(8000,1000*2**attempt)); }
    }
  }
  const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
  // Wait for the public edge before asking clients to update.
  await retry(async()=>{
    const latest=new URL('version.json',siteUrl.endsWith('/')?siteUrl:siteUrl+'/');
    latest.searchParams.set('release',version);
    const response=await request(latest,{cache:'no-cache',signal:AbortSignal.timeout(8000)});
    if(!response.ok || (await response.json()).version!==version) throw Error('Published page has not reached the expected version.');
  },8);
  const payload={version,commit:manifest.commit,publishedAt:new Date().toISOString()};
  async function post(path,body,extraHeaders={}) {
    await retry(async()=>{
      const response=await request(`${url.replace(/\/$/,'')}${path}`,{method:'POST',headers:{...headers,...extraHeaders},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
      if(!response.ok) throw Error(`Version notification failed (${response.status}) at ${path}`);
    });
  }
  // Independently retry both paths, including the durable row for old clients.
  const results=await Promise.allSettled([
    post('/rest/v1/academy_state?on_conflict=id',{id:'app-version',payload,updated_at:payload.publishedAt},{Prefer:'resolution=merge-duplicates,return=minimal'}),
    post('/realtime/v1/api/broadcast',{messages:[{topic:'auto-office-version-live',event:'version-published',payload,private:false}]})
  ]);
  const failures=results.filter(result=>result.status==='rejected');
  if(failures.length) throw new AggregateError(failures.map(result=>result.reason),'Some release notifications failed; retry this workflow step.');
  return version;
}
