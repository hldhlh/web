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
    const description=el('p','security-events-intro','服务端登录记录 · 保留最近 90 天');
    const filters=el('div','security-event-filters');
    const accountLabel=el('label',null,'账号'),account=el('select');account.setAttribute('aria-label','筛选账号');
    account.append(new Option('全部账号',''));
    auth.list().forEach(user=>account.append(new Option(user.name,user.name)));accountLabel.append(account);
    const eventLabel=el('label',null,'结果'),event=el('select');event.setAttribute('aria-label','筛选登录结果');
    event.append(new Option('全部结果',''));Object.entries(labels).forEach(([value,label])=>event.append(new Option(label,value)));eventLabel.append(event);
    const refresh=el('button','ghost','刷新记录');refresh.type='button';filters.append(accountLabel,eventLabel,refresh);
    const status=el('p','security-event-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const list=el('div','security-event-list');const more=el('button','ghost security-events-more','载入更早记录');more.type='button';more.hidden=true;
    const footnote=el('p','security-events-footnote','IP 为网关转发信息，浏览器与设备信息可能被伪造。请结合使用时间核对；IP 变化本身不代表入侵。');
    root.append(description,filters,status,list,more,footnote);container.replaceChildren(root);
    function row(item){
      const article=el('article','security-event');
      const head=el('div','security-event-head'),name=el('strong',null,item.account_name||'未知账号');
      const badge=el('span','security-event-result',labels[item.event]||item.event);
      badge.dataset.kind=/failed|replaced/.test(item.event)?'attention':'normal';head.append(name,badge);
      const date=new Date(item.occurred_at),time=el('time',null,Number.isFinite(date.getTime())?date.toLocaleString('zh-CN',{hour12:false}):'时间不可用');
      time.dateTime=item.occurred_at;
      const ip=el('p','security-event-ip',`IP · ${item.forwarded_for||'未提供'}`);
      const details=el('details'),summary=el('summary',null,'设备与原因');
      const browser=el('p',null,`浏览器：${item.user_agent||'未提供'}`),device=el('p',null,`设备指纹：${item.device_fingerprint||'未提供'}`);
      details.append(summary,browser,device);if(item.reason)details.append(el('p',null,`原因：${reasons[item.reason]||item.reason}`));
      article.append(head,time,ip,details);return article;
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
