(() => {
  let scheduled = false;

  const style = document.createElement("style");
  style.textContent = `
    .ao-passed-item {
      position: relative !important;
      overflow: hidden !important;
    }
    .ao-pass-badge {
      position: absolute;
      top: 50%;
      right: 26px;
      z-index: 1;
      width: 94px;
      height: 94px;
      color: var(--ok);
      opacity: .82;
      transform: translateY(-50%) rotate(-9deg);
      pointer-events: none;
      filter: drop-shadow(0 5px 9px color-mix(in srgb, var(--ok) 12%, transparent));
    }
    .ao-pass-badge svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .ao-pass-ring,
    .ao-pass-inner,
    .ao-pass-rule,
    .ao-pass-check {
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .ao-pass-ring { stroke-width: 5; }
    .ao-pass-inner { stroke-width: 2.5; stroke-dasharray: 88 12; opacity: .72; }
    .ao-pass-rule { stroke-width: 2; opacity: .62; }
    .ao-pass-check { stroke-width: 4; }
    .ao-pass-cn {
      fill: currentColor;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro SC", "PingFang SC", sans-serif;
      font-size: 21px;
      font-weight: 800;
      letter-spacing: 1px;
      text-anchor: middle;
    }
    .ao-pass-en {
      fill: currentColor;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1.8px;
      text-anchor: middle;
      opacity: .78;
    }
    .ao-pass-badge.is-learned .ao-pass-en {
      font-size: 8.5px;
      letter-spacing: 1.2px;
    }
    .ao-passed-item:hover .ao-pass-badge {
      transform: translateY(-50%) rotate(-6deg) scale(1.025);
    }
    @media (max-width: 560px) {
      .ao-pass-badge { right: 15px; width: 76px; height: 76px; }
    }
    @media (prefers-contrast: more) {
      .ao-pass-ring { stroke-width: 6; }
      .ao-pass-inner, .ao-pass-rule { opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  const statusLeaves = () => Array.from(document.querySelectorAll("span,strong,p,div"))
    .filter((node) => !node.closest(".course-complete-badge")
      && !node.closest(".learning-plan")
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

  const badge = (state = "passed") => {
    const learned = state === "learned";
    const wrapper = document.createElement("span");
    wrapper.className = `ao-pass-badge${learned ? " is-learned" : ""}`;
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.innerHTML = `
      <svg viewBox="0 0 120 120">
        <circle class="ao-pass-ring" cx="60" cy="60" r="52"/>
        <circle class="ao-pass-inner" cx="60" cy="60" r="43"/>
        <path class="ao-pass-rule" d="M29 42h62M29 88h62"/>
        <path class="ao-pass-check" d="m47 31 8 8 18-18"/>
        <text class="ao-pass-en" x="61" y="56">${learned ? "LEARNED" : "PASS"}</text>
        <text class="ao-pass-cn" x="60" y="80">${learned ? "已学习" : "已通过"}</text>
      </svg>`;
    return wrapper;
  };

  const decorate = (item, state = "passed") => {
    if (!item || item.closest(".learning-plan") || item.dataset.aoPassBadge === "true") return;
    item.dataset.aoPassBadge = "true";
    item.classList.add("ao-passed-item");
    item.appendChild(badge(state));
  };

  const render = () => {
    document.querySelectorAll('[data-course-learned="true"]').forEach((item) => decorate(item, "learned"));
    document.querySelectorAll('[data-exam-passed="true"]').forEach(decorate);
    statusLeaves().forEach((status) => {
      const item = findItem(status);
      decorate(item);
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
