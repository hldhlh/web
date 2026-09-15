async page => {
  const origin='http://127.0.0.1:8784';
  const user={id:'ui-manager',name:'测试店长',role:'manager',access:'full'};
  const errors=[],calls=[];
  let password='old-password',loggedIn=false;
  page.on('pageerror',error=>errors.push(error.message));
  await page.context().route('**/*',async route=>{
    const request=route.request(),url=request.url();
    if(url.startsWith(origin))return route.continue();
    if(url.includes('/rpc/academy_auth')){
      const {p_action:action,p_data:data}=request.postDataJSON();calls.push({action,data});
      let result={ok:true};
      if(action==='login'){
        if(data.password!==password)result={ok:false,code:'INVALID_CREDENTIALS'};
        else{loggedIn=true;result={ok:true,user,sessionToken:'isolated-test-session'};}
      }else if(action==='change_password'){
        if(data.password!==password)result={ok:false,code:'INVALID_CREDENTIALS'};
        else{password=data.newPassword;loggedIn=false;}
      }else if(action==='verify')result=loggedIn?{ok:true,user}:{ok:false,code:'SESSION_ENDED'};
      else if(action==='people')result={ok:true,users:[user,{id:'staff',name:'测试员工',role:'staff',access:'basic'}]};
      else if(action==='events')result={ok:true,events:[
        {id:'12',occurred_at:'2026-09-15T08:00:00Z',account_name:'测试店长',event:'login_success',forwarded_for:'192.0.2.10',user_agent:'Safari on iPhone (test)',device_fingerprint:'example-device-1'},
        {id:'11',occurred_at:'2026-09-15T07:58:00Z',account_name:'测试员工',event:'login_failed',reason:'invalid_credentials',forwarded_for:'198.51.100.20',user_agent:'Browser for test',device_fingerprint:'example-device-2'}
      ].filter(e=>(!data.account||e.account_name===data.account)&&(!data.event||e.event===data.event))};
      else if(action==='logout')loggedIn=false;
      return route.fulfill({json:result});
    }
    if(url.includes('/storage/v1/object/'))return route.fulfill({status:404,json:{statusCode:404,error:'not_found'}});
    if(url.includes('/rest/v1/'))return route.fulfill({json:[]});
    return route.abort();
  });
  if(page.routeWebSocket)await page.routeWebSocket('**',socket=>socket.close());
  await page.setViewportSize({width:390,height:844});
  await page.goto(origin+'/apps/academy/index.html');
  await page.getByRole('button',{name:'更改密码',exact:true}).waitFor();
  await page.screenshot({path:'output/playwright/auth-login-mobile.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'更改密码',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'更改密码'});
  await dialog.getByLabel('姓名',{exact:true}).fill('测试店长');
  await dialog.getByLabel('当前密码',{exact:true}).fill('wrong-password');
  await page.screenshot({path:'output/playwright/auth-password-mobile.png',fullPage:true,animations:'disabled'});
  const box=await dialog.boundingBox();
  if(box.x<15||box.y<15||box.x+box.width>375)throw new Error('Password dialog does not respect mobile margins');
  await dialog.getByLabel('新密码',{exact:true}).fill('new-password-strong');
  await dialog.getByLabel('确认新密码',{exact:true}).fill('different-password');
  await dialog.getByRole('button',{name:'更新密码'}).click();
  await dialog.getByText('两次输入的新密码不一致').waitFor();
  if(calls.some(c=>c.action==='change_password'))throw new Error('Mismatched confirmation submitted');
  await dialog.getByLabel('确认新密码',{exact:true}).fill('new-password-strong');
  await dialog.getByRole('button',{name:'更新密码'}).click();
  await dialog.getByText('姓名或当前密码不正确').waitFor();
  await dialog.getByLabel('当前密码',{exact:true}).fill('old-password');
  await dialog.getByRole('button',{name:'更新密码'}).click();
  await dialog.getByText('密码已更新，请使用新密码登录。').waitFor();
  const cleared=await dialog.locator('input').evaluateAll(inputs=>inputs.every(input=>!input.value));
  if(!cleared)throw new Error('Password inputs retained after success');
  await dialog.getByRole('button',{name:'完成'}).click();
  await page.locator('#auth-form input[name=name]').fill('测试店长');
  await page.locator('#auth-form input[name=password]').fill('new-password-strong');
  await page.locator('#auth-submit').click();
  await page.waitForFunction(()=>!document.querySelector('.app').classList.contains('gated'));
  await page.goto(origin+'/apps/academy/index.html#/ops?section=security');
  await page.getByText('已显示 2 条记录',{exact:true}).waitFor();
  await page.getByLabel('筛选账号',{exact:true}).selectOption('测试员工');
  await page.getByText('已显示 1 条记录',{exact:true}).waitFor();
  await page.getByLabel('筛选登录结果',{exact:true}).selectOption('login_success');
  await page.getByText('暂无符合条件的记录。启用后发生的登录会显示在这里。').waitFor();
  await page.getByLabel('筛选账号',{exact:true}).selectOption('');
  await page.getByLabel('筛选登录结果',{exact:true}).selectOption('');
  await page.getByText('已显示 2 条记录',{exact:true}).waitFor();
  await page.screenshot({path:'output/playwright/auth-events-mobile.png',fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  if(overflow)throw new Error('Mobile login log page overflows horizontally');
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'output/playwright/auth-events-desktop.png',fullPage:true});
  await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});
  await page.screenshot({path:'output/playwright/auth-events-dark.png',fullPage:true,animations:'disabled'});
  if(errors.length)throw new Error(errors.join('\n'));
  return {passed:true,backend:'isolated mock; no production requests',screenshots:5,checks:'mobile password validation, verified change, fields cleared, new login, manager logs and filtering, responsive layout'};
}
