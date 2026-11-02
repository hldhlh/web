// Cache only complete, verified model versions. Storage is optional (private mode/quota).
export async function loadModel(manifest, onProgress=()=>{}, options={}) {
  const fetcher=options.fetcher||fetch;
  const base=options.base||location.href;
  const url=new URL(manifest.url,base);url.searchParams.set('v',manifest.version);
  let cache;
  try { cache=await (options.storage||globalThis.caches)?.open('store-model-v1'); } catch {}
  const valid=async data=>{
    if(data.byteLength!==manifest.bytes || new DataView(data).getUint32(0,true)!==0x46546c67) return false;
    const hash=await crypto.subtle.digest('SHA-256',data);
    return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('')===manifest.version;
  };
  try {
    const hit=await cache?.match(url.href);
    if(hit){const data=await hit.arrayBuffer();if(await valid(data)){onProgress({phase:'cached'});return data;}await cache.delete(url.href);}
  } catch {}
  const compressed=typeof DecompressionStream!=='undefined';
  for(const gzip of compressed?[true,false]:[false]){
    const address=new URL(gzip?manifest.gzipUrl:manifest.url,base);address.searchParams.set('v',manifest.version);
    const controller=new AbortController();let timer;
    const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(),45000);};
    try {
      onProgress({phase:'download',loaded:0,total:gzip?manifest.gzipBytes:manifest.bytes,speed:0});
      arm();const response=await fetcher(address.href,{signal:controller.signal});
      if(!response.ok)throw new Error(`Model HTTP ${response.status}`);
      const total=gzip?manifest.gzipBytes:manifest.bytes;
      const started=performance.now();let loaded=0,blob;
      if(response.body?.getReader){
        const reader=response.body.getReader(), chunks=[];
        while(true){const {done,value}=await reader.read();if(done)break;arm();chunks.push(value);loaded+=value.byteLength;onProgress({phase:'download',loaded,total,speed:loaded/Math.max(.1,(performance.now()-started)/1000)});}
        blob=new Blob(chunks);
      }else{blob=await response.blob();onProgress({phase:'download',loaded:blob.size,total,speed:0});}
      clearTimeout(timer);onProgress({phase:'decode'});
      const data=gzip?await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():await blob.arrayBuffer();
      if(!await valid(data))throw new Error('Model integrity mismatch');
      // Do not block rendering while persisting. Delete only our stale model entries.
      if(cache)void cache.put(url.href,new Response(data)).then(async()=>{for(const key of await cache.keys())if(key.url!==url.href)await cache.delete(key);}).catch(()=>{});
      return data;
    }catch(error){if(!gzip)throw error;onProgress({phase:'fallback'});}
    finally{clearTimeout(timer);}
  }
}
