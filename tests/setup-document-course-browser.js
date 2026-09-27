async page => {
  await page.unrouteAll({behavior:"ignoreErrors"});
  const rows = new Map(), files = new Map();
  const user = { id:'safety-test-manager', name:'安全测试店长', role:'manager', access:'full', sessionToken:'test-session', sessionVersion:1, deviceId:'test-device' };
  const content = {rev:1,data:{lessons:[],exams:[],notices:[],courseGroups:[{id:'front',name:'前厅'}],taskBoard:{title:'任务面板',stages:[]}}};
  await page.route('https://fmxddvjgkykuqwmasigo.supabase.co/**', async route => {
    const request=route.request(),url={pathname:request.url().split("?")[0],searchParams:new Map((request.url().split("?")[1]||"").split("&").filter(Boolean).map(part=>part.split("=").map(decodeURIComponent)))};let body=[];
    if(url.pathname.includes('/rest/v1/rpc/academy_auth')){
      const action=request.postDataJSON().p_action;
      body=action==='people'?{ok:true,users:[user]}:{ok:true,user,sessionVersion:1};
    }else if(url.pathname.includes('/rest/v1/academy_progress')){
      const filter=url.searchParams.get('user_id')||'';
      const matches=row=>!filter||(filter.startsWith('eq.')?row.user_id===filter.slice(3):filter.startsWith('like.')?row.user_id.startsWith(filter.slice(5).replace(/\*$/,'')):filter.startsWith('in.')?filter.includes(`"${row.user_id}"`):false);
      if(request.method()==='POST'){
        const parsed=request.postDataJSON();
        for(const row of Array.isArray(parsed)?parsed:[parsed]){if(!rows.has(row.user_id)){rows.set(row.user_id,row);body.push(row);}else if(!(request.headers().prefer||'').includes('ignore-duplicates'))return route.fulfill({status:409,json:{}});}
      }else if(request.method()==='PATCH'){
        const row=request.postDataJSON(),previous=[...rows.values()].find(matches);
        if(previous&&String(previous.ts)===url.searchParams.get('ts')?.slice(3)){rows.set(row.user_id,row);body=[row];}
      }else body=[...rows.values()].filter(matches);
    }else if(url.pathname.includes('/storage/v1/object/')){
      if(url.pathname.includes('/academy/documents/')){
        const key=url.pathname.split('/academy/documents/')[1];
        if(request.method()==='POST'){files.set(key,{data:request.postDataBuffer(),type:request.headers()['content-type']});return route.fulfill({status:200,json:{Key:key}});}
        const stored=files.get(key);if(stored)return route.fulfill({status:200,contentType:stored.type,body:stored.data});return route.fulfill({status:404,json:{}});
      }
      if(url.pathname.endsWith('/accounts.json'))body={rev:1,users:[user]};
      else if(url.pathname.includes('/sessions/'))body={userId:user.id,token:user.sessionToken,deviceId:user.deviceId,issuedAt:Date.now()};
      else if(url.pathname.endsWith('/content.json'))body=content;
      else if(url.pathname.endsWith('/schedule.json'))body={rev:1,assignments:{}};
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  if(page.routeWebSocket)await page.routeWebSocket('**',socket=>socket.close());
  await page.addInitScript(user=>{
    sessionStorage.setItem('academy-session-v2',JSON.stringify(user));
    localStorage.setItem('academy-device-id-v1',user.deviceId);
    localStorage.setItem('academy-people-cache-v1',JSON.stringify([user]));
  },user);
  await page.goto('about:blank');
  await page.goto('http://127.0.0.1:5503/apps/academy/index.html#/ops?section=lessons');
  await page.getByRole('button',{name:'创建课程与考试',exact:true}).waitFor();
  return {backend:'All Supabase requests mocked; no production writes',title:await page.title()};
}
