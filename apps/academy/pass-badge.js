(() => {
  let scheduled = false;

  const style = document.createElement("style");
  style.textContent = `
    .ao-passed-item {
      position: relative !important;
      min-height: 126px !important;
      padding-right: 148px !important;
      overflow: hidden !important;
      border-color: #dcefe1 !important;
      background:
        radial-gradient(circle at 88% 20%, rgba(52, 199, 89, .08), transparent 31%),
        linear-gradient(110deg, #f4fcf6 0%, #edf9f0 100%) !important;
    }
    .ao-pass-badge {
      position: absolute;
      top: 50%;
      right: 26px;
      width: 94px;
      height: 94px;
      transform: translateY(-50%) rotate(-9deg);
      pointer-events: none;
      filter: drop-shadow(0 5px 9px rgba(42, 171, 77, .1));
    }
    .ao-pass-badge-ring,
    .ao-pass-badge-inner,
    .ao-pass-badge-line {
      fill: none;
      stroke: #4acb62;
      stroke-linecap: round;
    }
    .ao-pass-badge-ring { stroke-width: 5; }
    .ao-pass-badge-inner { stroke-width: 2.5; stroke-dasharray: 88 12; opacity: .72; }
    .ao-pass-badge-line { stroke-width: 2; opacity: .62; }
    .ao-pass-badge-pass {
      fill: #39bd55;
      font-family: Avenir Next, Helvetica Neue, sans-serif;
      font-size: 23px;
      font-weight: 800;
      letter-spacing: 2px;
      text-anchor: middle;
    }
    .ao-pass-badge-cn {
      fill: #42c75c;
      font-family: PingFang SC, Microsoft YaHei, sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 2px;
      text-anchor: middle;
    }
    .ao-passed-item:hover .ao-pass-badge { transform: translateY(-50%) rotate(-6deg) scale(1.025); }
    @media (max-width: 560px) {
      .ao-passed-item { min-height: 112px !important; padding-right: 108px !important; }
      .ao-pass-badge { right: 15px; width: 76px; height: 76px; }
    }
  `;
  document.head.appendChild(style);

  const statusLeaves = () => Array.from(document.querySelectorAll("span,strong,p,div"))
    .filter((node) => !node.closest(".course-complete-badge")
      && node.children.length === 0
      && /^(已通过|通过)$/.test(node.textContent.trim()));

  const findItem = (status) => {
    let node = status.parentElement;
    while (node && node !== document.body) {
      const text = node.innerText || "";
      const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
      const hasScore = /(?:历史最高分|最高分|得分|成绩|\d+\s*分)/.test(text);
      if (hasScore && lines.length >= 2 && lines.length <= 12) return node;
      node = node.parentElement;
    }
    return null;
  };

  const badge = () => {
    const wrapper = document.createElement("span");
    wrapper.className = "ao-pass-badge";
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.innerHTML = `
      <svg viewBox="0 0 120 120">
        <circle class="ao-pass-badge-ring" cx="60" cy="60" r="52"/>
        <circle class="ao-pass-badge-inner" cx="60" cy="60" r="43"/>
        <path class="ao-pass-badge-line" d="M29 43h62M29 79h62"/>
        <path d="m47 31 8 8 18-18" fill="none" stroke="#4acb62" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        <text class="ao-pass-badge-pass" x="61" y="67">PASS</text>
        <text class="ao-pass-badge-cn" x="61" y="91">已通过</text>
      </svg>`;
    return wrapper;
  };

  const render = () => {
    statusLeaves().forEach((status) => {
      const item = findItem(status);
      if (!item || item.dataset.aoPassBadge === "true") return;
      item.dataset.aoPassBadge = "true";
      item.classList.add("ao-passed-item");
      item.appendChild(badge());
    });
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
