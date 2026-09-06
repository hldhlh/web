(() => {
  const Auth = window.AcademyAuth;
  const view = () => document.getElementById("view");
  let mode = "login";
  let busy = false;
  let query = "";
  let filter = "all";

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
    document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#111315" : "#f2f2f7";
    document.getElementById("theme-btn").textContent = theme === "dark" ? "浅色" : "深色";
  }

  function renderGate() {
    document.querySelector(".app").classList.add("gated");
    view().innerHTML = `
      <form class="gate-card" id="auth-form">
        <p class="kicker">店长后台</p>
        <h2>登录后台</h2>
        <div class="chips" style="padding-bottom:16px">
          <button type="button" class="chip ${mode === "login" ? "on" : ""}" data-mode="login">登录</button>
          <button type="button" class="chip ${mode === "register" ? "on" : ""}" data-mode="register">注册</button>
        </div>
        <label>姓名<input name="name" autocomplete="username" maxlength="16" required></label>
        <label>密码<input name="password" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" minlength="4" required></label>
        <p class="muted" id="auth-error" role="status" aria-live="polite"></p>
        <button class="primary" type="submit">${mode === "login" ? "进入后台" : "注册"}</button>
        <a class="ghost" href="./index.html" style="margin-top:8px;display:flex">返回 Auto Office</a>
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
        <a class="ghost" href="./index.html" style="margin-top:8px;display:flex">返回 Auto Office</a>
      </div>
    `;
    document.getElementById("out").onclick = () => { Auth.logout(); paint(); };
  }

  function renderBoard() {
    document.querySelector(".app").classList.remove("gated");
    const people = Auth.list().sort((a, b) => Number(a.access !== "basic") - Number(b.access !== "basic") || a.name.localeCompare(b.name, "zh"));
    const pending = people.filter((user) => user.access === "basic" && user.role !== "manager").length;
    view().innerHTML = `
      <header class="admin-heading">
        <div><p>${escapeHtml(Auth.session.name)} · 店长</p><h2>管理工作台</h2>
        </div>
        <a class="admin-primary" href="./index.html#/ops?section=lessons">管理内容 <span aria-hidden="true">↗</span></a>
      </header>
      <nav class="admin-destinations" aria-label="后台功能">
        ${[["status", "今日状态"], ["layout", "首页布局"], ["tasks", "任务面板"], ["notices", "通知管理"]].map(([id, title]) => `<a href="./index.html#/ops?section=${id}"><strong>${title}</strong><span aria-hidden="true">›</span></a>`).join("")}
      </nav>
      <div class="counts">
        <div class="count"><b>${people.length}</b><span>注册人数</span></div>
        <div class="count ${pending ? "hot" : ""}"><b>${pending}</b><span>待授权</span></div>
        <div class="count"><b>${people.filter((user) => user.access === "full").length}</b><span>全部权限</span></div>
      </div>
      <section class="admin-members" aria-label="员工与权限">
      <header class="admin-members-head"><h3>员工与权限</h3><span id="member-result" role="status"></span></header>
      <div class="admin-filters"><label class="admin-search"><span aria-hidden="true">⌕</span><input id="member-search" type="search" placeholder="搜索姓名" aria-label="搜索员工姓名" value="${escapeHtml(query)}"></label>
      <div class="admin-segments" role="group" aria-label="权限筛选">${[["all", "全部"], ["basic", "待授权"], ["blocked", "已停用"]].map(([id, label]) => `<button type="button" data-filter="${id}" aria-pressed="${filter === id}">${label}</button>`).join("")}</div></div>
      ${people.map((user) => `
        <div class="admin-member" data-name="${escapeHtml(user.name)}" data-access="${user.access}" data-role="${user.role}">
          <span class="admin-avatar" aria-hidden="true">${escapeHtml(user.name.slice(0, 1))}</span><div class="admin-member-copy">
          <strong>${escapeHtml(user.name)}</strong>
          <span class="admin-access">${user.role === "manager" ? "店长" : "员工"} · ${accessLabel(user)}</span>
          <p class="muted">注册于 ${escapeHtml((user.createdAt || "").replace("T", " ").slice(0, 16))}${user.approvedBy ? ` · ${escapeHtml(user.approvedBy)} 授权` : ""}</p>
          </div><div class="tools">
            ${user.access !== "full" && user.access !== "blocked" ? `<button data-act="full" data-id="${user.id}">授权全部</button>` : ""}
            ${user.access === "full" && user.id !== Auth.session.id ? `<button data-act="basic" data-id="${user.id}">收回全部</button>` : ""}
            ${user.access !== "blocked" && user.id !== Auth.session.id ? `<button data-act="blocked" data-id="${user.id}">停用</button>` : ""}
            ${user.access === "blocked" ? `<button data-act="basic" data-id="${user.id}">恢复基本</button>` : ""}
          </div>
        </div>
      `).join("")}
      <p class="admin-empty" id="member-empty" hidden>没有符合条件的员工</p></section>
    `;
    const filterMembers = () => {
      let count = 0;
      view().querySelectorAll(".admin-member").forEach((row) => {
        const visible = row.dataset.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (filter === "all" || (row.dataset.access === filter && (filter !== "basic" || row.dataset.role !== "manager")));
        row.hidden = !visible;
        if (visible) count++;
      });
      document.getElementById("member-result").textContent = `${count} 位员工`;
      document.getElementById("member-empty").hidden = count > 0;
      view().querySelectorAll("[data-filter]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.filter === filter)));
    };
    document.getElementById("member-search").oninput = (event) => { query = event.target.value; filterMembers(); };
    filterMembers();
    view().onclick = async (event) => {
      const filterButton = event.target.closest("[data-filter]");
      if (filterButton) { filter = filterButton.dataset.filter; filterMembers(); return; }
      const btn = event.target.closest("[data-act]");
      if (!btn || busy) return;
      busy = true;
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = "保存中…";
      try {
        await Auth.setAccess(btn.dataset.id, btn.dataset.act, Auth.session);
        paint();
      } catch (error) {
        alert(error.message);
      } finally {
        busy = false;
        btn.disabled = false;
        btn.textContent = label;
      }
    };
  }

  function paint() {
    view().onclick = null;
    document.getElementById("out-btn").hidden = !Auth.session;
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
    await Auth.pull().catch(() => {});
    paint();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
