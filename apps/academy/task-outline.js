(() => {
  let scheduled = false;

  const style = document.createElement("style");
  style.textContent = `
    .ao-task-outline {
      padding: 30px 36px 32px;
      border-top: 1px solid #e5e5e7;
      border-bottom: 1px solid #e5e5e7;
      background: #fff;
      color: #1d1d1f;
    }
    .ao-outline-head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 24px;
      margin-bottom: 22px;
    }
    .ao-outline-eyebrow {
      margin: 0 0 7px;
      color: #86868b;
      font-size: 13px;
      font-weight: 650;
    }
    .ao-outline-title {
      margin: 0;
      color: #1d1d1f;
      font-size: clamp(24px, 2.3vw, 34px);
      font-weight: 750;
      letter-spacing: -.04em;
      line-height: 1.15;
    }
    .ao-outline-count { color: #6e6e73; font-size: 13px; white-space: nowrap; }
    .ao-outline-count strong { color: #1d1d1f; font-size: 21px; font-weight: 750; }
    .ao-stage-switcher {
      display: inline-grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(116px, auto);
      gap: 4px;
      max-width: 100%;
      margin-bottom: 25px;
      padding: 4px;
      overflow-x: auto;
      border-radius: 12px;
      background: #f2f2f7;
    }
    .ao-stage-button {
      min-height: 42px;
      padding: 0 17px;
      border: 0;
      border-radius: 9px;
      background: transparent;
      color: #6e6e73;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }
    .ao-stage-button.is-current {
      background: #fff;
      color: #1d1d1f;
      box-shadow: 0 1px 5px rgba(0, 0, 0, .1);
    }
    .ao-stage-button span { margin-left: 6px; color: #86868b; font-size: 11px; font-weight: 600; }
    .ao-stage-progress {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 14px;
      margin-bottom: 28px;
    }
    .ao-stage-progress-track {
      height: 5px;
      overflow: hidden;
      border-radius: 999px;
      background: #e5e5ea;
    }
    .ao-stage-progress-track i {
      display: block;
      width: var(--stage-progress);
      height: 100%;
      border-radius: inherit;
      background: #0071e3;
    }
    .ao-stage-progress span { color: #86868b; font-size: 12px; white-space: nowrap; }
    .ao-next-task-card {
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr) auto;
      align-items: center;
      gap: 18px;
      padding: 22px;
      border-radius: 20px;
      background: #f5f5f7;
    }
    .ao-next-index {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #1d1d1f;
      color: #fff;
      font-size: 17px;
      font-weight: 750;
    }
    .ao-next-copy { min-width: 0; }
    .ao-next-label { margin: 0 0 5px; color: #0071e3; font-size: 12px; font-weight: 750; }
    .ao-next-title {
      margin: 0;
      overflow: hidden;
      color: #1d1d1f;
      font-size: clamp(18px, 1.7vw, 23px);
      font-weight: 750;
      letter-spacing: -.025em;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ao-next-meta { margin: 6px 0 0; color: #86868b; font-size: 13px; }
    .ao-next-action {
      min-width: 102px;
      height: 42px;
      padding: 0 19px;
      border: 0;
      border-radius: 999px;
      background: #0071e3;
      color: #fff;
      font: inherit;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: background .18s ease, transform .18s ease;
    }
    .ao-next-action:hover { background: #0077ed; transform: scale(1.02); }
    .ao-outline-section-label,
    .ao-outline-completed {
      width: 100%;
      min-height: 56px;
      padding: 0 36px;
      border: 0;
      border-bottom: 1px solid #e5e5e7;
      background: #fff;
      color: #86868b;
      font: inherit;
      font-size: 13px;
      font-weight: 650;
    }
    .ao-outline-section-label {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .ao-outline-section-label strong { color: #1d1d1f; font-size: 15px; font-weight: 750; }
    .ao-outline-completed {
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      text-align: left;
    }
    .ao-outline-completed svg {
      width: 15px;
      height: 15px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: transform .18s ease;
    }
    .ao-outline-completed[aria-expanded="true"] svg { transform: rotate(180deg); }
    .ao-source-phase { display: none !important; }
    .ao-source-stage-summary { display: none !important; }
    .ao-source-current-task { display: none !important; }
    .ao-completed-task.is-collapsed { display: none !important; }
    .ao-later-task { background: #fff !important; }
    @media (max-width: 680px) {
      .ao-task-outline { padding: 24px 20px; }
      .ao-outline-head { align-items: flex-start; margin-bottom: 18px; }
      .ao-stage-switcher { display: grid; width: 100%; grid-auto-columns: minmax(105px, 1fr); }
      .ao-next-task-card { grid-template-columns: 42px minmax(0, 1fr); gap: 14px; padding: 18px; }
      .ao-next-index { width: 42px; height: 42px; }
      .ao-next-action { grid-column: 1 / -1; width: 100%; }
      .ao-next-title { white-space: normal; }
      .ao-outline-section-label, .ao-outline-completed { padding: 0 20px; }
    }
  `;
  document.head.appendChild(style);

  const allLeaves = () => Array.from(document.querySelectorAll("a,button,span,strong,p,div"))
    .filter((node) => node.children.length === 0);

  const exactLeaves = (text) => allLeaves().filter((node) => node.textContent.trim() === text);

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

  const findStageSummary = () => {
    const label = exactLeaves("阶段进度")[0];
    if (!label) return null;
    let node = label.parentElement;
    while (node && node !== document.body) {
      const lines = (node.innerText || "").split("\n").map((line) => line.trim()).filter(Boolean);
      if (lines.some((line) => /^学习阶段\s*\d+$/.test(line)) && lines.length <= 9) return node;
      node = node.parentElement;
    }
    return null;
  };

  const stageSources = () => allLeaves().filter((node) => /^阶段\s*\d+$/.test(node.textContent.trim())).map((leaf) => {
    let card = leaf.closest("a,button,[role='button']") || leaf.parentElement;
    while (card && card !== document.body) {
      const lines = (card.innerText || "").split("\n").map((line) => line.trim()).filter(Boolean);
      if (lines.some((line) => /^阶段\s*\d+$/.test(line)) && lines.some((line) => /^\d+%$/.test(line)) && lines.length <= 5) break;
      card = card.parentElement;
    }
    const label = leaf.textContent.trim().replace(/\s+/g, " ");
    const number = label.match(/\d+/)?.[0] || "1";
    const percent = card?.innerText.match(/\d+%/)?.[0] || "";
    return { card, action: leaf.closest("a,button,[role='button']") || card, label: `阶段 ${number}`, number, percent };
  }).filter((item) => item.card);

  const reset = () => {
    document.querySelectorAll(".ao-task-outline,.ao-outline-section-label,.ao-outline-completed").forEach((node) => node.remove());
    document.querySelectorAll(".ao-source-phase,.ao-source-stage-summary,.ao-source-current-task,.ao-completed-task,.ao-later-task").forEach((node) => {
      node.classList.remove("ao-source-phase", "ao-source-stage-summary", "ao-source-current-task", "ao-completed-task", "ao-later-task", "is-collapsed");
    });
  };

  const render = () => {
    const pending = exactLeaves("去学习").map((leaf) => {
      const row = findTaskRow(leaf);
      return row ? { leaf, row, action: findAction(leaf, row) } : null;
    }).filter(Boolean);
    if (!pending.length) return;

    const completedRows = exactLeaves("已完成").map(findTaskRow).filter(Boolean);
    const allRows = [...completedRows, ...pending.map((item) => item.row)];
    const host = commonParent(allRows);
    if (!host) return;

    const first = pending[0];
    const title = taskTitle(first.row);
    const existing = document.querySelector(".ao-task-outline");
    if (existing?.dataset.target === title) return;
    if (existing) reset();

    const completed = completedRows.length;
    const total = allRows.length;
    const current = completed + 1;
    const progress = Math.round((completed / Math.max(1, total)) * 100);
    const stageSummary = findStageSummary();
    const stageText = stageSummary?.innerText.match(/学习阶段\s*\d+/)?.[0] || "当前阶段";
    const stageNumber = stageText.match(/\d+/)?.[0] || "1";
    const phases = stageSources();

    const outline = document.createElement("section");
    outline.className = "ao-task-outline";
    outline.dataset.target = title;
    outline.setAttribute("aria-label", "当前学习阶段");
    outline.innerHTML = `
      <div class="ao-outline-head">
        <div><p class="ao-outline-eyebrow">当前阶段</p><h2 class="ao-outline-title">${stageText}</h2></div>
        <span class="ao-outline-count"><strong>${completed} / ${total}</strong> 项完成</span>
      </div>
      <nav class="ao-stage-switcher" aria-label="学习阶段">
        ${(phases.length ? phases : [{ label: `阶段 ${stageNumber}`, number: stageNumber, percent: `${progress}%` }]).map((phase, index) => `<button class="ao-stage-button${phase.number === stageNumber ? " is-current" : ""}" type="button" data-phase="${index}">${phase.label}<span>${phase.percent}</span></button>`).join("")}
      </nav>
      <div class="ao-stage-progress">
        <div class="ao-stage-progress-track" style="--stage-progress:${progress}%"><i></i></div>
        <span>${progress}%</span>
      </div>
      <article class="ao-next-task-card">
        <span class="ao-next-index">${current}</span>
        <div class="ao-next-copy">
          <p class="ao-next-label">下一项</p>
          <h3 class="ao-next-title">${title}</h3>
          <p class="ao-next-meta">${taskType(first.row)} · 预计 ${taskDuration(first.row)}</p>
        </div>
        <button class="ao-next-action" type="button">继续学习</button>
      </article>`;

    outline.querySelector(".ao-next-action").addEventListener("click", () => first.action.click());
    outline.querySelectorAll("[data-phase]").forEach((button) => {
      const source = phases[Number(button.dataset.phase)];
      if (source?.action) button.addEventListener("click", () => source.action.click());
    });

    const firstListItem = directChild(host, allRows[0]);
    host.insertBefore(outline, firstListItem);

    phases.forEach((phase) => directChild(commonParent(phases.map((item) => item.card)), phase.card).classList.add("ao-source-phase"));
    if (stageSummary) stageSummary.classList.add("ao-source-stage-summary");

    if (completedRows.length) {
      const toggle = document.createElement("button");
      toggle.className = "ao-outline-completed";
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", "false");
      toggle.innerHTML = `<span>已完成 ${completedRows.length} 项</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
      host.insertBefore(toggle, firstListItem);
      const wrappers = completedRows.map((row) => directChild(host, row));
      wrappers.forEach((wrapper) => wrapper.classList.add("ao-completed-task", "is-collapsed"));
      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!expanded));
        wrappers.forEach((wrapper) => wrapper.classList.toggle("is-collapsed", expanded));
      });
    }

    const currentWrapper = directChild(host, first.row);
    currentWrapper.classList.add("ao-source-current-task");
    const later = pending.slice(1);
    if (later.length) {
      const label = document.createElement("div");
      label.className = "ao-outline-section-label";
      label.innerHTML = `<strong>之后</strong><span>${later.length} 项</span>`;
      const firstLaterWrapper = directChild(host, later[0].row);
      host.insertBefore(label, firstLaterWrapper);
      later.forEach((item) => directChild(host, item.row).classList.add("ao-later-task"));
    }
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
