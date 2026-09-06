(() => {
  const labels = ["学习进度", "考试跟踪", "待学习课程", "重要消息"];
  let scheduled = false;

  const style = document.createElement("style");
  style.textContent = `
    .ao-workbench {
      width: 100%;
      margin: 0 0 22px;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: var(--surface);
      box-shadow: var(--shadow);
      color: var(--text);
    }
    .ao-workbench-main {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) auto;
      align-items: center;
      gap: 16px;
      min-height: 116px;
      padding: 20px 22px;
    }
    .ao-workbench-icon {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: var(--surface-2);
      color: var(--text);
    }
    .ao-workbench-icon svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
    .ao-workbench-copy { min-width: 0; display: grid; gap: 3px; }
    .ao-workbench-meta { color: var(--muted); font-size: var(--type-footnote); font-weight: 500; line-height: 1.35; }
    .ao-workbench-copy h2 { margin: 0; font-size: var(--type-title-2); font-weight: 600; line-height: 1.25; letter-spacing: -.025em; }
    .ao-workbench-copy > span { display: block; overflow: hidden; color: var(--muted); font-size: var(--type-subhead); line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
    .ao-workbench-action {
      min-width: 96px;
      min-height: 44px;
      padding: 0 16px;
      border: 0;
      border-radius: 12px;
      background: var(--accent);
      color: #fff;
      font: inherit;
      font-size: var(--type-subhead);
      font-weight: 600;
      cursor: pointer;
      transition: opacity 140ms ease, transform 140ms ease;
    }
    .ao-workbench-action:hover { opacity: .86; }
    .ao-workbench-action:active { opacity: .72; transform: scale(.98); }
    .ao-workbench-source-grid { display: none !important; }
    @media (max-width: 560px) {
      .ao-workbench-main { grid-template-columns: 44px minmax(0, 1fr); gap: 12px; padding: 17px; }
      .ao-workbench-action { grid-column: 2; width: max-content; min-width: 0; margin-top: 6px; padding-inline: 15px; }
      .ao-workbench-copy h2 { font-size: var(--type-title-3); }
    }
  `;
  document.head.appendChild(style);

  const leafWithText = (scope, text) => Array.from(scope.querySelectorAll("h1,h2,h3,h4,h5,p,span,strong,div"))
    .find((node) => node.children.length === 0 && node.textContent.trim() === text);

  const findCard = (scope, title) => {
    const leaf = leafWithText(scope, title);
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
    message: '<svg viewBox="0 0 24 24"><path d="M5 18h10l4 3v-3a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z"/><path d="M8 9h8m-8 4h5"/></svg>',
    complete: '<svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-9"/></svg>'
  }[type]);

  const render = (scope = document) => {
    if (scope.querySelector(".ao-workbench")) return;
    const cards = labels.map(title => findCard(scope, title));
    if (cards.some((card) => !card)) return;
    const host = commonParent(cards);
    if (!host || host.dataset.aoWorkbenchSource === "true") return;

    const [, examCard, learningCard, messageCard] = cards;
    const examCount = Number(numberFrom(examCard).match(/\d+/)?.[0] || 0);
    const learningCount = Number(numberFrom(learningCard).match(/\d+/)?.[0] || 0);
    const messageCount = Number(numberFrom(messageCard).match(/\d+/)?.[0] || 0);
    const today = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date());
    const pending = [
      { type: "learn", count: learningCount, title: `${learningCount} 门课程待学习`, note: subtitleFrom(learningCard, "待学习课程", String(learningCount)), action: "继续学习" },
      { type: "exam", count: examCount, title: `${examCount} 项考试待处理`, note: subtitleFrom(examCard, "考试跟踪", String(examCount)), action: "去考试" },
      { type: "message", count: messageCount, title: `${messageCount} 条新消息`, note: subtitleFrom(messageCard, "重要消息", String(messageCount)), action: "查看消息" }
    ].filter((item) => item.count > 0);
    const primary = pending[0] || null;
    const totalPending = pending.reduce((sum, item) => sum + item.count, 0);

    const workbench = document.createElement("section");
    workbench.className = "ao-workbench";
    workbench.setAttribute("aria-label", "今日任务台");
    workbench.innerHTML = `
      <div class="ao-workbench-main">
        <span class="ao-workbench-icon" aria-hidden="true">${icon(primary?.type || "complete")}</span>
        <div class="ao-workbench-copy">
          <p class="ao-workbench-meta">${today}${totalPending ? ` · 共 ${totalPending} 项待处理` : ""}</p>
          <h2>${primary?.title || "今日已完成"}</h2>
          <span>${primary?.note || "没有需要立即处理的学习事务。"}</span>
        </div>
        ${primary ? `<button class="ao-workbench-action" type="button" data-action="${primary.type}">${primary.action}</button>` : ""}
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

  window.AcademyWorkbench = { render };
  schedule();
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
})();
