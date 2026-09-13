(() => {
  "use strict";
  const M = window.MeatTemplate;
  const $ = id => document.getElementById(id);
  let kind = "count";
  let workflow = M.workflows[kind];
  let storageKey = workflow.storageKey;
  let storageError = false;
  const sessions = new Map();
  function loadDraft() {
    let value = M.initial(kind);
    storageError = false;
    try { const saved = localStorage.getItem(storageKey); if (saved) value = M.restore(JSON.parse(saved), kind); } catch { storageError = true; }
    return value;
  }
  let draft = loadDraft();
  let mode = "stock";
  let index = M.missing(draft)[0] ?? 0;
  let buffer = draft.stock[index];
  let replaceOnType = true;
  let copyBusy = false;
  const grid = $("item-grid");
  const quantity = $("quantity");
  const preview = $("preview-dialog");
  const reset = $("reset-dialog");
  const editor = $("entry-dialog");
  document.title = "报货模版 · Auto Office";
  function configureWorkflow() {
    document.querySelectorAll("[data-kind]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.kind === kind)));
    $("orders-section").hidden = !workflow.compound;
    $("preview-title").textContent = workflow.preview;
    $("reset-title").textContent = `开始新一轮${workflow.verb}？`;
    reset.querySelector("p").textContent = workflow.compound ? "当前盘肉库存和订货会清空，其他报货类型保留。" : `当前${workflow.title}数据会清空，其他报货类型保留。`;
  }
  configureWorkflow();
  function switchWorkflow(next) {
    if (!Object.hasOwn(M.workflows, next) || next === kind) return;
    sessions.set(kind, { draft, mode, index, buffer, replaceOnType, storageError });
    kind = next;
    workflow = M.workflows[kind];
    storageKey = workflow.storageKey;
    const retained = sessions.get(kind);
    if (retained) ({ draft, mode, index, buffer, replaceOnType, storageError } = retained);
    else {
      draft = loadDraft();
      mode = "stock";
      index = M.missing(draft)[0] ?? 0;
      buffer = draft.stock[index];
      replaceOnType = true;
    }
    configureWorkflow();
    render();
    message("");
  }
  document.querySelectorAll("[data-kind]").forEach(button => button.addEventListener("click", () => switchWorkflow(button.dataset.kind)));
  const namesFor = rowMode => rowMode === "orders" ? M.orderItems : M.items;
  function makeRows(container, rowMode) { return namesFor(rowMode).map((name, i) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "item-row";
    card.innerHTML = `<span class="item-name">${name}</span><span class="item-value"></span><span class="item-state" aria-hidden="true"></span><span class="row-chevron" aria-hidden="true">›</span>`;
    card.addEventListener("click", () => { selectItem(i, rowMode); openEditor(); });
    container.append(card);
    return card;
  }); }
  const cards = makeRows(grid, "stock");
  const orderCards = makeRows($("orders-list"), "orders");

  function syncTheme() {
    try { document.documentElement.dataset.theme = localStorage.getItem("app-theme") || "light"; } catch {}
    document.querySelector('meta[name="theme-color"]').content = document.documentElement.dataset.theme === "dark" ? "#111315" : "#f2f2f7";
  }
  syncTheme();
  window.addEventListener("storage", event => { if (event.key === "app-theme" || event.key === null) syncTheme(); });

  function message(text, error = false) {
    $("entry-status").textContent = text;
    $("entry-status").dataset.error = String(error);
  }
  function save() {
    draft.updatedAt = new Date().toISOString();
    try { localStorage.setItem(storageKey, JSON.stringify(draft)); storageError = false; } catch { storageError = true; }
  }
  function render() {
    const count = 6 - M.missing(draft).length;
    $("list-title").textContent = workflow.primary;
    $("editor-context").textContent = mode === "stock" ? workflow.primary : "明日订货";
    $("progress-label").textContent = `${workflow.done} ${count} / 6`;
    $("overview-action").textContent = count === 6 ? "预览并复制" : `${count ? "继续" : "开始"}${workflow.verb}`;
    $("preview-button").textContent = count === 6 ? "修改数量" : "预览";
    function renderRows(rows, rowMode) { rows.forEach((card, i) => {
      const value = draft[rowMode][i];
      const done = rowMode === "stock" ? M.valid(draft.stock[i]) : Number(value) > 0;
      const unit = rowMode === "stock" && kind !== "morning" ? "kg" : draft.units[i];
      const valueNode = card.querySelector(".item-value");
      valueNode.textContent = value === "" ? (rowMode === "stock" ? "待填写" : "不订") : value;
      if (value !== "" && unit) { const small = document.createElement("small"); small.textContent = unit; valueNode.append(small); }
      const state = card.querySelector(".item-state");
      const stateLabel = rowMode === "stock" ? (done ? workflow.done : workflow.pending) : (done ? "已填写" : "留空不订");
      state.textContent = done ? "✓" : "";
      state.setAttribute("aria-hidden", "true");
      state.classList.toggle("done", done);
      card.setAttribute("aria-pressed", String(editor.open && i === index && mode === rowMode));
      card.setAttribute("aria-label", `${namesFor(rowMode)[i]}，${value === "" ? "未填写" : value + unit}，${stateLabel}`);
    }); }
    renderRows(cards, "stock");
    renderRows(orderCards, "orders");
    $("entry-label").textContent = namesFor(mode)[index];
    $("entry-hint").textContent = `${mode === "stock" ? workflow.step : "订货"} · ${index + 1} / ${namesFor(mode).length}`;
    quantity.value = buffer;
    $("stock-unit").hidden = mode !== "stock" || kind === "morning";
    $("order-unit").hidden = mode !== "orders" && kind !== "morning";
    $("order-unit").setAttribute("aria-label", kind === "morning" ? "明早订货单位" : "订货单位");
    $("order-unit").value = draft.units[index];
    $("previous-item").disabled = index === 0;
    $("zero-value").textContent = mode === "stock" ? workflow.zero : "不订此项";
    $("next-item").textContent = mode === "stock" ? (index === 5 ? (workflow.compound ? "去填写订货" : "预览报货") : "下一项 ›") : (index === M.orderItems.length - 1 ? "完成 · 预览报货" : "下一项 ›");
    if (storageError) $("draft-status").textContent = "本机保存不可用，请在离开前复制报货文本。";
    else if (draft.updatedAt) {
      const time = new Date(draft.updatedAt);
      const stamp = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(time);
      $("draft-status").textContent = time.toDateString() === new Date().toDateString() ? "已存本机" : `上次草稿 · ${stamp}`;
    } else $("draft-status").textContent = workflow.compound ? "已带入模版数值，可直接修改。" : (kind === "arrival" ? "填写实收重量，未到货填 0。" : "填写明早需订数量，不订填 0。");
  }
  function openEditor() {
    if (!editor.open) editor.showModal();
    render();
  }
  function selectItem(next, nextMode = mode) {
    index = next;
    mode = nextMode;
    buffer = draft[mode][index];
    replaceOnType = true;
    render();
    message("");
  }
  function updateBuffer(value) {
    const normalizedInput = value.endsWith(".") ? value.slice(0, -1) : value;
    if (!M.setValue(draft, mode, index, normalizedInput)) return;
    buffer = value;
    save();
    render();
  }
  function key(key) {
    let next = buffer;
    if (key === "backspace") next = next.slice(0, -1);
    else if (key === ".") next = replaceOnType || !next ? "0." : next.includes(".") ? next : `${next}.`;
    else if (/^\d$/.test(key)) next = replaceOnType || next === "0" ? key : next + key;
    else return;
    if (next && !/^\d{1,5}(?:\.\d{0,3})?$/.test(next)) { message("最多输入 5 位整数和 3 位小数。", true); return; }
    replaceOnType = false;
    updateBuffer(next);
    message("");
  }
  function nextItem() {
    if (mode === "stock") {
      if (!M.confirmStock(draft, index)) { message(`请先输入${kind === "morning" ? "数量" : "重量"}，或点“${workflow.zero}”。`, true); return; }
      save();
      if (index === 5) { if (workflow.compound) selectItem(0, "orders"); else { render(); openPreview(); } }
      else selectItem(index + 1);
    } else if (index === M.orderItems.length - 1) openPreview();
    else selectItem(index + 1);
  }
  function openPreview() {
    if (editor.open) editor.close();
    const text = M.report(draft, kind);
    $("template-text").textContent = text;
    $("template-text").hidden = !text;
    const needsRemainder = kind === "count" && !M.valid(draft.stock[0]);
    $("preview-hint").textContent = needsRemainder ? "明日订货末尾需附吊龙余量，请先填写。" : text ? "待填写项目已跳过。" : "暂无可预览内容，请先填写数量。";
    $("copy-button").textContent = needsRemainder ? "填写吊龙余量" : workflow.copy;
    $("copy-button").disabled = !text && !needsRemainder;
    $("copy-status").textContent = needsRemainder ? "其他待填写项目仍会自动跳过。" : text ? "复制后可直接粘贴发送。" : "填写后即可复制。";
    $("manual-copy").hidden = true;
    preview.showModal();
  }
  function legacyCopy(text) {
    $("manual-text").value = text;
    $("manual-copy").hidden = false;
    $("manual-text").focus({ preventScroll: true });
    $("manual-text").select();
    $("manual-text").setSelectionRange(0, text.length);
    try { return document.execCommand("copy"); } catch { return false; }
  }
  $("copy-button").addEventListener("click", async () => {
    if (kind === "count" && !M.valid(draft.stock[0])) {
      preview.close(); selectItem(0, "stock"); openEditor(); return;
    }
    const text = M.report(draft, kind);
    if (copyBusy || !text) return;
    copyBusy = true;
    const button = $("copy-button");
    button.disabled = true;
    button.textContent = "正在复制…";
    let copied = false;
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) { await navigator.clipboard.writeText(text); copied = true; }
    } catch {}
    if (!copied) copied = legacyCopy(text);
    copyBusy = false;
    button.disabled = false;
    button.textContent = copied ? "✓ 已复制，再次复制" : "重试复制";
    $("copy-status").textContent = copied ? "已复制到剪贴板，可以去粘贴了。" : "自动复制未成功，请手动复制上方文字。";
    if (copied) {
      const restoreFocus = !$("manual-copy").hidden;
      $("manual-copy").hidden = true;
      if (restoreFocus) button.focus({ preventScroll: true });
    } else $("manual-text").scrollIntoView({ block: "center" });
  });
  document.querySelectorAll("[data-key]").forEach(button => button.addEventListener("click", () => key(button.dataset.key)));
  $("previous-item").addEventListener("click", () => { if (index > 0) selectItem(index - 1); });
  $("next-item").addEventListener("click", nextItem);
  $("zero-value").addEventListener("click", () => { updateBuffer("0"); nextItem(); });
  $("order-unit").addEventListener("change", event => { draft.units[index] = event.target.value; save(); render(); });
  $("preview-button").addEventListener("click", () => {
    if (M.missing(draft).length) openPreview();
    else { selectItem(0, "stock"); openEditor(); }
  });
  $("overview-action").addEventListener("click", () => {
    const missing = M.missing(draft);
    if (!missing.length) openPreview();
    else { selectItem(missing[0], "stock"); openEditor(); }
  });
  $("close-entry").addEventListener("click", () => editor.close());
  editor.addEventListener("close", render);
  $("close-preview").addEventListener("click", () => preview.close());
  $("new-round").addEventListener("click", () => reset.showModal());
  $("cancel-reset").addEventListener("click", () => reset.close());
  $("confirm-reset").addEventListener("click", () => { draft = M.empty(kind); save(); reset.close(); selectItem(0, "stock"); });
  document.addEventListener("keydown", event => {
    if (!editor.open || preview.open || reset.open || event.metaKey || event.ctrlKey || event.altKey || event.target.matches("select, textarea")) return;
    if (/^\d$/.test(event.key) || event.key === "." || event.key === "Backspace") { event.preventDefault(); key(event.key === "Backspace" ? "backspace" : event.key); }
    if (event.key === "Enter" && event.target === quantity) { event.preventDefault(); nextItem(); }
  });

  const footer = document.querySelector(".overview-footer");
  new ResizeObserver(() => document.documentElement.style.setProperty("--footer-height", `${footer.getBoundingClientRect().height}px`)).observe(footer);
  render();
})();
