(() => {
  "use strict";
  const key = (node) => node.nodeType === 1
    ? node.id || node.getAttribute("data-sync-key") || node.getAttribute("data-date") || ""
    : "";

  // Patch data in place; retain disclosure state, focus and live controls.
  function patch(current, next) {
    if (current.isEqualNode(next)) return;
    if (current.nodeType !== 1) { current.nodeValue = next.nodeValue; return; }
    if (current.matches("input,textarea,select,video,audio,iframe,[contenteditable=true]")) return;
    for (const attr of Array.from(current.attributes)) {
      if (current.tagName === "DETAILS" && attr.name === "open") continue;
      if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
    }
    for (const attr of next.attributes) current.setAttribute(attr.name, attr.value);
    reconcile(current, next);
  }

  function reconcile(parent, desired) {
    const old = Array.from(parent.childNodes);
    const keyed = new Map(old.filter(key).map(node => [key(node), node]));
    const retained = new Set();
    let cursor = parent.firstChild;
    for (const next of Array.from(desired.childNodes)) {
      const id = key(next);
      let current = id ? keyed.get(id) : cursor;
      if (!current || retained.has(current) || key(current) !== id || current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) current = next.cloneNode(true);
      else patch(current, next);
      if (current !== cursor) parent.insertBefore(current, cursor);
      retained.add(current);
      cursor = current.nextSibling;
    }
    for (const node of old) if (!retained.has(node)) node.remove();
  }

  function preserveScroll(root, update) {
    const candidates = root.querySelectorAll("[data-sync-key],[data-date],.lesson-card,.card");
    const anchor = Array.from(candidates).find(node => node.getBoundingClientRect().bottom > 0);
    const top = anchor?.getBoundingClientRect().top;
    const x = window.scrollX, y = window.scrollY;
    update();
    if (anchor?.isConnected) window.scrollBy({ top: anchor.getBoundingClientRect().top - top, behavior: "instant" });
    else window.scrollTo({ left: x, top: y, behavior: "instant" });
  }

  function html(root, value) {
    const template = document.createElement("template");
    template.innerHTML = value;
    preserveScroll(root, () => reconcile(root, template.content));
  }
  window.AcademyStableView = { html, preserveScroll };
})();
