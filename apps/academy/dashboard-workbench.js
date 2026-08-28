(() => {
  const labels = ["学习进度", "考试跟踪", "待学习课程", "重要消息"];
  let scheduled = false;

  const style = document.createElement("style");
  style.textContent = `
    .ao-workbench {
      display: grid;
      grid-template-columns: minmax(260px, .9fr) minmax(360px, 1.4fr);
      width: 100%;
      margin: 0 0 22px;
      overflow: hidden;
      border: 1px solid rgba(15, 23, 42, .08);
      border-radius: 24px;
      background: rgba(255, 255, 255, .94);
      box-shadow: 0 18px 50px rgba(28, 42, 70, .07);
      color: #111827;
    }
    .ao-workbench-overview {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 280px;
      padding: 30px;
      overflow: hidden;
      background:
        radial-gradient(circle at 100% 0, rgba(34, 91, 218, .12), transparent 44%),
        linear-gradient(145deg, #f8fbff 0%, #eef4ff 100%);
    }
    .ao-workbench-overview::after {
      content: "";
      position: absolute;
      right: -46px;
      bottom: -66px;
      width: 190px;
      height: 190px;
      border: 38px solid rgba(35, 91, 218, .07);
      border-radius: 50%;
      pointer-events: none;
    }
    .ao-workbench-kicker {
      display: flex;
      align-items: center;
      gap: 9px;
      margin: 0 0 26px;
      color: #225bda;
      font-size: 14px;
      font-weight: 800;
      letter-spacing: .08em;
    }
    .ao-workbench-kicker::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #225bda;
      box-shadow: 0 0 0 6px rgba(34, 91, 218, .1);
    }
    .ao-workbench-heading {
      margin: 0;
      font-size: clamp(27px, 2.2vw, 38px);
      font-weight: 850;
      letter-spacing: -.04em;
      line-height: 1.18;
    }
    .ao-workbench-heading strong { color: #225bda; font-weight: 900; }
    .ao-workbench-note {
      max-width: 330px;
      margin: 12px 0 28px;
      color: #687386;
      font-size: 15px;
      line-height: 1.65;
    }
    .ao-workbench-progress-meta {
      position: relative;
      z-index: 1;
      display: flex;
      justify-content: space-between;
      margin-bottom: 9px;
      color: #596579;
      font-size: 13px;
      font-weight: 700;
    }
    .ao-workbench-progress-meta strong { color: #111827; font-size: 15px; }
    .ao-workbench-progress {
      position: relative;
      z-index: 1;
      height: 9px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(34, 91, 218, .12);
    }
    .ao-workbench-progress > i {
      display: block;
      width: var(--progress);
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #225bda, #4d85f4);
      box-shadow: 0 2px 8px rgba(34, 91, 218, .28);
    }
    .ao-workbench-tasks { padding: 28px 30px 24px; }
    .ao-workbench-title-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 9px;
    }
    .ao-workbench-title-row h2 { margin: 0; font-size: 20px; font-weight: 850; letter-spacing: -.02em; }
    .ao-workbench-date { color: #8a94a4; font-size: 13px; white-space: nowrap; }
    .ao-workbench-priority { margin: 0 0 12px; color: #707b8e; font-size: 14px; }
    .ao-workbench-list { margin: 0; padding: 0; list-style: none; }
    .ao-workbench-item {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) auto;
      align-items: center;
      gap: 14px;
      min-height: 68px;
      border-top: 1px solid #edf0f5;
    }
    .ao-workbench-icon {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border-radius: 12px;
      background: #eef4ff;
      color: #225bda;
    }
    .ao-workbench-icon svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
    .ao-workbench-copy { min-width: 0; }
    .ao-workbench-copy strong { display: block; margin-bottom: 3px; font-size: 15px; font-weight: 800; }
    .ao-workbench-copy span { display: block; overflow: hidden; color: #7a8495; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
    .ao-workbench-action {
      min-width: 88px;
      height: 36px;
      padding: 0 15px;
      border: 1px solid #dfe5ef;
      border-radius: 999px;
      background: #fff;
      color: #243044;
      font: inherit;
      font-size: 13px;
      font-weight: 750;
      cursor: pointer;
      transition: border-color .18s ease, background .18s ease, color .18s ease;
    }
    .ao-workbench-action:hover { border-color: #225bda; background: #225bda; color: #fff; }
    .ao-workbench-action.is-primary { border-color: #225bda; background: #225bda; color: #fff; }
    .ao-workbench-action.is-primary:hover { background: #1749ba; }
    .ao-workbench-source-grid { display: none !important; }
    @media (max-width: 760px) {
      .ao-workbench { grid-template-columns: 1fr; border-radius: 20px; }
      .ao-workbench-overview { min-height: 218px; padding: 24px; }
      .ao-workbench-note { margin-bottom: 22px; }
      .ao-workbench-tasks { padding: 23px 20px 18px; }
      .ao-workbench-item { grid-template-columns: 40px minmax(0, 1fr) auto; gap: 10px; }
      .ao-workbench-action { min-width: 72px; padding: 0 12px; }
    }
  `;
  document.head.appendChild(style);

  const leafWithText = (text) => Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,p,span,strong,div"))
    .find((node) => node.children.length === 0 && node.textContent.trim() === text);

  const findCard = (title) => {
    const leaf = leafWithText(title);
    if (!leaf) return null;
    const clickable = leaf.closest("a, button, [role='button']");
    if (clickable) return clickable;
    let node = leaf.parentElement;
    while (node && node !== document.body) {
      const lines = node.innerText.split("\n").map((line) => line.trim()).filter(Boolean);
      if (lines.includes(title) && lines.length >= 2 && lines.length <= 5 && /\d/.test(node.innerText)) return node;
      node = node.parentElement;
    }
    return null;
  };

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

  const numberFrom = (card) => card.innerText.match(/\d+\s*\/\s*\d+|\d+/)?.[0] || "0";
  const subtitleFrom = (card, title, value) => card.innerText.split("\n")
    .map((line) => line.trim())
    .find((line) => line && line !== title && line !== value) || "查看详情";

  const activate = (card) => {
    const target = card.matches("a, button, [role='button']") ? card : card.querySelector("a, button, [role='button']");
    (target || card).click();
  };

  const icon = (type) => ({
    learn: '<svg viewBox="0 0 24 24"><path d="M4 5.5h10a3 3 0 0 1 3 3V20H7a3 3 0 0 1-3-3V5.5Z"/><path d="M7 16.5h10M17 8h3v9a3 3 0 0 1-3 3"/></svg>',
    exam: '<svg viewBox="0 0 24 24"><path d="M8 4h8M9 3v3m6-3v3M6 5h12a2 2 0 0 1 2 2v13H4V7a2 2 0 0 1 2-2Z"/><path d="m8 13 2 2 5-5"/></svg>',
    message: '<svg viewBox="0 0 24 24"><path d="M5 18h10l4 3v-3a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z"/><path d="M8 9h8m-8 4h5"/></svg>'
  }[type]);

  const render = () => {
    if (document.querySelector(".ao-workbench")) return;
    const cards = labels.map(findCard);
    if (cards.some((card) => !card)) return;
    const host = commonParent(cards);
    if (!host || host.dataset.aoWorkbenchSource === "true") return;

    const [progressCard, examCard, learningCard, messageCard] = cards;
    const progressValue = numberFrom(progressCard);
    const progressParts = progressValue.match(/(\d+)\s*\/\s*(\d+)/);
    const done = Number(progressParts?.[1] || 0);
    const total = Math.max(1, Number(progressParts?.[2] || 1));
    const percentage = Math.min(100, Math.round((done / total) * 100));
    const remaining = Math.max(0, total - done);
    const examCount = numberFrom(examCard);
    const learningCount = numberFrom(learningCard);
    const messageCount = numberFrom(messageCard);
    const today = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date());

    const workbench = document.createElement("section");
    workbench.className = "ao-workbench";
    workbench.setAttribute("aria-label", "今日任务台");
    workbench.innerHTML = `
      <div class="ao-workbench-overview">
        <div>
          <p class="ao-workbench-kicker">今日任务台</p>
          <h2 class="ao-workbench-heading">已完成 <strong>${percentage}%</strong></h2>
          <p class="ao-workbench-note">${remaining ? `还有 ${remaining} 门课程待完成，建议先继续最近的学习任务。` : "课程学习已经完成，可以集中处理考试与消息。"}</p>
        </div>
        <div>
          <div class="ao-workbench-progress-meta"><span>整体学习进度</span><strong>${done} / ${total}</strong></div>
          <div class="ao-workbench-progress" style="--progress:${percentage}%"><i></i></div>
        </div>
      </div>
      <div class="ao-workbench-tasks">
        <div class="ao-workbench-title-row"><h2>接下来要做</h2><span class="ao-workbench-date">${today}</span></div>
        <p class="ao-workbench-priority">按当前状态整理，直接处理，不再只是查看数字。</p>
        <ol class="ao-workbench-list">
          <li class="ao-workbench-item">
            <span class="ao-workbench-icon">${icon("learn")}</span>
            <span class="ao-workbench-copy"><strong>${learningCount} 门课程待学习</strong><span>${subtitleFrom(learningCard, "待学习课程", learningCount)}</span></span>
            <button class="ao-workbench-action is-primary" type="button" data-action="learn">继续学习</button>
          </li>
          <li class="ao-workbench-item">
            <span class="ao-workbench-icon">${icon("exam")}</span>
            <span class="ao-workbench-copy"><strong>${examCount} 项考试待处理</strong><span>${subtitleFrom(examCard, "考试跟踪", examCount)}</span></span>
            <button class="ao-workbench-action" type="button" data-action="exam">去处理</button>
          </li>
          <li class="ao-workbench-item">
            <span class="ao-workbench-icon">${icon("message")}</span>
            <span class="ao-workbench-copy"><strong>${messageCount} 条重要消息</strong><span>${subtitleFrom(messageCard, "重要消息", messageCount)}</span></span>
            <button class="ao-workbench-action" type="button" data-action="message">查看</button>
          </li>
        </ol>
      </div>`;

    const actions = { learn: learningCard, exam: examCard, message: messageCard };
    workbench.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (button) activate(actions[button.dataset.action]);
    });

    const wrappers = [...new Set(cards.map((card) => directChild(host, card)))];
    host.dataset.aoWorkbenchSource = "true";
    host.classList.add("ao-workbench-source-grid");
    host.parentElement.insertBefore(workbench, host);
    wrappers.forEach((wrapper) => wrapper.setAttribute("aria-hidden", "true"));
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
