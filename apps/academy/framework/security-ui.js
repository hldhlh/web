window.AcademySecurity = (() => {
  const labels = { login_success:'登录成功',login_failed:'登录失败',session_replaced:'会话被替换',logout:'主动退出',
    password_changed:'密码已修改',password_change_failed:'改密失败',registered:'账号注册',register_failed:'注册失败',permissions_changed:'权限已修改' };
  const reasons = { invalid_credentials:'姓名或密码不正确',new_device_login:'另一个设备完成了登录',all_sessions_revoked:'旧会话已失效',
    user_requested:'用户主动退出',account_blocked:'账号已停用',account_exists:'账号已存在',access:'账号访问权限',shortcuts:'快捷工具权限' };
  const el = (tag, className, text) => { const node=document.createElement(tag); if(className) node.className=className; if(text!=null) node.textContent=text; return node; };
  function openPasswordDialog(name = '') {
    if (document.querySelector('.security-password-dialog')) return;
    const dialog=el('dialog','security-password-dialog');
    dialog.setAttribute('aria-labelledby','password-dialog-title');
    dialog.innerHTML=`<form class="security-password-form">
      <header><h2 id="password-dialog-title">更改密码</h2><p>验证当前密码后设置新密码。修改后，各设备需要重新登录。</p></header>
      <div class="security-password-fields">
        <label>姓名<input name="name" autocomplete="username" maxlength="16" required></label>
        <label>当前密码<input name="password" type="password" autocomplete="current-password" maxlength="128" required></label>
        <label>新密码<input name="newPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" placeholder="至少 10 个字符" required></label>
        <label>确认新密码<input name="confirmation" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label>
      </div>
      <p class="security-form-status" role="status" aria-live="polite"></p>
      <footer><button type="button" class="ghost" data-cancel>取消</button><button type="submit" class="primary">更新密码</button></footer>
    </form>`;
    const form=dialog.querySelector('form'),status=form.querySelector('[role=status]'),submit=form.querySelector('[type=submit]'),cancel=form.querySelector('[data-cancel]');
    form.elements.name.value=name;
    let busy=false,complete=false;
    cancel.onclick=()=>dialog.close();
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    dialog.addEventListener('close',()=>{form.reset();dialog.remove();});
    form.onsubmit=async event=>{
      event.preventDefault(); if(busy)return; if(complete){dialog.close();return;}
      form.querySelectorAll('[aria-invalid]').forEach(node=>node.removeAttribute('aria-invalid'));
      if(form.elements.newPassword.value!==form.elements.confirmation.value){
        status.textContent='两次输入的新密码不一致';form.elements.confirmation.setAttribute('aria-invalid','true');form.elements.confirmation.focus();return;
      }
      busy=true;submit.disabled=cancel.disabled=true;submit.textContent='正在更新…';status.textContent='';
      try{
        if(!window.AcademyAuth.changePassword)throw new Error('安全登录服务尚未启用，请联系店长');
        await window.AcademyAuth.changePassword(form.elements.name.value,form.elements.password.value,form.elements.newPassword.value);
        form.reset();complete=true;form.querySelector('.security-password-fields').hidden=true;cancel.hidden=true;
        status.textContent='密码已更新，请使用新密码登录。';submit.textContent='完成';submit.type='button';submit.onclick=()=>dialog.close();
      }catch(error){
        status.textContent=error.message||'暂时无法修改，请稍后重试';
        const field=form.elements.namedItem(error.field);if(field){field.setAttribute('aria-invalid','true');field.focus();}
      }finally{busy=false;submit.disabled=cancel.disabled=false;if(!complete)submit.textContent='更新密码';}
    };
    document.body.append(dialog);dialog.showModal();
  }
  function mountEvents(container,auth) {
    let before=null,busy=false,revision=0;
    const root=el('section','security-events');
    const description=el('p','security-events-intro','登录活动 · 最近 90 天');
    const filters=el('div','security-event-filters');
    const accountLabel=el('label',null,'账号'),account=el('select');account.setAttribute('aria-label','筛选账号');
    account.append(new Option('全部账号',''));
    auth.list().forEach(user=>account.append(new Option(user.name,user.name)));accountLabel.append(account);
    const eventLabel=el('label',null,'结果'),event=el('select');event.setAttribute('aria-label','筛选登录结果');
    event.append(new Option('全部结果',''));Object.entries(labels).forEach(([value,label])=>event.append(new Option(label,value)));eventLabel.append(event);
    const refresh=el('button','ghost security-events-refresh');refresh.type='button';refresh.setAttribute('aria-label','刷新记录');refresh.title='刷新记录';refresh.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 7a8 8 0 0 1 13.5-1L20 7M4 17l.9 1A8 8 0 0 0 18.4 17"/></svg>';filters.append(accountLabel,eventLabel,refresh);
    const status=el('p','security-event-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const list=el('div','security-event-list');const more=el('button','ghost security-events-more','载入更早记录');more.type='button';more.hidden=true;
    const footnote=el('p','security-events-footnote','地区由离线 IP 数据推测，代理或移动网络可能显示出口所在地。设备根据浏览器信息识别，不能证明操作者身份。时间为北京时间。');
    root.append(description,filters,status,list,more,footnote);container.replaceChildren(root);
    const insights=window.AcademySecurityInsights;
    const icons={phone:'<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M10 5h4M11 19h2"/>',tablet:'<rect x="4" y="2" width="16" height="20" rx="2.5"/><path d="M11 19h2"/>',computer:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',unknown:'<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 10a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17h.01"/>'};
    function row(item){
      const article=el('details','security-event');
      const summary=el('summary','security-event-summary');
      const info=insights?.deviceInfo(item.user_agent)||{device:'未知设备',browser:'未知浏览器',browserName:'未知浏览器',os:'未知系统',type:'unknown'};
      const icon=el('span','security-device-icon');icon.setAttribute('aria-hidden','true');
      icon.innerHTML=`<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icons[info.type]||icons.unknown}</svg>`;
      const body=el('div','security-event-body');
      const head=el('div','security-event-head'),name=el('strong',null,item.account_name||'未知账号');
      const badge=el('span','security-event-result',labels[item.event]||item.event);
      badge.dataset.kind=/failed|replaced/.test(item.event)?'attention':'normal';head.append(name,badge);
      const device=el('p','security-device-label',`${info.device} · ${info.browserName}`);
      const date=new Date(item.occurred_at),valid=Number.isFinite(date.getTime());
      const time=el('time',null,valid?date.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):'时间未知');
      if(valid)time.dateTime=date.toISOString();
      const location=el('span','security-region-label','正在识别地区…');
      const meta=el('div','security-event-meta');meta.append(location,time);body.append(head,device,meta);
      const chevron=el('span','security-event-chevron');chevron.setAttribute('aria-hidden','true');chevron.innerHTML='<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3 5 5-5 5"/></svg>';
      summary.append(icon,body,chevron);
      const details=el('div','security-event-expanded'),facts=el('dl','security-event-facts');
      function fact(label,value){const pair=el('div'),dt=el('dt',null,label),dd=el('dd',null,value||'未提供');pair.append(dt,dd);facts.append(pair);return dd;}
      const regionFact=fact('推测地区','正在识别…'),networkFact=fact('网络运营商','正在识别…');
      fact('设备',info.device);fact('系统',info.os);fact('浏览器',info.browser);
      fact('登录 IP',insights?.parseIP(item.forwarded_for)?.ip||item.forwarded_for||'未提供');
      if((item.forwarded_for||'').includes(','))fact('网关转发链',item.forwarded_for);
      fact('设备识别码',item.device_fingerprint);
      fact('时间',valid?date.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）':'时间未知');
      if(item.reason)fact('事件原因',reasons[item.reason]||item.reason);
      const raw=el('details','security-raw-agent'),rawSummary=el('summary',null,'原始浏览器信息');
      raw.append(rawSummary,el('p',null,item.user_agent||'未提供'));details.append(facts,raw);
      const provenance=el('p','security-region-source');details.append(provenance);
      article.append(summary,details);
      (insights?insights.locate(item.forwarded_for):Promise.resolve({state:'unknown',label:'地区未知'})).then(region=>{
        location.textContent=region.label+(region.state==='estimated'?' · IP 推测':'');
        regionFact.textContent=region.label;networkFact.textContent=region.isp||'未识别';
        provenance.textContent=region.state==='estimated'?`地区库：ip2region · ${region.dataDate}。识别码用于区分浏览器安装；同一台设备的不同浏览器可能不同。`:'地区未识别不影响原始登录记录。识别码用于区分浏览器安装。';
      });
      return article;
    }
    async function load(append=false){
      if(busy)return;busy=true;const current=++revision;refresh.disabled=more.disabled=true;account.disabled=event.disabled=true;
      status.textContent='正在读取登录记录…';
      try{
        if(!auth.loginEvents)throw new Error('安全登录服务尚未启用，暂时无法读取记录');
        const result=await auth.loginEvents({account:account.value,event:event.value,before:append?before:null});
        if(!root.isConnected||current!==revision)return;
        if(!Array.isArray(result.events))throw new Error('登录记录响应异常，请重试');
        if(!append)list.replaceChildren();
        result.events.forEach(item=>list.append(row(item)));
        before=result.events.at(-1)?.id||before;more.hidden=result.events.length<50;
        status.textContent=list.childElementCount?`已显示 ${list.childElementCount} 条记录`:'暂无符合条件的记录。启用后发生的登录会显示在这里。';
      }catch(error){if(root.isConnected)status.textContent=error.message||'读取失败，请重试';}
      finally{busy=false;refresh.disabled=more.disabled=account.disabled=event.disabled=false;}
    }
    account.onchange=event.onchange=()=>{before=null;load();};refresh.onclick=()=>{before=null;load();};more.onclick=()=>load(true);
    load();
  }
  return {openPasswordDialog,mountEvents};
})();
