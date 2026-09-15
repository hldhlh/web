// Device labels are interpretations of the recorded User-Agent, not hardware attestation.
window.AcademySecurityInsights = (() => {
  'use strict';
  const base = new URL('../data/login-geo/20260901/', document.currentScript.src);
  const requests = new Map();
  let manifestPromise;
  const clean = value => String(value || '').trim().slice(0, 512);
  function deviceInfo(value) {
    const ua = clean(value), version = match => match?.[1]?.replaceAll('_', '.') || '';
    let device='未知设备',type='unknown',os='未知系统',browser='未知浏览器';
    if (/iPhone|iPod/i.test(ua)) { device=/iPod/i.test(ua)?'iPod':'iPhone';type='phone';os='iOS '+version(ua.match(/OS ([\d_]+)/)); }
    else if (/iPad/i.test(ua)) { device='iPad';type='tablet';os='iPadOS '+version(ua.match(/OS ([\d_]+)/)); }
    else if (/Android/i.test(ua)) {
      type=/Mobile/i.test(ua)?'phone':'tablet';device=type==='phone'?'Android 手机':'Android 平板';os='Android '+version(ua.match(/Android ([\d.]+)/));
      const model=ua.match(/Android [\d.]+;\s*(?:[a-z]{2}[-_][A-Z]{2};\s*)?([^;)]+?)(?: Build\/|\))/)?.[1]?.trim();
      if(model && !/^(K|wv|Linux)$/i.test(model) && model.length<65)device=model;
    } else if (/Windows/i.test(ua)) { device='Windows 电脑';type='computer';const nt=version(ua.match(/Windows NT ([\d.]+)/));os=({'10.0':'Windows 10 / 11','6.3':'Windows 8.1','6.2':'Windows 8','6.1':'Windows 7'})[nt]||'Windows'; }
    else if (/Macintosh|Mac OS X/i.test(ua)) { device='Mac';type='computer';os='macOS '+version(ua.match(/Mac OS X ([\d_]+)/)); }
    else if (/CrOS/i.test(ua)) {device='Chromebook';type='computer';os='ChromeOS';}
    else if (/Linux/i.test(ua)) {device='Linux 电脑';type='computer';os='Linux';}
    const browsers=[[/MicroMessenger\/([\d.]+)/,'微信'],[/Edg(?:e|A|iOS)?\/([\d.]+)/,'Edge'],[/SamsungBrowser\/([\d.]+)/,'Samsung Internet'],[/OPR\/([\d.]+)/,'Opera'],[/CriOS\/([\d.]+)/,'Chrome'],[/FxiOS\/([\d.]+)/,'Firefox'],[/Chrome\/([\d.]+)/,'Chrome'],[/Firefox\/([\d.]+)/,'Firefox'],[/Version\/([\d.]+).*Safari\//,'Safari']];
    let browserName=browser;
    for(const [pattern,label] of browsers){const match=ua.match(pattern);if(match){browserName=label;browser=label+' '+match[1];break;}}
    if(/; wv\)/.test(ua)){browserName='应用内浏览器';browser='Android WebView'+(browser.startsWith('Chrome ')?' '+browser.slice(7):'');}
    return {device,type,os:os.trim(),browser,browserName,raw:ua};
  }
  function parseIP(value) {
    // Use only the first forwarded hop, never silently substitute a later proxy address.
    let ip=clean(value).split(',')[0].trim();
    if(/^\[[0-9a-f:.]+\](?::\d+)?$/i.test(ip))ip=ip.slice(1,ip.indexOf(']'));
    if(/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip))ip=ip.split(':')[0];
    if(/^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(ip))ip=ip.slice(7);
    if(/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)){
      const parts=ip.split('.').map(Number);if(parts.some(x=>x>255))return null;
      const number=parts.reduce((a,b)=>a*256+b,0),[a,b,c]=parts;
      const reserved=a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113);
      return {ip:parts.join('.'),version:4,key:number,shard:`v4-${String(a).padStart(3,'0')}`,reserved};
    }
    if(!/^[\da-f:]+$/i.test(ip)||!ip.includes(':')||ip.includes(':::')||ip.split('::').length>2)return null;
    const halves=ip.split('::'),left=halves[0]?halves[0].split(':'):[],right=halves.length===2&&halves[1]?halves[1].split(':'):[];
    if([...left,...right].some(x=>!/^[\da-f]{1,4}$/i.test(x)))return null;
    const missing=8-left.length-right.length;
    if(halves.length===1&&left.length!==8||halves.length===2&&missing<1)return null;
    const hex=[...left,...Array(halves.length===2?missing:0).fill('0'),...right].map(x=>x.padStart(4,'0')).join('').toLowerCase();
    if(hex.startsWith('00000000000000000000ffff'))return parseIP([24,26,28,30].map(i=>parseInt(hex.slice(i,i+2),16)).join('.'));
    // Only globally routable unicast is a geographic hint; exclude documentation ranges.
    const reserved=!/^[23]/.test(hex)||hex.startsWith('20010db8')||hex.startsWith('3fff');
    return {ip:ip.toLowerCase(),version:6,key:hex,shard:'v6-'+hex.slice(0,3),reserved};
  }
  function search(shard,key) {
    let lo=0,hi=shard.rows.length-1;
    while(lo<=hi){const mid=(lo+hi)>>>1,[a,b,id]=shard.rows[mid];if(key<a)hi=mid-1;else if(key>b)lo=mid+1;else return shard.regions[id]||null;}
    return null;
  }
  async function getManifest(){
    if(!manifestPromise)manifestPromise=fetch(new URL('manifest.json',base),{credentials:'omit',cache:'force-cache',signal:AbortSignal.timeout(15000)}).then(async r=>{if(!r.ok)throw Error('地区数据暂不可用');return r.json();}).catch(error=>{manifestPromise=null;throw error;});
    return manifestPromise;
  }
  async function locate(value){
    const ip=parseIP(value);if(!ip)return {state:'unknown',label:'地区未知'};
    if(ip.reserved)return {state:'private',label:'内网或保留地址',ip:ip.ip};
    try{
      const manifest=await getManifest(),entry=manifest.shards[ip.shard]?.find(part=>ip.key>=part.start&&ip.key<=part.end);
      if(!entry)return {state:'unknown',label:'地区未知',ip:ip.ip};
      if(!requests.has(entry.file))requests.set(entry.file,(async()=>{
        // Fetch a public region shard from this site. The full login IP never leaves the browser.
        const r=await fetch(new URL(entry.file,base),{credentials:'omit',cache:'force-cache',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('地区数据暂不可用');
        const bytes=await r.arrayBuffer();
        const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
        if(digest!==entry.sha256)throw Error('地区数据校验失败');
        const data=JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
        while(requests.size>16)requests.delete(requests.keys().next().value);
        return data;
      })().catch(error=>{requests.delete(entry.file);throw error;}));
      const match=search(await requests.get(entry.file),ip.key);
      if(!match)return {state:'unknown',label:'地区未知',ip:ip.ip};
      let [country,province,city,isp,iso]=match;
      try{country=new Intl.DisplayNames(['zh-CN'],{type:'region'}).of(iso)||country;}catch{}
      const areas=[...(iso==='CN'?[]:[country]),province,city].filter((part,index,all)=>part&&all.indexOf(part)===index);
      return {state:'estimated',label:areas.join(' · ')||country,country,province,city,isp,iso,ip:ip.ip,source:'ip2region',dataDate:manifest.generatedFrom[String(ip.version)].builtAt.slice(0,10)};
    }catch{return {state:'unavailable',label:'地区暂不可用',ip:ip.ip};}
  }
  return {deviceInfo,parseIP,search,locate};
})();
