(() => {
  "use strict";

  const FILE = "academy/daily-feedback.json";
  const CACHE_KEY = "academy-daily-feedback-cache-v1";
  const CATEGORIES = {
    service: "服务",
    product: "产品",
    environment: "环境",
    equipment: "设备",
    wish: "愿望",
    other: "其他"
  };
  const STATUSES = {
    open: "待处理",
    processing: "处理中",
    resolved: "已解决"
  };
  const state = {
    session: null,
    data: readCachedData(),
    filter: "pending",
    channel: null,
    saving: false
  };
  const $ = (selector) => document.querySelector(selector);
  const app = $("#feedback-app");

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function normalizeData(raw) {
    const items = Array.isArray(raw?.items) ? raw.items.map((item) => ({
      id: String(item?.id || ""),
      title: String(item?.title || "").trim(),
      detail: String(item?.detail || "").trim(),
      category: CATEGORIES[item?.category] ? item.category : "other",
      status: STATUSES[item?.status] ? item.status : "open",
      createdAt: Number(item?.createdAt) || 0,
      createdBy: {
        id: String(item?.createdBy?.id || ""),
        name: String(item?.createdBy?.name || "未知用户")
      },
      updatedAt: Number(item?.updatedAt) || Number(item?.createdAt) || 0,
      updatedBy: String(item?.updatedBy || "")
    })).filter((item) => item.id && item.title && item.detail) : [];
    return { rev: Number(raw?.rev) || 0, updatedAt: Number(raw?.updatedAt) || 0, items };
  }

  function readCachedData() {
    try {
      return normalizeData(JSON.parse(localStorage.getItem(CACHE_KEY) || "null"));
    } catch (_) {
      return { rev: 0, updatedAt: 0, items: [] };
    }
  }

  function cacheData() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(state.data)); } catch (_) { }
  }

  function isManager() {
    return Boolean(window.AcademyAuth?.isManager(state.session));
  }

  function localDateKey(timestamp = Date.now()) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function timeLabel(timestamp) {
    const value = Number(timestamp) || 0;
    if (!value) return "时间未知";
    const date = new Date(value);
    if (localDateKey(value) === localDateKey()) {
      return `今天 ${new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date)}`;
    }
    return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }

  function visibleItems() {
    const items = [...state.data.items].sort((a, b) => b.createdAt - a.createdAt);
    if (state.filter === "pending") return items.filter((item) => item.status !== "resolved");
    if (state.filter === "resolved") return items.filter((item) => item.status === "resolved");
    return items;
  }

  function renderOverview() {
    const today = localDateKey();
    $("#today-count").textContent = state.data.items.filter((item) => localDateKey(item.createdAt) === today).length;
    $("#pending-count").textContent = state.data.items.filter((item) => item.status !== "resolved").length;
    $("#resolved-count").textContent = state.data.items.filter((item) => item.status === "resolved").length;
  }

  function managerActions(item) {
    if (!isManager()) return "";
    if (item.status === "open") return `<button type="button" data-status-action="processing" data-id="${escapeHtml(item.id)}">开始处理</button>`;
    if (item.status === "processing") return `<button type="button" data-status-action="resolved" data-id="${escapeHtml(item.id)}">标记解决</button>`;
    return `<button type="button" data-status-action="open" data-id="${escapeHtml(item.id)}">重新打开</button>`;
  }

  function renderList() {
    const items = visibleItems();
    if (!items.length) {
      const message = state.filter === "resolved" ? "暂时没有已解决的问题" : state.filter === "pending" ? "当前没有待处理问题" : "今天还没有人反馈问题";
      $("#feedback-list").innerHTML = `<div class="empty-state"><strong>${message}</strong><span>发现问题时及时反馈，所有人都能看见处理进度。</span></div>`;
      return;
    }
    $("#feedback-list").innerHTML = items.map((item) => `
      <article class="feedback-item status-${item.status}">
        <header>
          <span class="category-label">${CATEGORIES[item.category]}</span>
          <span class="status-label">${STATUSES[item.status]}</span>
        </header>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.detail)}</p>
        <footer>
          <span><b>${escapeHtml(item.createdBy.name)}</b> · ${escapeHtml(timeLabel(item.createdAt))}</span>
          ${managerActions(item)}
        </footer>
      </article>`).join("");
  }

  function render() {
    renderOverview();
    renderList();
    document.querySelectorAll("[data-filter]").forEach((button) => {
      const selected = button.dataset.filter === state.filter;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function openCompose() {
    $("#feedback-form").reset();
    $("#compose-backdrop").hidden = false;
    $("#compose-sheet").hidden = false;
    document.body.style.overflow = "hidden";
    $("#feedback-title").focus();
  }

  function closeCompose() {
    $("#compose-backdrop").hidden = true;
    $("#compose-sheet").hidden = true;
    document.body.style.overflow = "";
    $("#open-compose").focus();
  }

  async function readLatest() {
    return JSON.parse(JSON.stringify(state.data));
  }

  async function writeData(next) {
    await window.AcademyStore.putJSON(FILE, next, { base: state.data });
    state.data = next;
    cacheData();
    state.channel?.send({ type: "broadcast", event: "feedback-version", payload: { rev: next.rev } });
  }

  async function submitFeedback() {
    if (state.saving) return;
    const title = $("#feedback-title").value.trim();
    const detail = $("#feedback-detail").value.trim();
    const category = $("#feedback-category").value;
    if (!title) return showToast("请填写问题标题");
    if (!detail) return showToast("请说明具体情况");
    state.saving = true;
    const button = $("#submit-feedback");
    button.disabled = true;
    button.textContent = "提交中";
    try {
      const latest = await readLatest();
      const now = Date.now();
      const item = {
        id: (crypto.randomUUID && crypto.randomUUID()) || `feedback-${now}-${Math.random().toString(36).slice(2)}`,
        title,
        detail,
        category: CATEGORIES[category] ? category : "other",
        status: "open",
        createdAt: now,
        createdBy: { id: state.session.id, name: state.session.name },
        updatedAt: now,
        updatedBy: state.session.id
      };
      await writeData({ rev: now, updatedAt: now, items: [item, ...latest.items] });
      closeCompose();
      state.filter = "pending";
      render();
      $("#sync-status").textContent = "已存本机，正在同步到云端";
      showToast("问题已存本机，后台同步中");
    } catch (error) {
      showToast(`提交失败：${error?.message || "请检查网络"}`);
    } finally {
      state.saving = false;
      button.disabled = false;
      button.textContent = "提交";
    }
  }

  async function updateStatus(id, status) {
    if (!isManager() || !STATUSES[status] || state.saving) return;
    state.saving = true;
    try {
      const latest = await readLatest();
      const now = Date.now();
      const items = latest.items.map((item) => item.id === id
        ? { ...item, status, updatedAt: now, updatedBy: state.session.id }
        : item);
      await writeData({ rev: now, updatedAt: now, items });
      render();
      showToast(`已改为“${STATUSES[status]}”`);
    } catch (error) {
      showToast(`更新失败：${error?.message || "请检查网络"}`);
    } finally {
      state.saving = false;
    }
  }

  async function pullFeedback(silent = false) {
    try {
      const raw = await window.AcademyStore.getJSON(FILE);
      if (raw) {
        const next = normalizeData(raw);
        if (!next.rev || next.rev >= state.data.rev) state.data = next;
        cacheData();
      }
      if (!silent) $("#sync-status").textContent = raw ? "已同步所有人的问题" : "暂无反馈，发现问题可立即提交";
      render();
    } catch (_) {
      if (!silent) $("#sync-status").textContent = "当前离线，显示上次同步的问题";
    }
  }

  let toastTimer = 0;
  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
  }

  function bindEvents() {
    $("#open-compose").addEventListener("click", openCompose);
    $("#cancel-compose").addEventListener("click", closeCompose);
    $("#compose-backdrop").addEventListener("click", closeCompose);
    $("#submit-feedback").addEventListener("click", submitFeedback);
    $("#feedback-form").addEventListener("submit", (event) => { event.preventDefault(); submitFeedback(); });
    document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      render();
    }));
    $("#feedback-list").addEventListener("click", (event) => {
      const button = event.target.closest("[data-status-action]");
      if (button) updateStatus(button.dataset.id, button.dataset.statusAction);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !$("#compose-sheet").hidden) closeCompose();
    });
  }

  async function boot() {
    bindEvents();
    try {
      const inheritedRuntime = window.FEEDBACK_USES_PARENT_RUNTIME === true;
      if (!inheritedRuntime) {
        await window.AcademyAuth.start();
        // Background account refresh is started by Auth.start().
      }
      const cached = await window.AcademyStore.getJSON(FILE, { cached: true });
      if (cached) state.data = normalizeData(cached);
      state.session = window.AcademyAuth.session;
      if (!state.session) {
        app.innerHTML = `<div class="empty-state"><strong>请先登录</strong><span>返回 Auto Office 登录后即可反馈和查看问题。</span></div>`;
        return;
      }
      $("#sync-status").textContent = state.data.rev ? "已显示上次问题，正在同步…" : "正在同步最新问题…";
      render();
      app.setAttribute("aria-busy", "false");
      state.channel = window.AcademyStore.channel("academy-feedback-live", {
        "feedback-version": (payload) => {
          if (Number(payload?.rev) > state.data.rev) pullFeedback(true);
        }
      });
      await pullFeedback();
      setInterval(() => { if (!document.hidden) pullFeedback(true); }, 30000);
      window.addEventListener("academy-data-updated", () => pullFeedback(true));
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") pullFeedback(true);
      });
      const stopAuth = window.AcademyAuth.onChange((session) => {
        state.session = session;
        if (!session) location.reload();
        else render();
      });
      window.addEventListener("pagehide", event => { if (!event.persisted) { stopAuth(); state.channel?.unsubscribe?.(); } });
    } catch (error) {
      $("#sync-status").textContent = "暂时无法连接问题反馈服务";
      showToast(error?.message || "加载失败");
      app.setAttribute("aria-busy", "false");
    }
  }

  boot();
})();
