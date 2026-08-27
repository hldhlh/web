window.AcademyAuth = (() => {
  const FILE = "academy/accounts.json";
  const SESSION_KEY = "academy-session-v1";
  const listeners = new Set();
  let users = [];
  let rev = 0;
  let session = readSession();
  let channel = null;
  let pullPromise = null;
  let hasPulled = false;
  let lastPullAt = 0;

  function readSession() {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    } catch (_) {
      return null;
    }
  }

  function writeSession(next) {
    session = next;
    if (next) sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(SESSION_KEY);
    listeners.forEach((fn) => fn(session));
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
    const key = String(name || "").trim();
    return users.find((user) => user.name === key);
  }

  function findById(id) {
    return users.find((user) => user.id === id);
  }

  async function pull(force = false) {
    if (pullPromise) return pullPromise;
    if (!force && hasPulled && Date.now() - lastPullAt < 30 * 1000) return users;
    pullPromise = (async () => {
      const data = await window.AcademyStore.getJSON(FILE);
      hasPulled = true;
      lastPullAt = Date.now();
      if (!data || !Array.isArray(data.users)) return users;
      if (Number(data.rev) < rev) return users;
      users = data.users;
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
      writeSession(null);
      return;
    }
    const next = publicUser(fresh);
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
    name = String(name || "").trim();
    password = String(password || "");
    if (name.length < 2 || name.length > 16) throw new Error("姓名请用 2 到 16 个字");
    if (password.length < 4) throw new Error("密码至少 4 位");
    await pull(true);
    if (findByName(name)) throw new Error("这个姓名已经注册");
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
    writeSession(publicUser(user));
    return publicUser(user);
  }

  async function login(name, password) {
    name = String(name || "").trim();
    password = String(password || "");
    await pull();
    const user = findByName(name);
    if (!user) throw new Error("姓名或密码不对");
    const hashed = await hashPass(name, password, user.salt);
    if (hashed !== user.pass) throw new Error("姓名或密码不对");
    if (user.access === "blocked") throw new Error("权限已取消，请联系店长");
    writeSession(publicUser(user));
    return publicUser(user);
  }

  function logout() {
    writeSession(null);
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
      accounts: () => pull(true).catch(() => { })
    });
    return channel;
  }

  function start() {
    connectRealtime();
    pull(true).catch(() => { });
    setInterval(() => pull().catch(() => { }), 15000);
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
    start,
    pull
  };
})();
