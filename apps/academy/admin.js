(() => {
  const Auth = window.AcademyAuth;
  const view = () => document.getElementById("view");
  let mode = "login";
  let busy = false;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;");
  }

  function accessLabel(user) {
    if (user.access === "full") return "全部权限";
    if (user.access === "blocked") return "已停用";
    return "仅基本";
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("app-theme", theme);
  }

  function renderGate() {
    document.querySelector(".app").classList.add("gated");
    view().innerHTML = `
      <form class="gate-card" id="auth-form">
        <p class="kicker">店长后台</p>
        <h2>用姓名和密码进入</h2>
        <div class="chips" style="padding-bottom:16px">
          <button type="button" class="chip ${mode === "login" ? "on" : ""}" data-mode="login">登录</button>
          <button type="button" class="chip ${mode === "register" ? "on" : ""}" data-mode="register">注册</button>
        </div>
        <label>姓名<input name="name" autocomplete="username" maxlength="16" required></label>
        <label>密码<input name="password" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" minlength="4" required></label>
        <p class="muted" id="auth-error"></p>
        <button class="primary" type="submit">${mode === "login" ? "进入后台" : "注册"}</button>
        <a class="ghost" href="./index.html" style="margin-top:8px;display:flex">返回学堂</a>
      </form>
    `;
    view().querySelectorAll("[data-mode]").forEach((btn) => {
      btn.onclick = () => { mode = btn.dataset.mode; renderGate(); };
    });
    view().querySelector("#auth-form").onsubmit = async (event) => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      const data = new FormData(event.target);
      const err = document.getElementById("auth-error");
      try {
        if (mode === "register") await Auth.register(data.get("name"), data.get("password"));
        else await Auth.login(data.get("name"), data.get("password"));
        paint();
      } catch (error) {
        err.textContent = error.message;
      } finally {
        busy = false;
      }
    };
  }

  function renderDenied() {
    document.querySelector(".app").classList.add("gated");
    view().innerHTML = `
      <div class="gate-card">
        <p class="kicker">无权限</p>
        <h2>只有店长能进后台</h2>
        <p class="muted">当前账号是 ${escapeHtml(Auth.session.name)}，权限为${accessLabel(Auth.session)}。</p>
        <button class="primary" id="out">退出</button>
        <a class="ghost" href="./index.html" style="margin-top:8px;display:flex">返回学堂</a>
      </div>
    `;
    document.getElementById("out").onclick = () => { Auth.logout(); paint(); };
  }

  function renderBoard() {
    document.querySelector(".app").classList.remove("gated");
    const people = Auth.list().sort((a, b) => Number(a.access !== "basic") - Number(b.access !== "basic") || a.name.localeCompare(b.name, "zh"));
    const pending = people.filter((user) => user.access === "basic" && user.role !== "manager").length;
    view().innerHTML = `
      <div class="hello">
        <div>
          <p>${escapeHtml(Auth.session.name)} · 店长</p>
          <h2>${pending ? `${pending} 人待授权` : "账号已全部处理"}</h2>
        </div>
      </div>
      <a class="ghost" href="./index.html#/ops?section=status">设置今日状态</a>
      <div class="counts">
        <div class="count"><b>${people.length}</b><span>注册人数</span></div>
        <div class="count ${pending ? "hot" : ""}"><b>${pending}</b><span>待授权</span></div>
        <div class="count"><b>${people.filter((user) => user.access === "full").length}</b><span>全部权限</span></div>
      </div>
      <div class="sec-title"><h3>员工</h3><span>授权随时可收回</span></div>
      ${people.map((user) => `
        <div class="card notice ${user.access === "basic" && user.role !== "manager" ? "urgent" : ""}">
          <div class="kicker">${user.role === "manager" ? "店长" : "员工"} · ${accessLabel(user)}</div>
          <strong>${escapeHtml(user.name)}</strong>
          <p class="muted">注册于 ${escapeHtml((user.createdAt || "").replace("T", " ").slice(0, 16))}${user.approvedBy ? ` · ${escapeHtml(user.approvedBy)} 授权` : ""}</p>
          <div class="tools" style="margin-top:10px">
            ${user.access !== "full" && user.access !== "blocked" ? `<button data-act="full" data-id="${user.id}">授权全部</button>` : ""}
            ${user.access === "full" && user.id !== Auth.session.id ? `<button data-act="basic" data-id="${user.id}">收回全部</button>` : ""}
            ${user.access !== "blocked" && user.id !== Auth.session.id ? `<button data-act="blocked" data-id="${user.id}">停用</button>` : ""}
            ${user.access === "blocked" ? `<button data-act="basic" data-id="${user.id}">恢复基本</button>` : ""}
          </div>
        </div>
      `).join("")}
    `;
    view().onclick = async (event) => {
      const btn = event.target.closest("[data-act]");
      if (!btn || busy) return;
      busy = true;
      try {
        await Auth.setAccess(btn.dataset.id, btn.dataset.act, Auth.session);
        paint();
      } catch (error) {
        alert(error.message);
      } finally {
        busy = false;
      }
    };
  }

  function paint() {
    if (!Auth.session) return renderGate();
    if (!Auth.isManager(Auth.session)) return renderDenied();
    renderBoard();
  }

  async function init() {
    setTheme(localStorage.getItem("app-theme") || "light");
    document.getElementById("theme-btn").onclick = () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      setTheme(next);
    };
    document.getElementById("out-btn").onclick = () => { Auth.logout(); paint(); };
    await Auth.start();
    Auth.onChange(paint);
    paint();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
