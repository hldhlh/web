(() => {
  let scheduled = false;

  const style = document.createElement("style");
  style.textContent = `
    .ao-priority-strip {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      width: 100%;
      margin: 0 0 22px;
    }
    .ao-priority-entry {
      position: relative;
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr) auto;
      align-items: center;
      gap: 13px;
      min-height: 78px;
      padding: 12px 16px;
      border: 1px solid #e4e7ec;
      border-radius: 18px;
      background: #fff;
      color: #1d1d1f;
      font: inherit;
      text-align: left;
      cursor: pointer;
      box-shadow: 0 5px 18px rgba(24, 36, 58, .045);
    }
    .ao-priority-entry:hover { border-color: #b9cdfa; background: #f9fbff; }
    .ao-priority-icon {
      position: relative;
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: 14px;
      background: #edf4ff;
      color: #1764d9;
    }
    .ao-priority-entry.is-review .ao-priority-icon { background: #fff3e8; color: #df7200; }
    .ao-priority-icon svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .ao-priority-badge {
      position: absolute;
      top: -6px;
      right: -6px;
      display: grid;
      place-items: center;
      min-width: 20px;
      height: 20px;
      padding: 0 5px;
      border: 2px solid #fff;
      border-radius: 999px;
      background: #ff3b30;
      color: #fff;
      font-size: 10px;
      font-weight: 800;
      line-height: 1;
    }
    .ao-priority-copy { min-width: 0; }
    .ao-priority-copy strong { display: block; overflow: hidden; font-size: 15px; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
    .ao-priority-copy span { display: block; margin-top: 4px; overflow: hidden; color: #7b8493; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
    .ao-priority-arrow { color: #a0a7b2; font-size: 22px; font-weight: 400; }
    .ao-source-priority,
    .ao-redundant-exam { display: none !important; }
    .ao-exam-compact {
      position: relative !important;
      min-height: 96px !important;
      padding: 20px 112px 20px 76px !important;
      overflow: hidden !important;
      border: 1px solid #e5e7eb !important;
      border-radius: 18px !important;
      background: #fff !important;
      box-shadow: none !important;
    }
    .ao-exam-compact::before {
      content: "";
      position: absolute;
      top: 50%;
      left: 22px;
      width: 38px;
      height: 38px;
      border-radius: 12px;
      background:
        linear-gradient(#1764d9, #1764d9) 11px 12px / 16px 2px no-repeat,
        linear-gradient(#1764d9, #1764d9) 11px 18px / 12px 2px no-repeat,
        linear-gradient(#1764d9, #1764d9) 11px 24px / 9px 2px no-repeat,
        #edf4ff;
      transform: translateY(-50%);
    }
    .ao-exam-title { display: block !important; margin: 0 0 7px !important; color: #1d1d1f !important; font-size: 17px !important; font-weight: 750 !important; }
    .ao-exam-description {
      display: block !important;
      max-width: 100% !important;
      margin: 0 !important;
      overflow: hidden !important;
      color: #7a8392 !important;
      font-size: 13px !important;
      line-height: 1.5 !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }
    .ao-exam-status {
      position: absolute !important;
      top: 50% !important;
      right: 42px !important;
      margin: 0 !important;
      padding: 5px 9px !important;
      border-radius: 999px !important;
      background: #edf4ff !important;
      color: #1764d9 !important;
      font-size: 11px !important;
      font-weight: 750 !important;
      transform: translateY(-50%) !important;
    }
    .ao-exam-chevron { position: absolute; top: 50%; right: 20px; color: #b3b8c1; font-size: 20px; transform: translateY(-52%); }
    @media (max-width: 560px) {
      .ao-priority-strip { gap: 9px; }
      .ao-priority-entry { grid-template-columns: 42px minmax(0, 1fr); min-height: 88px; padding: 12px; }
      .ao-priority-icon { width: 42px; height: 42px; border-radius: 13px; }
      .ao-priority-arrow { display: none; }
      .ao-priority-copy strong { font-size: 14px; }
      .ao-priority-copy span { font-size: 11px; }
      .ao-exam-compact { min-height: 90px !important; padding: 18px 82px 18px 64px !important; }
      .ao-exam-compact::before { left: 15px; }
      .ao-exam-status { right: 17px !important; }
      .ao-exam-chevron { display: none; }
    }
  `;
  document.head.appendChild(style);

  const leaves = () => Array.from(document.querySelectorAll("a,button,span,strong,p,div,h1,h2,h3,h4"))
    .filter((node) => node.children.length === 0);

  const exact = (text) => leaves().filter((node) => node.textContent.trim() === text);

  const smallCard = (leaf, requiredText = "") => {
    let node = leaf.closest("a,button,[role='button']") || leaf.parentElement;
    while (node && node !== document.body) {
      const text = node.innerText || "";
      const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
      if ((!requiredText || text.includes(requiredText)) && lines.length >= 2 && lines.length <= 6) return node;
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

  const activate = (card) => {
    const action = card.matches("a,button,[role='button']") ? card : card.querySelector("a,button,[role='button']");
    (action || card).click();
  };

  const summary = (card, label) => {
    const lines = card.innerText.split("\n").map((line) => line.trim()).filter(Boolean).filter((line) => line !== label);
    return { title: lines[0] || label, detail: lines[1] || "点击处理" };
  };

  const icon = (type) => type === "exam"
    ? '<svg viewBox="0 0 24 24"><path d="M7 3h10v4H7zM5 5h14a2 2 0 0 1 2 2v14H3V7a2 2 0 0 1 2-2Z"/><path d="M8 12h8m-8 4h5"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M4 5h11a3 3 0 0 1 3 3v12H7a3 3 0 0 1-3-3V5Z"/><path d="M8 10h6m-6 4h4M18 8h2v9a3 3 0 0 1-3 3"/></svg>';

  const addPriorityStrip = () => {
    if (document.querySelector(".ao-priority-strip")) return;
    const examLeaf = exact("待考试")[0];
    const reviewLeaf = exact("待复习")[0];
    if (!examLeaf || !reviewLeaf) return;
    const examCard = smallCard(examLeaf);
    const reviewCard = smallCard(reviewLeaf);
    if (!examCard || !reviewCard) return;
    const host = commonParent([examCard, reviewCard]);
    if (!host) return;
    const examInfo = summary(examCard, "待考试");
    const reviewInfo = summary(reviewCard, "待复习");
    const reviewCount = reviewCard.innerText.match(/\d+/)?.[0] || "1";
    const strip = document.createElement("div");
    strip.className = "ao-priority-strip";
    strip.setAttribute("aria-label", "优先待办");
    strip.innerHTML = `
      <button class="ao-priority-entry" type="button" data-priority="exam">
        <span class="ao-priority-icon">${icon("exam")}<i class="ao-priority-badge">1</i></span>
        <span class="ao-priority-copy"><strong>${examInfo.title}</strong><span>${examInfo.detail}</span></span>
        <span class="ao-priority-arrow">›</span>
      </button>
      <button class="ao-priority-entry is-review" type="button" data-priority="review">
        <span class="ao-priority-icon">${icon("review")}<i class="ao-priority-badge">${reviewCount}</i></span>
        <span class="ao-priority-copy"><strong>${reviewInfo.title}</strong><span>${reviewInfo.detail}</span></span>
        <span class="ao-priority-arrow">›</span>
      </button>`;
    strip.querySelector("[data-priority='exam']").addEventListener("click", () => activate(examCard));
    strip.querySelector("[data-priority='review']").addEventListener("click", () => activate(reviewCard));
    const wrappers = [directChild(host, examCard), directChild(host, reviewCard)];
    host.insertBefore(strip, wrappers[0]);
    wrappers.forEach((wrapper) => wrapper.classList.add("ao-source-priority"));
  };

  const examCard = (title, status) => exact(title).map((leaf) => smallCard(leaf, status)).find(Boolean);

  const simplifyExamList = () => {
    const heading = exact("重要考试")[0];
    if (heading && heading.dataset.aoClearHeading !== "true") {
      heading.dataset.aoClearHeading = "true";
      heading.textContent = "必做考试";
    }

    const repeatedMock = examCard("综合模拟", "待复查");
    if (repeatedMock) repeatedMock.classList.add("ao-redundant-exam");

    const required = examCard("岗前通关", "关键考核");
    if (!required || required.dataset.aoExamClear === "true") return;
    required.dataset.aoExamClear = "true";
    required.classList.add("ao-exam-compact");
    const nodes = Array.from(required.querySelectorAll("span,strong,p,div,h3,h4")).filter((node) => node.children.length === 0);
    const title = nodes.find((node) => node.textContent.trim() === "岗前通关");
    const status = nodes.find((node) => node.textContent.trim().startsWith("关键考核"));
    const description = nodes.find((node) => {
      const text = node.textContent.trim();
      return text && node !== title && node !== status && text.length > 5;
    });
    title?.classList.add("ao-exam-title");
    if (status) {
      status.textContent = "必考";
      status.classList.add("ao-exam-status");
    }
    description?.classList.add("ao-exam-description");
    const chevron = document.createElement("span");
    chevron.className = "ao-exam-chevron";
    chevron.textContent = "›";
    chevron.setAttribute("aria-hidden", "true");
    required.appendChild(chevron);
  };

  const render = () => {
    const app = document.querySelector(".app");
    if (app?.classList.contains("ops-mode") || location.hash.startsWith("#/ops")) return;
    addPriorityStrip();
    simplifyExamList();
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
