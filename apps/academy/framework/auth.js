window.AcademyAuth = (() => {
  const FILE = "academy/accounts.json";
  const SESSION_KEY = "academy-session-v1";
  const NOTICE_KEY = "academy-auth-notice-v1";
  const DEVICE_KEY = "academy-device-id-v1";
  const listeners = new Set();
  let users = [];
  try { users = JSON.parse(localStorage.getItem("academy-people-cache-v1") || "[]"); } catch (_) {}
  let rev = 0;
  let session = readSession();
  let channel = null;
  let pullPromise = null;
  let hasPulled = false;
  let lastPullAt = 0;
  let sessionCheckTimer = 0;

  const deviceId = (() => {
    try {
      const current = localStorage.getItem(DEVICE_KEY);
      if (current) return current;
      const next = (crypto.randomUUID && crypto.randomUUID()) || `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_KEY, next);
      return next;
    } catch (_) {
      return `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  })();

  function readSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    } catch (_) {
      return null;
    }
  }

  function writeSession(next, notice) {
    session = next;
    if (next) sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(SESSION_KEY);
    if (notice) sessionStorage.setItem(NOTICE_KEY, notice);
    else if (next) sessionStorage.removeItem(NOTICE_KEY);
    listeners.forEach((fn) => fn(session));
  }

  function consumeNotice() {
    const notice = sessionStorage.getItem(NOTICE_KEY) || "";
    sessionStorage.removeItem(NOTICE_KEY);
    return notice;
  }

  function sessionFile(userId) {
    return `academy/sessions/${userId}.json`;
  }

  function createSessionToken() {
    return (crypto.randomUUID && crypto.randomUUID()) || `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  async function claimSession(user) {
    const token = createSessionToken();
    const lease = {
      userId: user.id,
      token,
      deviceId,
      issuedAt: Date.now()
    };
    await window.AcademyStore.putJSON(sessionFile(user.id), lease);
    if (channel) channel.send({ type: "broadcast", event: "session", payload: lease });
    return Object.assign(publicUser(user), { sessionToken: token, deviceId });
  }

  function forceLogout(message) {
    if (!session) return;
    writeSession(null, message || "账号已在其他终端登录，本终端已安全退出");
  }

  async function verifySession() {
    const current = session;
    if (!current) return false;
    try {
      const lease = await window.AcademyStore.getJSON(sessionFile(current.id));
      if (!session || session.id !== current.id) return false;
      if (!lease && !current.sessionToken) {
        const user = findById(current.id);
        if (user) writeSession(await claimSession(user));
        return true;
      }
      if (!lease || !current.sessionToken || lease.token !== current.sessionToken) {
        forceLogout("账号已在其他终端登录，本终端已安全退出");
        return false;
      }
      return true;
    } catch (_) {
      return true;
    }
  }

  async function releaseSession(current) {
    if (!current?.sessionToken) return;
    try {
      const lease = await window.AcademyStore.getJSON(sessionFile(current.id));
      if (lease?.token !== current.sessionToken) return;
      await window.AcademyStore.putJSON(sessionFile(current.id), {
        userId: current.id,
        token: "",
        deviceId: current.deviceId || deviceId,
        releasedAt: Date.now()
      });
    } catch (_) { }
  }

  function publicUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      access: user.access,
      createdAt: user.createdAt,
      approvedAt: user.approvedAt,
      approvedBy: user.approvedBy
    };
  }

  async function digest(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function hashPass(name, password, salt) {
    return digest(`${salt}:${name}:${password}`);
  }

  function salt() {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function findByName(name) {
    const key = normalizeName(name);
    return users.find((user) => normalizeName(user.name) === key);
  }

  function normalizeName(name) {
    return String(name || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
  }

  function fieldError(message, field, code) {
    const error = new Error(message);
    error.field = field;
    error.code = code;
    return error;
  }

  function findById(id) {
    return users.find((user) => user.id === id);
  }

  async function pull(force = false) {
    if (pullPromise) return pullPromise;
    if (!force && hasPulled && Date.now() - lastPullAt < 30 * 1000) return users;
    pullPromise = (async () => {
      const data = await window.AcademyStore.getJSON(FILE, { required: true });
      if (!data || !Array.isArray(data.users)) {
        const error = new Error("账号数据不可用");
        error.code = "ACCOUNT_SYNC_FAILED";
        throw error;
      }
      hasPulled = true;
      lastPullAt = Date.now();
      if (Number(data.rev) < rev) return users;
      users = data.users;
      try { localStorage.setItem("academy-people-cache-v1", JSON.stringify(users.map(publicUser))); } catch (_) {}
      rev = Number(data.rev) || Date.now();
      refreshSession();
      return users;
    })();
    try {
      return await pullPromise;
    } finally {
      pullPromise = null;
    }
  }

  async function push() {
    rev = Date.now();
    await window.AcademyStore.putJSON(FILE, { rev, users });
    if (channel) channel.send({ type: "broadcast", event: "accounts", payload: { rev } });
  }

  function refreshSession() {
    if (!session) return;
    const fresh = findById(session.id);
    if (!fresh || fresh.access === "blocked") {
      writeSession(null, fresh?.access === "blocked" ? "账号已被店长停用" : "账号已失效，请重新登录");
      return;
    }
    const next = Object.assign(publicUser(fresh), {
      sessionToken: session.sessionToken,
      deviceId: session.deviceId || deviceId
    });
    if (JSON.stringify(next) !== JSON.stringify(session)) writeSession(next);
  }

  function canEnter(user) {
    return Boolean(user && user.access !== "blocked");
  }

  function canFull(user) {
    return Boolean(user && (user.role === "manager" || user.access === "full"));
  }

  function isManager(user) {
    return Boolean(user && user.role === "manager" && user.access !== "blocked");
  }

  async function register(name, password) {
    name = String(name || "").normalize("NFKC").trim().replace(/\s+/g, " ");
    password = String(password || "");
    if (name.length < 2 || name.length > 16) throw fieldError("姓名请使用 2 到 16 个字", "name", "INVALID_NAME");
    if (password.length < 4) throw fieldError("密码至少需要 4 位", "password", "INVALID_PASSWORD");
    await pull(true);
    if (findByName(name)) throw fieldError("这个姓名已经注册，请直接登录", "name", "ACCOUNT_EXISTS");
    const userSalt = salt();
    const first = users.length === 0;
    const user = {
      id: (crypto.randomUUID && crypto.randomUUID()) || `u-${Date.now()}`,
      name,
      salt: userSalt,
      pass: await hashPass(name, password, userSalt),
      role: first ? "manager" : "staff",
      access: first ? "full" : "basic",
      createdAt: new Date().toISOString(),
      approvedAt: first ? new Date().toISOString() : null,
      approvedBy: first ? name : null
    };
    users.push(user);
    await push();
    writeSession(await claimSession(user));
    return publicUser(user);
  }

  async function login(name, password) {
    name = String(name || "").normalize("NFKC").trim().replace(/\s+/g, " ");
    password = String(password || "");
    if (!name) throw fieldError("请输入注册时使用的姓名", "name", "NAME_REQUIRED");
    if (!password) throw fieldError("请输入密码", "password", "PASSWORD_REQUIRED");
    let user;
    try {
      await pull();
      user = findByName(name);
      if (!user) {
        await pull(true);
        user = findByName(name);
      }
    } catch (cause) {
      const error = fieldError("暂时无法读取账号，请检查网络后重试", "", "ACCOUNT_SYNC_FAILED");
      error.cause = cause;
      throw error;
    }
    if (!user) throw fieldError("没有找到这个账号，请核对姓名或先注册", "name", "ACCOUNT_NOT_FOUND");
    const hashed = await hashPass(user.name, password, user.salt);
    if (hashed !== user.pass) throw fieldError("密码不正确，请重新输入", "password", "PASSWORD_INCORRECT");
    if (user.access === "blocked") throw fieldError("账号已停用，请联系店长恢复", "name", "ACCOUNT_BLOCKED");
    writeSession(await claimSession(user));
    return publicUser(user);
  }

  function logout() {
    const current = session;
    writeSession(null);
    releaseSession(current);
  }

  async function setAccess(userId, access, actor) {
    if (!isManager(actor)) throw new Error("只有店长可以改权限");
    await pull(true);
    const user = findById(userId);
    if (!user) throw new Error("找不到这个人");
    if (user.role === "manager" && user.id === actor.id && access === "blocked") {
      throw new Error("不能停用自己");
    }
    user.access = access;
    if (access === "full") {
      user.approvedAt = new Date().toISOString();
      user.approvedBy = actor.name;
    }
    if (access !== "full") user.approvedAt = user.approvedAt || null;
    await push();
    refreshSession();
    return publicUser(user);
  }

  function list() {
    return users.map(publicUser);
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function connectRealtime() {
    if (channel) return channel;
    channel = window.AcademyStore.channel("academy-auth", {
      accounts: () => pull(true).catch(() => { }),
      session: (lease) => {
        if (!session || !lease || lease.userId !== session.id) return;
        if (lease.token && lease.token !== session.sessionToken) {
          forceLogout("账号已在其他终端登录，本终端已安全退出");
        }
      }
    });
    return channel;
  }

  function start() {
    connectRealtime();
    pull(true).then(() => session ? verifySession() : null).catch(() => { });
    setInterval(() => { if (!document.hidden) pull().catch(() => { }); }, 30000);
    clearInterval(sessionCheckTimer);
    sessionCheckTimer = setInterval(() => { if (!document.hidden) verifySession(); }, 15000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") verifySession();
    });
    return Promise.resolve(session);
  }

  return {
    get session() { return session; },
    canEnter,
    canFull,
    isManager,
    register,
    login,
    logout,
    setAccess,
    list,
    onChange,
    connectRealtime,
    consumeNotice,
    verifySession,
    start,
    pull
  };
})();
