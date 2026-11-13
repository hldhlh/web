(() => {
  // Runs in the extension's isolated world; re-injection replaces, never duplicates, a listener.
  if (typeof globalThis.__mealMonitorStop === 'function') globalThis.__mealMonitorStop();
  let timer, stopped = false;
  function collect() {
    const buttons = new Map(), completed = new Set();
    const tab = [...document.querySelectorAll('[role="tab"][id$="-tab-meal"]')].find(el => el.textContent.includes('待出餐'));
    let sample = null;
    if (tab) {
      const badge = tab.querySelector('sup');
      const value = badge?.getAttribute('title');
      const count = !badge ? 0 : /^\d+$/.test(value || '') ? Number(value) : null;
      if (count !== null) {
        const orders = [];
        const cards = new Set();
        for (const button of document.querySelectorAll('button')) {
          if (!['上报出餐', '优先出餐'].includes(button.textContent.trim()) || !button.getClientRects().length) continue;
          const card = button.closest('[class*="order-card__"]');
          if (!card || cards.has(card)) continue;
          cards.add(card);
          const labels = [...card.querySelectorAll('[class*="meal-info-time__"], [class*="meal"] [class*="time"], [class*="meal"] [class*="countdown"]')];
          const text = [...new Set(labels.map(node => node.textContent.trim()).filter(value => value.length < 200))].join(' ');
          const number = /^#\s*(\d+)/.exec(card.firstElementChild?.textContent.trim() || '')?.[1];
          const key = /^\d{10,24}$/.test(card.id) ? card.id : number;
          if (key) {
            const order = globalThis.MealTiming.order(key, number || key.slice(-6), text);
            if (order.elapsed === null) {
              const accepted = [...card.querySelectorAll('[class*="trace-list__"]')].find(row => row.textContent.includes('商家已接单'));
              order.acceptedMinute = globalThis.MealTiming.acceptedMinute(
                accepted?.querySelector('[class*="trace-time__"]')?.textContent,
                card.querySelector('[class*="footer__order"]')?.textContent
              );
            }
            orders.push(order);
            buttons.set(key, button);
          }
        }
        sample = {count, orders};
        // Only call a mismatch a platform sync delay when the whole ongoing list is visible
        // and every card is explicitly either pending or already prepared.
        const allTab = [...document.querySelectorAll('[role="tab"][id$="-tab-all"]')][0];
        const allCount = allTab?.querySelector('sup')?.getAttribute('title');
        const loaded = [...document.querySelectorAll('[class*="order-card__"][id]')].filter(c => /^\d{10,24}$/.test(c.id || '') && c.getClientRects().length);
        if (allTab?.getAttribute('aria-selected') === 'true' && /^\d+$/.test(allCount || '') && loaded.length === Number(allCount) && new Set(loaded.map(c => c.id)).size === loaded.length) {
          const completed = loaded.filter(c => !cards.has(c) && /已出餐/.test(c.querySelector('[class*="meal-complete-content-info"]')?.textContent || ''));
          if (cards.size + completed.length === loaded.length && [...cards].every(c => loaded.includes(c))) sample.inventory = {pending: cards.size, completed: completed.length, total: loaded.length};
        }
      }
    }
    for (const card of document.querySelectorAll('[class*="order-card__"][id]')) {
      if (/已出餐/.test(card.querySelector('[class*="meal-complete-content-info"]')?.textContent || '')) completed.add(card.id);
    }
    return {sample, buttons, completed};
  }
  function scan() {
    if (stopped) return;
    const {sample} = collect();
    globalThis.MealAuto.observe(sample);
    if (sample) sample.autoReady = globalThis.MealAuto.ready();
    try {
      chrome.runtime.sendMessage({type: 'sample', platform: 'eleme', sample}, response => {
        const error = chrome.runtime.lastError;
        if (error && /context invalidated/i.test(error.message || '')) stop();
        if (!error && !stopped) globalThis.MealAuto.execute(response?.command, collect, 'eleme');
      });
    } catch (error) { if (/context invalidated/i.test(error.message || '')) stop(); }
  }
  function schedule() { if (!timer && !stopped) timer = setTimeout(() => { timer = null; scan(); }, 300); }
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-selected', 'data-show']});
  const heartbeat = setInterval(scan, 1000);
  function stop() {
    stopped = true; observer.disconnect(); clearInterval(heartbeat); clearTimeout(timer);
    document.removeEventListener('visibilitychange', schedule);
    window.removeEventListener('online', schedule);
  }
  globalThis.__mealMonitorStop = stop;
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('online', schedule);
  scan();
})();
