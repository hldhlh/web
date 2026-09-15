window.AcademySecureAuth = (() => {
  const SESSION_KEY = 'academy-session-v2';
  const PEOPLE_KEY = 'academy-people-cache-v1';
  const NOTICE_KEY = 'academy-auth-notice-v1';
  const messages = {
    AUTH_NOT_READY: '安全登录服务尚未启用，请联系店长',
    INVALID_CREDENTIALS: '姓名或当前密码不正确', ACCOUNT_EXISTS: '这个姓名已经注册，请直接登录',
    ACCOUNT_NOT_FOUND: '找不到这个账号', ACCOUNT_BLOCKED: '账号已被店长停用',
    RATE_LIMITED: '尝试次数较多，请在 10 分钟后重试', WEAK_PASSWORD: '新密码请使用 10 至 128 个字符',
    PASSWORD_UNCHANGED: '新密码不能与当前密码相同', FORBIDDEN: '只有店长可以查看或管理',
    MANAGER_PROTECTED: '不能修改店长账号的权限', INVALID_REQUEST: '提交内容有误，请检查后重试',
    SESSION_INVALID: '登录状态已失效，请重新登录', SESSION_REPLACED: '账号已在其他终端登录，本终端已退出',
    SESSION_ENDED: '登录状态已结束，请重新登录', SESSION_EXPIRED: '登录已过期，请重新登录',
    PASSWORD_CHANGED: '密码已修改，请使用新密码登录'
  };
  const sessionErrors = new Set(['SESSION_INVALID','SESSION_REPLACED','SESSION_ENDED','SESSION_EXPIRED','PASSWORD_CHANGED','ACCOUNT_BLOCKED']);
  const read = (storage, key, fallback) => { try { return JSON.parse(storage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
  function create(helpers) {
    let session = read(sessionStorage, SESSION_KEY, null);
    let users = read(localStorage, PEOPLE_KEY, []);
    let generation = 0, check = null, peopleTask = null, channel = null, started = false;
    let authentication = null, release = Promise.resolve();
    const listeners = new Set();
    let deviceId;
    try {
      deviceId = localStorage.getItem('academy-device-id-v1') || crypto.randomUUID();
      localStorage.setItem('academy-device-id-v1',deviceId);
    } catch { deviceId = crypto.randomUUID(); }
    // v1 tokens were publicly readable; never promote them into the protected backend.
    sessionStorage.removeItem('academy-session-v1');
    function write(next, notice) {
      if (session?.id !== next?.id || session?.sessionToken !== next?.sessionToken) generation++;
      session = next;
      if (next) sessionStorage.setItem(SESSION_KEY,JSON.stringify(next)); else sessionStorage.removeItem(SESSION_KEY);
      if (notice) sessionStorage.setItem(NOTICE_KEY,notice); else if (next) sessionStorage.removeItem(NOTICE_KEY);
      for (const fn of listeners) fn(session);
    }
    function consumeNotice() { const text = sessionStorage.getItem(NOTICE_KEY) || ''; sessionStorage.removeItem(NOTICE_KEY); return text; }
    function credentials(current = session) { return { userId: current?.id, sessionToken: current?.sessionToken, sessionVersion: current?.sessionVersion, deviceId }; }
    async function rpc(action, data = {}) {
      const cfg = window.ACADEMY_CONFIG;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(),20000);
      try {
        // Credential requests use the project HTTPS endpoint directly; never cache or replay writes.
        const response = await window.fetch(`${cfg.url}/rest/v1/rpc/academy_auth`, {
          method:'POST', cache:'no-store', signal:controller.signal,
          headers:{ apikey:cfg.key, Authorization:`Bearer ${cfg.key}`, 'Content-Type':'application/json' },
          body:JSON.stringify({ p_action:action, p_data:data })
        });
        if (!response.ok) throw new Error('登录服务暂时不可用，请稍后重试');
        const result = await response.json();
        if (!result || typeof result.ok !== 'boolean') throw new Error('登录服务响应异常，请稍后重试');
        if (!result.ok) {
          const error = new Error(messages[result.code] || '操作未完成，请稍后重试');
          error.code = result.code;
          if (['WEAK_PASSWORD','PASSWORD_UNCHANGED'].includes(result.code)) error.field = action === 'register' ? 'password' : 'newPassword';
          else if (result.code === 'INVALID_CREDENTIALS') error.field = 'password';
          throw error;
        }
        return result;
      } catch (error) {
        if (error.name === 'AbortError') throw new Error(action === 'change_password' ? '未收到改密结果，请先尝试用新密码登录，避免重复修改' : '网络响应超时，请稍后重试');
        throw error;
      } finally { clearTimeout(timeout); }
    }
    function invalidate(error, capturedGeneration) {
      if (session && generation === capturedGeneration && sessionErrors.has(error.code)) write(null,error.message);
    }
    function verifySession() {
      if (authentication) return authentication.then(() => Boolean(session), () => Boolean(session));
      if (!session) return Promise.resolve(false);
      if (check?.generation === generation) return check.promise;
      const current = session, captured = generation, entry = { generation:captured };
      entry.promise = rpc('verify',credentials(current)).then(result => {
        if (generation !== captured || !session) return false;
        const next = { ...result.user, sessionToken:current.sessionToken, sessionVersion:result.sessionVersion, deviceId };
        if (JSON.stringify(next) !== JSON.stringify(session)) write(next);
        return true;
      }).catch(error => { invalidate(error,captured); return Boolean(session && generation === captured); })
        .finally(() => { if (check === entry) check = null; });
      check = entry;
      return entry.promise;
    }
    function pull() {
      if (!session) return Promise.resolve(users);
      if (peopleTask?.generation === generation) return peopleTask.promise;
      const captured = generation, entry = { generation:captured };
      entry.promise = rpc('people',credentials()).then(result => {
        if (generation !== captured || !session) return users;
        if (!Array.isArray(result.users)) throw new Error('员工信息暂时不可用');
        users = result.users;
        try { localStorage.setItem(PEOPLE_KEY,JSON.stringify(users)); } catch {}
        const fresh = users.find(user => user.id === session.id);
        if (fresh) {
          const next = { ...fresh, sessionToken:session.sessionToken, sessionVersion:session.sessionVersion, deviceId };
          if (JSON.stringify(next) !== JSON.stringify(session)) write(next);
        }
        return users;
      }).catch(error => { invalidate(error,captured); throw error; }).finally(() => { if (peopleTask === entry) peopleTask = null; });
      peopleTask = entry;
      return entry.promise;
    }
    function hint(event, userId) { channel?.send({type:'broadcast',event,payload:{userId}}); }
    function authenticate(action, name, password) {
      if (authentication) return authentication;
      // Retire reads from the previous login before starting a new one.
      const captured = ++generation;
      authentication = (async () => {
        await release;
        const result = await rpc(action,{name,password,deviceId});
        // Explicit logout while a slow login is in flight must win.
        if (generation !== captured) throw new Error('登录状态已变化，请重试');
        write({ ...result.user, sessionToken:result.sessionToken, sessionVersion:result.sessionVersion, deviceId });
        hint('session',result.user.id);
        if (action === 'register') hint('accounts',result.user.id);
        pull().catch(() => {});
        return result.user;
      })().finally(() => { authentication = null; });
      return authentication;
    }
    function logout() {
      const current = session;
      // Also cancel any pending login when there is no session yet.
      generation++;
      write(null);
      if (!current) return;
      release = release.then(() => rpc('logout',credentials(current))).then(() => hint('session',current.id)).catch(() => {});
    }
    async function changePassword(name, password, newPassword) {
      if (typeof newPassword !== 'string' || [...newPassword].length < 10 || [...newPassword].length > 128) {
        const error = new Error(messages.WEAK_PASSWORD); error.field = 'newPassword'; throw error;
      }
      const result = await rpc('change_password',{name,password,newPassword,deviceId});
      if (session && session.name.normalize('NFKC').trim().toLocaleLowerCase('zh-CN') === name.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')) {
        write(null,messages.PASSWORD_CHANGED);
      }
      // Verification, not this public hint, decides whether other tabs must exit.
      hint('accounts');
      return result;
    }
    async function privileged(action, data) {
      const captured = generation;
      try { return await rpc(action,{...credentials(),...data}); }
      catch (error) { invalidate(error,captured); throw error; }
    }
    async function setAccess(targetId, access) {
      const result = await privileged('access',{targetId,access});
      hint('accounts',targetId); await pull(); return result.user;
    }
    async function setShortcutAccess(targetId, permissions, hideRestricted = true) {
      const result = await privileged('shortcuts',{targetId,permissions,hideRestricted});
      hint('accounts',targetId); await pull(); return result.user;
    }
    function connectRealtime() {
      if (channel) return channel;
      channel = window.AcademyStore.channel('academy-auth',{
        session: async payload => {
          if (!session || payload?.userId !== session.id) return;
          if (check) await check.promise;
          return verifySession();
        },
        accounts: async () => { if (peopleTask) await peopleTask.promise.catch(() => {}); await verifySession(); return pull().catch(() => {}); },
        connected: () => { verifySession(); pull().catch(() => {}); }
      });
      return channel;
    }
    async function start() {
      if (started) return session;
      started = true; connectRealtime();
      const resume = () => { if (!document.hidden && window.navigator?.onLine !== false) { verifySession(); pull().catch(() => {}); } };
      document.addEventListener('visibilitychange',resume);
      window.addEventListener('online',resume);
      setInterval(() => { if (!document.hidden) verifySession(); },15000);
      setInterval(() => { if (!document.hidden) pull().catch(() => {}); },30000);
      await verifySession();
      await pull().catch(() => {});
      return session;
    }
    return {
      ...helpers, get session() { return session; }, secure:true,
      login:(name,password) => authenticate('login',name,password), register:(name,password) => authenticate('register',name,password),
      logout, changePassword, setAccess, setShortcutAccess, verifySession, pull, start, connectRealtime, consumeNotice,
      list:() => users, onChange:fn => { listeners.add(fn); return () => listeners.delete(fn); },
      loginEvents:filters => privileged('events',filters || {})
    };
  }
  return { create };
})();
