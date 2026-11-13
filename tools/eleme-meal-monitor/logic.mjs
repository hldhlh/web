export const TARGET = 'https://melody.shop.ele.me/app/shop/536928771/order__processing#app.shop.order.processing';
export const STALE_MS = 60000;
export const PLATFORMS = {
  eleme: {name: '饿了么', target: TARGET, match: 'https://melody.shop.ele.me/*', files: ['timing.js', 'auto-click.js', 'content.js']},
  meituan: {name: '美团外卖', target: 'https://waimaie.meituan.com/#/new_fe/orderbusiness#/order/unprocessed', match: 'https://waimaie.meituan.com/*', files: ['timing.js', 'auto-click.js', 'meituan.js']}
};
export function isMeituanTarget(url) {
  try {
    const u = new URL(url);
    return u.origin === 'https://waimaie.meituan.com' &&
      ((u.pathname === '/' && /^#\/new_fe\/orderbusiness#\/order\/unprocessed(?:\?|$)/.test(u.hash)) ||
       (u.pathname === '/new_fe/orderbusiness' && /^#\/order\/unprocessed(?:\?|$)/.test(u.hash)));
  } catch { return false; }
}
export function matchesTarget(platform, url) { return platform === 'eleme' ? isTarget(url) : platform === 'meituan' && isMeituanTarget(url); }
export function matchesFrame(platform, url) {
  if (platform === 'eleme') return validFrame(url);
  try { const u = new URL(url); return platform === 'meituan' && isMeituanTarget(url) && u.pathname === '/new_fe/orderbusiness'; } catch { return false; }
}
export function healthy(monitor, now = Date.now()) { return Boolean(monitor?.known && monitor.baseline && now - monitor.at < STALE_MS); }
export function overview(monitors, now = Date.now()) {
  const connected = Object.keys(PLATFORMS).filter(key => healthy(monitors[key], now));
  return {connected: connected.length, total: connected.reduce((sum, key) => sum + monitors[key].baseline.count, 0)};
}
export function acceptSample(monitors, platform, tabId, sample, now = Date.now()) {
  const previous = monitors[platform];
  if (previous?.known && previous.tabId !== tabId && now - previous.at < STALE_MS) return null;
  const clean = sanitize(sample);
  if (clean) {
    const oldOrders = new Map((previous?.baseline?.orders || []).map(order => [order.key, order]));
    const continuous = previous?.known && previous.tabId === tabId && now >= previous.at && now - previous.at < STALE_MS;
    for (const order of clean.orders) {
      const old = continuous ? oldOrders.get(order.key) : null;
      // An unchanged DOM label is not a new clock sample. Keep the original anchor.
      order.elapsedAt = old && old.elapsed === order.elapsed && Number.isFinite(old.elapsedAt) ? old.elapsedAt : now;
      order.remainingAt = old && old.remaining === order.remaining && Number.isFinite(old.remainingAt) ? old.remainingAt : now;
    }
  }
  const baseline = clean || previous?.baseline;
  const inventory = clean?.inventory;
  const mismatch = inventory && inventory.pending < clean.count;
  const sameEvidence = previous?.tabId === tabId && previous?.baseline?.count === clean?.count && JSON.stringify(previous?.baseline?.inventory) === JSON.stringify(inventory) && now - previous.at < STALE_MS;
  const mismatchSince = mismatch ? sameEvidence && Number.isFinite(previous.mismatchSince) ? previous.mismatchSince : now : null;
  const syncGap = mismatch && now - mismatchSince >= 3000 ? clean.count - inventory.pending : 0;
  return {monitor: {tabId, at: now, known: Boolean(clean), baseline, mismatchSince, syncGap}};
}
export function isTarget(url) {
  try { const u = new URL(url); return u.origin === 'https://melody.shop.ele.me' && /^\/app\/shop\/536928771\/order__processing\/?$/.test(u.pathname); } catch { return false; }
}
export function validFrame(url) {
  try { const u = new URL(url); return u.origin === 'https://napos-order-pc.faas.ele.me' && u.pathname.startsWith('/app/processing/'); } catch { return false; }
}
export function sanitize(sample) {
  if (!sample || !Number.isInteger(sample.count) || sample.count < 0 || sample.count > 100000) return null;
  const orders = [];
  const seen = new Set();
  for (const order of Array.isArray(sample.orders) ? sample.orders.slice(0, 1000) : []) {
    if (!order || !/^\d{1,24}$/.test(order.key || '') || !/^\d{1,6}$/.test(order.label || '') || seen.has(order.key)) continue;
    seen.add(order.key);
    const elapsed = Number.isInteger(order.elapsed) && order.elapsed >= 0 && order.elapsed <= 86400 ? order.elapsed : null;
    const remaining = Number.isInteger(order.remaining) && Math.abs(order.remaining) <= 86400 ? order.remaining : null;
    const acceptedMinute = Number.isSafeInteger(order.acceptedMinute) && order.acceptedMinute > 0 ? order.acceptedMinute : null;
    orders.push({key: order.key, label: order.label, elapsed, remaining, acceptedMinute, source: ['elapsed', 'countdown', 'remaining'].includes(order.source) ? order.source : 'unknown'});
  }
  const result = {count: sample.count, orders: sample.count ? orders : []};
  const i = sample.inventory;
  if (i && [i.pending,i.completed,i.total].every(n => Number.isInteger(n) && n >= 0 && n <= 100000) && i.pending + i.completed === i.total && i.pending >= result.orders.length && i.completed >= sample.count - i.pending) result.inventory = {pending:i.pending, completed:i.completed, total:i.total};
  return result;
}

export const DEFAULT_PREP_MINUTES = 15;
export function validPrepMinutes(value) { return Number.isInteger(value) && value >= 1 && value <= 180; }
export function timingStatus(monitor, minutes, now = Date.now()) {
  if (!healthy(monitor, now)) return {known: false, complete: false, measured: 0, elapsedMeasured: 0, overdue: 0, uncertain: 0, bounded: 0, syncGap: 0, missing: 0, longest: null, orders: []};
  const target = minutes * 60;
  const orders = (monitor.baseline.orders || []).map(order => {
    const age = at => Math.max(0, Math.floor((now - (Number.isFinite(at) ? at : monitor.at)) / 1000));
    const elapsedAge = age(order.elapsedAt), remainingAge = age(order.remainingAt);
    const hasElapsed = Number.isInteger(order.elapsed);
    const hasRemaining = Number.isInteger(order.remaining);
    const clockAge = hasElapsed ? elapsedAge : hasRemaining ? remainingAge : 0;
    const clockStalled = clockAge >= 60;
    const extrapolated = clockAge >= 10;
    const elapsedSeconds = hasElapsed ? order.elapsed + Math.min(elapsedAge, 60) : null;
    const platformRemaining = hasRemaining ? order.remaining - Math.min(remainingAge, 60) : null;
    const validMinute = Number.isSafeInteger(order.acceptedMinute) && order.acceptedMinute <= now && now - order.acceptedMinute < 86400000;
    const upper = validMinute ? Math.floor((now - order.acceptedMinute) / 1000) : null;
    const range = !hasElapsed && upper !== null ? {min: Math.max(0, upper - 60), max: upper} : null;
    const lower = elapsedSeconds ?? range?.min;
    const higher = elapsedSeconds ?? range?.max;
    const judgment = clockStalled || lower == null ? 'unknown' : lower >= target ? 'overdue' : higher < target ? 'within' : 'boundary';
    return {label: order.label, elapsed: elapsedSeconds, elapsedRange: range, judgment, platformRemaining, extrapolated, clockStalled, targetRemaining: elapsedSeconds === null ? null : target - elapsedSeconds, source: range ? 'accepted-minute' : order.source};
  });
  const elapsed = orders.map(o => o.elapsed).filter(Number.isInteger);
  const measured = orders.filter(order => order.elapsed !== null || order.elapsedRange || order.platformRemaining !== null).length;
  const syncGap = monitor.syncGap || 0;
  const missing = Math.max(0, monitor.baseline.count - measured - syncGap);
  return {known: true, syncGap, missing, complete: orders.length === monitor.baseline.count && measured === monitor.baseline.count, measured, elapsedMeasured: orders.filter(o => ['within', 'overdue'].includes(o.judgment)).length, overdue: orders.filter(o => o.judgment === 'overdue').length, uncertain: orders.filter(o => o.judgment === 'boundary').length, bounded: orders.filter(o => o.elapsedRange).length, longest: elapsed.length ? Math.max(...elapsed) : null, orders};
}
