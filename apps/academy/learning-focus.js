(() => {
  let scheduled = false;

  const style = document.createElement("style");
  style.textContent = `
    .ao-learning-focus {
      margin: 0;
      padding: 34px 36px 28px;
      border: 1px solid rgba(0, 0, 0, .055);
      background: #f5f5f7;
      color: #1d1d1f;
    }
    .ao-focus-topline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 17px;
    }
    .ao-focus-eyebrow {
      margin: 0;
      color: #0071e3;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: .02em;
    }
    .ao-focus-position {
      color: #86868b;
      font-size: 13px;
      font-weight: 600;
    }
    .ao-focus-content {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: end;
      gap: 32px;
    }
    .ao-focus-title {
      margin: 0;
      max-width: 760px;
      color: #1d1d1f;
      font-size: clamp(26px, 2.6vw, 40px);
      font-weight: 750;
      letter-spacing: -.045em;
      line-height: 1.14;
    }
    .ao-focus-meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0;
      margin: 13px 0 0;
      color: #6e6e73;
      font-size: 14px;
    }
    .ao-focus-meta span + span::before {
      content: "·";
      margin: 0 9px;
      color: #aeaeb2;
    }
    .ao-focus-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-width: 132px;
      height: 46px;
      padding: 0 22px;
      border: 0;
      border-radius: 999px;
      background: #0071e3;
      color: #fff;
      font: inherit;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: background .18s ease, transform .18s ease;
    }
    .ao-focus-action:hover { background: #0077ed; transform: scale(1.015); }
    .ao-focus-action:active { transform: scale(.985); }
    .ao-focus-action svg { width: 16px; height: 16px; fill: currentColor; }
    .ao-focus-progress {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 14px;
      margin-top: 28px;
    }
    .ao-focus-progress-track {
      height: 5px;
      overflow: hidden;
      border-radius: 999px;
      background: #dedee3;
    }
    .ao-focus-progress-track i {
      display: block;
      width: var(--focus-progress);
      height: 100%;
      border-radius: inherit;
      background: #0071e3;
    }
    .ao-focus-progress-label { color: #86868b; font-size: 12px; white-space: nowrap; }
    .ao-task-section-label,
    .ao-completed-toggle {
      width: 100%;
      min-height: 54px;
      padding: 0 36px;
      border: 0;
      border-top: 1px solid #e5e5e7;
      border-bottom: 1px solid #e5e5e7;
      background: #fff;
      color: #6e6e73;
      font: inherit;
      font-size: 13px;
      font-weight: 650;
      letter-spacing: .01em;
    }
    .ao-task-section-label {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .ao-task-section-label strong { color: #1d1d1f; font-size: 15px; font-weight: 750; }
    .ao-completed-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      text-align: left;
    }
    .ao-completed-toggle span { display: inline-flex; align-items: center; gap: 9px; }
    .ao-completed-toggle svg {
      width: 15px;
      height: 15px;
      fill: none;
      stroke: #86868b;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: transform .2s ease;
    }
    .ao-completed-toggle[aria-expanded="true"] svg { transform: rotate(180deg); }
    .ao-completed-task.is-collapsed { display: none !important; }
    .ao-current-task {
      position: relative;
      background: #fff !important;
      box-shadow: inset 4px 0 0 #0071e3 !important;
    }
    .ao-current-task::after {
      content: "当前";
      position: absolute;
      top: 18px;
      right: 30px;
      padding: 4px 8px;
      border-radius: 999px;
      background: #e8f2ff;
      color: #0071e3;
      font-size: 11px;
      font-weight: 750;
      pointer-events: none;
    }
    .ao-upcoming-task { background: #fff !important; }
    @media (max-width: 680px) {
      .ao-learning-focus { padding: 25px 22px 22px; }
      .ao-focus-content { grid-template-columns: 1fr; align-items: start; gap: 22px; }
      .ao-focus-title { font-size: 27px; }
      .ao-focus-action { width: 100%; }
      .ao-task-section-label, .ao-completed-toggle { padding: 0 22px; }
      .ao-current-task::after { top: 12px; right: 18px; }
    }
  `;
  document.head.appendChild(style);

  const leaves = (text) => Array.from(document.querySelectorAll("a,button,span,strong,p,div"))
    .filter((node) => node.children.length === 0 && node.textContent.trim() === text);

  const findTaskRow = (leaf) => {
    let node = leaf.closest("a,button") || leaf.parentElement;
    while (node && node !== document.body) {
      const text = node.innerText || "";
      const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
      if (/\d+\s*分钟/.test(text) && lines.length >= 3 && lines.length <= 9) return node;
      node = node.parentElement;
    }
    return null;
  };

  const findAction = (leaf, row) => leaf.closest("a,button,[role='button']") || row.querySelector("a,button,[role='button']") || leaf;

  const taskTitle = (row) => row.innerText.split("\n")
    .map((line) => line.trim())
    .find((line) => line && !/^(去学习|已完成|必修|选修|图文|视频|音频|考试|\d+\s*分钟)$/.test(line)) || "继续下一项学习";

  const taskDuration = (row) => row.innerText.match(/\d+\s*分钟/)?.[0] || "几分钟";

  const taskType = (row) => row.innerText.split("\n")
    .map((line) => line.trim())
    .find((line) => /^(图文|视频|音频|考试)$/.test(line)) || "学习任务";

  const commonParent = (nodes) => {
    let parent = nodes[0]?.parentElement;
    while (parent && !nodes.every((node) => parent.contains(node))) parent = parent.parentElement;
    return parent;
  };

  const directChild = (parent, node) => {
    let child = node;
    while (child.parentElement && child.parentElement !== parent) child = child.parentElement;
    return child;
  };

  const reset = () => {
    document.querySelectorAll(".ao-learning-focus,.ao-task-section-label,.ao-completed-toggle").forEach((node) => node.remove());
    document.querySelectorAll(".ao-completed-task,.ao-current-task,.ao-upcoming-task").forEach((node) => {
      node.classList.remove("ao-completed-task", "ao-current-task", "ao-upcoming-task", "is-collapsed");
    });
  };

  const render = () => {
    const pending = leaves("去学习").map((leaf) => {
      const row = findTaskRow(leaf);
      return row ? { leaf, row, action: findAction(leaf, row) } : null;
    }).filter(Boolean);
    if (!pending.length) return;

    const completedRows = leaves("已完成").map(findTaskRow).filter(Boolean);
    const allRows = [...completedRows, ...pending.map((item) => item.row)];
    const host = commonParent(allRows);
    if (!host) return;

    const first = pending[0];
    const title = taskTitle(first.row);
    const existing = document.querySelector(".ao-learning-focus");
    if (existing?.dataset.target === title) return;
    if (existing) reset();

    const completed = completedRows.length;
    const total = allRows.length;
    const current = completed + 1;
    const progress = Math.round((completed / Math.max(1, total)) * 100);
    const focus = document.createElement("section");
    focus.className = "ao-learning-focus";
    focus.dataset.target = title;
    focus.setAttribute("aria-label", "继续学习");
    focus.innerHTML = `
      <div class="ao-focus-topline">
        <p class="ao-focus-eyebrow">建议下一步</p>
        <span class="ao-focus-position">第 ${current} 项，共 ${total} 项</span>
      </div>
      <div class="ao-focus-content">
        <div>
          <h3 class="ao-focus-title">${title}</h3>
          <p class="ao-focus-meta"><span>${taskType(first.row)}</span><span>预计 ${taskDuration(first.row)}</span><span>完成后进入下一项</span></p>
        </div>
        <button class="ao-focus-action" type="button">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7 9 5-9 5Z"/></svg>
          继续学习
        </button>
      </div>
      <div class="ao-focus-progress">
        <div class="ao-focus-progress-track" style="--focus-progress:${progress}%"><i></i></div>
        <span class="ao-focus-progress-label">已完成 ${completed} 项 · 还剩 ${total - completed} 项</span>
      </div>`;
    focus.querySelector("button").addEventListener("click", () => first.action.click());

    const firstListItem = directChild(host, allRows[0]);
    host.insertBefore(focus, firstListItem);

    if (completedRows.length) {
      const toggle = document.createElement("button");
      toggle.className = "ao-completed-toggle";
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", "false");
      toggle.innerHTML = `<span>已完成 ${completedRows.length} 项</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
      host.insertBefore(toggle, firstListItem);
      const completedWrappers = completedRows.map((row) => directChild(host, row));
      completedWrappers.forEach((wrapper) => wrapper.classList.add("ao-completed-task", "is-collapsed"));
      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!expanded));
        completedWrappers.forEach((wrapper) => wrapper.classList.toggle("is-collapsed", expanded));
      });
    }

    const upcoming = document.createElement("div");
    upcoming.className = "ao-task-section-label";
    upcoming.innerHTML = `<strong>接下来</strong><span>${pending.length} 项待完成</span>`;
    const firstPendingWrapper = directChild(host, first.row);
    host.insertBefore(upcoming, firstPendingWrapper);
    firstPendingWrapper.classList.add("ao-current-task");
    pending.slice(1).forEach((item) => directChild(host, item.row).classList.add("ao-upcoming-task"));
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      render();
    });
  };

  schedule();
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
})();
