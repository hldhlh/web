async page => {
  const origin='http://127.0.0.1:8784',errors=[],requests=[];
  const user={id:'demo-manager',name:'测试店长',role:'manager',access:'full'};
  const uaPhone='Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1';
  const uaPC='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0';
  const events=Array.from({length:6},(_,i)=>({id:String(20-i),occurred_at:`2026-09-15T${i<2?'11':'09'}:${String(23-i*2).padStart(2,'0')}:16Z`,account_name:i%2?'测试店长':'测试员工',event:i===2?'session_replaced':i===4?'login_failed':'login_success',reason:i===2?'new_device_login':i===4?'invalid_credentials':'',forwarded_for:i%2?'8.8.8.8':'223.5.5.5',user_agent:i%2?uaPC:uaPhone,device_fingerprint:i%2?'12ab34cd56ef7890':'a1b2c3d4e5f60718',source:'server'}));
  page.on('pageerror',error=>errors.push(error.message));
  await page.context().route('**/*',async route=>{
    const req=route.request(),url=req.url();requests.push(url);
    if(url.startsWith(origin))return route.continue();
    if(url.includes('/rpc/academy_auth')){
      const {p_action:action,p_data:data}=req.postDataJSON();let result={ok:true};
      if(action==='login'||action==='verify')result={ok:true,user,sessionToken:'synthetic-ui-token',sessionVersion:'1'};
      if(action==='people')result={ok:true,users:[user,{id:'staff',name:'测试员工',role:'staff',access:'basic'}]};
      if(action==='events')result={ok:true,events:events.filter(e=>(!data.account||data.account===e.account_name)&&(!data.event||data.event===e.event))};
      return route.fulfill({json:result});
    }
    if(url.includes('/storage/v1/object/')&&req.method()==='POST')return route.fulfill({json:{Key:'synthetic'}});
    if(url.includes('/storage/v1/object/'))return route.fulfill({status:404,json:{error:'not_found'}});
    if(url.includes('/rest/v1/'))return route.fulfill({json:[]});
    return route.abort();
  });
  if(page.routeWebSocket)await page.routeWebSocket('**',socket=>socket.close());
  await page.setViewportSize({width:390,height:844});
  await page.goto(origin+'/apps/academy/index.html');
  if(requests.some(url=>url.includes('/login-geo/')))throw Error('Login page downloaded the region database');
  await page.locator('#auth-form input[name=name]').fill('测试店长');await page.locator('#auth-form input[name=password]').fill('synthetic-password');await page.locator('#auth-submit').click();
  await page.waitForFunction(()=>!document.querySelector('.app').classList.contains('gated'));
  await page.goto(origin+'/apps/academy/index.html#/ops?section=security');
  await page.getByText('已显示 6 条记录',{exact:true}).waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.security-region-label')].every(el=>el.textContent.includes('IP 推测')));
  if(requests.filter(url=>url.includes('/login-geo/')&&url.endsWith('.gz')).length!==2)throw Error('Expected only two coalesced region shards');
  await page.screenshot({path:'output/playwright/login-insights-mobile.png',fullPage:true,animations:'disabled'});
  await page.locator('.security-event-summary').first().click();
  await page.locator('.security-event[open]').getByText('iOS 18.6',{exact:true}).waitFor();
  await page.locator('.security-event[open]').getByText('Safari 18.6',{exact:true}).waitFor();
  await page.locator('.security-event[open]').getByText('223.5.5.5',{exact:true}).waitFor();
  await page.screenshot({path:'output/playwright/login-insights-details.png',fullPage:true,animations:'disabled'});
  await page.getByLabel('筛选账号',{exact:true}).selectOption('测试员工');await page.getByText('已显示 3 条记录',{exact:true}).waitFor();
  await page.getByLabel('筛选登录结果',{exact:true}).selectOption('login_failed');await page.getByText('已显示 1 条记录',{exact:true}).waitFor();
  await page.getByLabel('筛选账号',{exact:true}).selectOption('');await page.getByLabel('筛选登录结果',{exact:true}).selectOption('');await page.getByText('已显示 6 条记录',{exact:true}).waitFor();
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await page.screenshot({path:'output/playwright/login-insights-dark.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:320,height:740});
  await page.emulateMedia({reducedMotion:'reduce',contrast:'more'});
  const largeStyle=await page.addStyleTag({content:'.security-events :is(p,span,strong,time,dt,dd,label,select,summary){font-size:20px!important}'});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Large type causes horizontal overflow');
  const small=await page.locator('.security-event-summary,.security-events button,.security-events select').evaluateAll(els=>els.filter(el=>el.getBoundingClientRect().height>0&&el.getBoundingClientRect().height<44).length);if(small)throw Error('Small touch target');
  await page.screenshot({path:'output/playwright/login-insights-large-type.png',fullPage:true,animations:'disabled'});
  await largeStyle.evaluate(el=>el.remove());
  await page.emulateMedia({reducedMotion:'no-preference',contrast:'no-preference'});
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>document.documentElement.dataset.theme='light');
  await page.screenshot({path:'output/playwright/login-insights-desktop.png',fullPage:true,animations:'disabled'});
  if(errors.length)throw Error(errors.join('\n'));
  return {passed:true,productionWrites:0,records:6,regionShards:2,checks:'mobile list, device and province inference, disclosure, filters, dark, 320px large type, touch targets'};
}
