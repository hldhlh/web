(() => {
  if (typeof globalThis.__meituanMonitorStop === 'function') globalThis.__meituanMonitorStop();
  let timer, stopped = false;
  function collect() {
    const buttons = new Map(), completed = new Set();
    // Read only the verified order-filter labels, not customer/order card text.
    const labels = [...document.querySelectorAll('.newUnprocessedSecondTabsAncher button .roo-badge-wrap > span')];
    const pending = labels.filter(el => /^待出餐(?:\s|$)/.test(el.textContent.trim()));
    const match = pending.length === 1 ? /^待出餐\s+(\d+)$/.exec(pending[0].textContent.trim()) : null;
    const orders = [];
    const seen = new Set();
    for (const card of document.querySelectorAll('[class*="pre-meal-card_"], [class*="order-card_"]')) {
      if (!card.getClientRects().length) continue;
      const action = card.querySelector('[class*="submit-button_"]');
      if (action?.textContent.trim() !== '出餐完成') continue;
      const label = card.querySelector('[class*="time-title_"]');
      const number = card.querySelector('[class*="orderNo_"], [class*="num_"] > span')?.textContent.trim();
      if (!/^\d{1,6}$/.test(number || '') || seen.has(number)) continue;
      seen.add(number);
      const key = /订单编号[：:]\s*(\d{10,24})/.exec(card.querySelector('[class*="orderBasicInfo_"]')?.textContent || '')?.[1] || number;
      buttons.set(key, action);
      const limit = card.querySelector('[class*="limited-time"], [class*="reference-time"]')?.textContent || '';
      orders.push(globalThis.MealTiming.order(key, number, `${label?.parentElement?.textContent || ''} ${limit}`));
    }
    const sample = match ? {count: Number(match[1]), orders} : null;
    for (const card of document.querySelectorAll('[class*="order-card_"]')) {
      if (!/已出餐/.test(card.querySelector('[class*="status-title_"]')?.textContent || '')) continue;
      const number = card.querySelector('[class*="orderNo_"]')?.textContent.trim();
      const key = /订单编号[：:]\s*(\d{10,24})/.exec(card.querySelector('[class*="orderBasicInfo_"]')?.textContent || '')?.[1] || number;
      if (key) completed.add(key);
      if (number) completed.add(number);
    }
    return {sample, buttons, completed};
  }
  function scan() {
    if (stopped) return;
    const {sample} = collect();
    globalThis.MealAuto.observe(sample);
    if (sample) sample.autoReady = globalThis.MealAuto.ready();
    try {
      chrome.runtime.sendMessage({type: 'sample', platform: 'meituan', sample}, response => {
        const error = chrome.runtime.lastError;
        if (error && /context invalidated/i.test(error.message || '')) stop();
        if (!error && !stopped) globalThis.MealAuto.execute(response?.command, collect, 'meituan');
      });
    } catch (error) { if (/context invalidated/i.test(error.message || '')) stop(); }
  }
  function schedule() { if (!timer && !stopped) timer = setTimeout(() => { timer = null; scan(); }, 300); }
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true});
  const heartbeat = setInterval(scan, 1000);
  function stop() {
    stopped = true; observer.disconnect(); clearInterval(heartbeat); clearTimeout(timer);
    document.removeEventListener('visibilitychange', schedule);
    window.removeEventListener('online', schedule);
  }
  globalThis.__meituanMonitorStop = stop;
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('online', schedule);
  scan();
})();
