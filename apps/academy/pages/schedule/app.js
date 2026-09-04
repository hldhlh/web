(() => {
  "use strict";

  const FILE = "academy/schedule.json";
  const SHIFTS = {
    morning: { label: "早班", short: "早" },
    middle: { label: "中班", short: "中" },
    evening: { label: "晚班", short: "晚" },
    full: { label: "全天", short: "全天" },
    off: { label: "休息", short: "休" }
  };
  const COLORS = ["#007aff", "#ff3b30", "#34c759", "#af52de", "#ff9500", "#00a7b5", "#5856d6", "#d14f86", "#5c6f82", "#8a6d3b"];
  const state = {
    session: null,
    people: [],
    data: { rev: 0, updatedAt: 0, assignments: {} },
    month: startOfMonth(new Date()),
    selected: dateKey(new Date()),
    filter: "all",
    channel: null,
    saving: false
  };

  const $ = (selector) => document.querySelector(selector);
  const app = $("#schedule-app");

  function startOfMonth(value) {
    return new Date(value.getFullYear(), value.getMonth(), 1);
  }

  function dateKey(value) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }

  function parseDate(key) {
    const [year, month, day] = String(key).split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function formatMonth(value) {
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(value);
  }

  function formatDay(value) {
    return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(value);
  }

  function personColor(id) {
    let hash = 0;
    for (const char of String(id || "")) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return COLORS[Math.abs(hash) % COLORS.length];
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  function normalizeData(raw) {
    const assignments = {};
    if (raw?.assignments && typeof raw.assignments === "object") {
      Object.entries(raw.assignments).forEach(([key, list]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Array.isArray(list)) return;
        assignments[key] = list.filter((item) => item?.userId && SHIFTS[item.shift]).map((item) => ({
          userId: String(item.userId),
          shift: item.shift,
          updatedAt: Number(item.updatedAt) || 0,
          updatedBy: String(item.updatedBy || "")
        }));
      });
    }
    return { rev: Number(raw?.rev) || 0, updatedAt: Number(raw?.updatedAt) || 0, assignments };
  }

  function isManager() {
    return Boolean(window.AcademyAuth?.isManager(state.session));
  }

  function activeAssignments(key) {
    const known = new Set(state.people.map((person) => person.id));
    let list = (state.data.assignments[key] || []).filter((item) => known.has(item.userId));
    if (state.filter === "mine") list = list.filter((item) => item.userId === state.session?.id);
    if (state.filter === "off") list = list.filter((item) => item.shift === "off");
    return list;
  }

  function personById(id) {
    return state.people.find((person) => person.id === id);
  }

  function renderHeader() {
    const manager = isManager();
    $("#permission-label").textContent = manager ? "店长权限 · 可编辑" : "员工视图 · 只读";
    $("#edit-day").hidden = !manager;
    $("#month-title").textContent = formatMonth(state.month);
  }

  function renderSummary() {
    const prefix = `${state.month.getFullYear()}-${String(state.month.getMonth() + 1).padStart(2, "0")}-`;
    const monthLists = Object.entries(state.data.assignments).filter(([key]) => key.startsWith(prefix)).flatMap(([, list]) => list);
    const arrangedPeople = new Set(monthLists.map((item) => item.userId)).size;
    const offCount = monthLists.filter((item) => item.shift === "off").length;
    $("#schedule-summary").innerHTML = `
      <span class="summary-item"><strong>${arrangedPeople}</strong> 人已有安排</span>
      <span class="summary-item"><strong>${monthLists.length}</strong> 条班次</span>
      <span class="summary-item"><strong>${offCount}</strong> 个休息日</span>`;
  }

  function renderCalendar() {
    const year = state.month.getFullYear();
    const month = state.month.getMonth();
    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    const first = new Date(year, month, 1 - offset);
    const today = dateKey(new Date());
    const cells = [];
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(first);
      date.setDate(first.getDate() + index);
      const key = dateKey(date);
      const assignments = activeAssignments(key);
      const eventRows = assignments.slice(0, 3).map((assignment) => {
        const person = personById(assignment.userId);
        if (!person) return "";
        const shift = SHIFTS[assignment.shift];
        return `<span class="calendar-event" style="--person-color:${personColor(person.id)}"><i></i><span>${escapeHtml(person.name)} · ${shift.short}</span></span>`;
      }).join("");
      const outside = date.getMonth() !== month;
      const label = `${formatDay(date)}，${assignments.length ? `${assignments.length}项安排` : "暂无安排"}`;
      cells.push(`
        <button class="calendar-day ${outside ? "outside" : ""} ${key === today ? "today" : ""} ${key === state.selected ? "selected" : ""}"
          type="button" role="gridcell" data-date="${key}" aria-label="${escapeHtml(label)}" aria-selected="${key === state.selected}">
          <span class="day-number">${date.getDate()}</span>
          <span class="calendar-events">${eventRows}</span>
          ${assignments.length > 3 ? `<span class="more-events">另有 ${assignments.length - 3} 项</span>` : ""}
        </button>`);
    }
    $("#calendar-grid").innerHTML = cells.join("");
  }

  function renderSelectedDay() {
    const date = parseDate(state.selected);
    const assignments = activeAssignments(state.selected);
    $("#selected-day-title").textContent = formatDay(date);
    $("#editor-title").textContent = formatDay(date);
    $("#selected-day-count").textContent = assignments.length ? `${assignments.length} 项` : "未安排";
    if (!assignments.length) {
      const message = state.filter === "mine" ? "你当天暂无排班" : state.filter === "off" ? "当天没有休息安排" : "当天还没有排班";
      $("#day-schedule").innerHTML = `<div class="empty-state">${message}${isManager() ? "，可点击“安排当天”进行设置。" : "。"}</div>`;
      return;
    }
    $("#day-schedule").innerHTML = assignments.map((assignment) => {
      const person = personById(assignment.userId);
      if (!person) return "";
      const shift = SHIFTS[assignment.shift];
      return `<article class="schedule-person" style="--person-color:${personColor(person.id)}">
        <span class="person-avatar">${escapeHtml(person.name.slice(0, 1))}</span>
        <span class="person-copy"><strong>${escapeHtml(person.name)}</strong><span>${person.role === "manager" ? "店长" : "员工"}</span></span>
        <span class="shift-badge ${assignment.shift === "off" ? "off" : ""}">${shift.label}</span>
      </article>`;
    }).join("");
  }

  function render() {
    renderHeader();
    renderSummary();
    renderCalendar();
    renderSelectedDay();
    document.querySelectorAll("[data-filter]").forEach((button) => {
      button.classList.toggle("active", button.dataset.filter === state.filter);
      button.setAttribute("aria-pressed", String(button.dataset.filter === state.filter));
    });
  }

  function openEditor() {
    if (!isManager()) return showToast("只有店长可以编辑排班");
    const current = new Map((state.data.assignments[state.selected] || []).map((item) => [item.userId, item.shift]));
    $("#people-editor").innerHTML = state.people.map((person) => `
      <label class="person-editor-row" style="--person-color:${personColor(person.id)}">
        <span class="person-avatar">${escapeHtml(person.name.slice(0, 1))}</span>
        <span><strong>${escapeHtml(person.name)}</strong><small>${person.role === "manager" ? "店长" : "员工"}</small></span>
        <select data-user-id="${escapeHtml(person.id)}" aria-label="${escapeHtml(person.name)}的班次">
          <option value="">未安排</option>
          ${Object.entries(SHIFTS).map(([value, shift]) => `<option value="${value}" ${current.get(person.id) === value ? "selected" : ""}>${shift.label}</option>`).join("")}
        </select>
      </label>`).join("");
    $("#editor-backdrop").hidden = false;
    $("#editor-sheet").hidden = false;
    document.body.style.overflow = "hidden";
    $("#cancel-edit").focus();
  }

  function closeEditor() {
    $("#editor-backdrop").hidden = true;
    $("#editor-sheet").hidden = true;
    document.body.style.overflow = "";
    $("#edit-day").focus();
  }

  async function saveEditor() {
    if (!isManager() || state.saving) return;
    state.saving = true;
    const saveButton = $("#save-edit");
    saveButton.disabled = true;
    saveButton.textContent = "保存中";
    try {
      const latestRaw = await window.AcademyStore.getJSON(FILE);
      const latest = normalizeData(latestRaw || state.data);
      const now = Date.now();
      const list = Array.from(document.querySelectorAll("#people-editor select"))
        .filter((select) => SHIFTS[select.value])
        .map((select) => ({ userId: select.dataset.userId, shift: select.value, updatedAt: now, updatedBy: state.session.id }));
      const assignments = { ...latest.assignments };
      if (list.length) assignments[state.selected] = list;
      else delete assignments[state.selected];
      state.data = { rev: now, updatedAt: now, assignments };
      await window.AcademyStore.putJSON(FILE, state.data);
      state.channel?.send({ type: "broadcast", event: "schedule-version", payload: { rev: now } });
      $("#sync-status").textContent = `刚刚由${state.session.name}更新`;
      closeEditor();
      render();
      showToast("排班已保存");
    } catch (error) {
      showToast(`保存失败：${error?.message || "请检查网络"}`);
    } finally {
      state.saving = false;
      saveButton.disabled = false;
      saveButton.textContent = "保存";
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

  async function pullSchedule(silent = false) {
    try {
      const raw = await window.AcademyStore.getJSON(FILE);
      if (raw) state.data = normalizeData(raw);
      if (!silent) $("#sync-status").textContent = raw ? "已同步最新排班" : "暂无排班，等待店长安排";
      render();
    } catch (_) {
      if (!silent) $("#sync-status").textContent = "当前离线，显示上次读取的排班";
    }
  }

  function bindEvents() {
    $("#previous-month").addEventListener("click", () => {
      state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1);
      state.selected = dateKey(state.month);
      render();
    });
    $("#next-month").addEventListener("click", () => {
      state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1);
      state.selected = dateKey(state.month);
      render();
    });
    $("#month-title").addEventListener("click", () => {
      state.month = startOfMonth(new Date());
      state.selected = dateKey(new Date());
      render();
    });
    $("#calendar-grid").addEventListener("click", (event) => {
      const day = event.target.closest("[data-date]");
      if (!day) return;
      state.selected = day.dataset.date;
      const selectedDate = parseDate(state.selected);
      if (selectedDate.getMonth() !== state.month.getMonth() || selectedDate.getFullYear() !== state.month.getFullYear()) {
        state.month = startOfMonth(selectedDate);
      }
      render();
    });
    document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      render();
    }));
    $("#edit-day").addEventListener("click", openEditor);
    $("#cancel-edit").addEventListener("click", closeEditor);
    $("#editor-backdrop").addEventListener("click", closeEditor);
    $("#save-edit").addEventListener("click", saveEditor);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !$("#editor-sheet").hidden) closeEditor();
    });
  }

  async function boot() {
    bindEvents();
    try {
      await window.AcademyAuth.start();
      await window.AcademyAuth.pull(true);
      state.session = window.AcademyAuth.session;
      if (!state.session) {
        app.innerHTML = `<div class="empty-state">请先返回 Auto Office 登录，再打开排班。</div>`;
        return;
      }
      state.people = window.AcademyAuth.list().filter((person) => person.access !== "blocked");
      state.channel = window.AcademyStore.channel("academy-schedule-live", {
        "schedule-version": (payload) => {
          if (Number(payload?.rev) > state.data.rev) pullSchedule(true);
        }
      });
      await pullSchedule();
      setInterval(() => pullSchedule(true), 30000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") pullSchedule(true);
      });
      window.AcademyAuth.onChange((session) => {
        state.session = session;
        if (!session) location.reload();
        else render();
      });
      app.setAttribute("aria-busy", "false");
    } catch (error) {
      $("#sync-status").textContent = "暂时无法连接排班服务";
      showToast(error?.message || "加载失败");
      app.setAttribute("aria-busy", "false");
    }
  }

  boot();
})();
