export const defaultAuto = () => ({enabled: true, maxDelay: 30, paused: '', ledger: {}, flight: null, last: ''});
export function autoState(value) { return {...defaultAuto(), ...value, ledger: {...value?.ledger}}; }
export function minimumElapsed(order, now) {
  if (Number.isInteger(order.elapsed)) return order.elapsed;
  if (Number.isSafeInteger(order.acceptedMinute) && order.acceptedMinute <= now && now - order.acceptedMinute < 86400000)
    return Math.max(0, Math.floor((now - order.acceptedMinute) / 1000) - 60);
  return null;
}
export function planAuto(state, platform, monitor, minutes, sender, now = Date.now(), random = Math.random) {
  if (state.flight && now - state.flight.at > 15000) {
    state.paused = '上次点击结果未确认，请检查商家订单后恢复'; state.flight = null;
  }
  if (!state.enabled || state.paused || state.flight || !monitor?.known) return null;
  // Keep attempted identities for 48 hours, including short Meituan numbers across midnight.
  for (const [id, entry] of Object.entries(state.ledger)) if (now - entry.at > 172800000) delete state.ledger[id];
  for (const order of monitor.baseline.orders) {
    const id = `${platform}:${order.key}`;
    const entry = state.ledger[id] ||= {at: now, delay: Math.floor(Math.min(0.999999, Math.max(0, random())) * (state.maxDelay + 1)), attempted: false};
    const elapsed = minimumElapsed(order, now);
    const anchor = Number.isInteger(order.elapsed) ? order.elapsedAt : order.remainingAt;
    if (entry.attempted || elapsed === null || !Number.isFinite(anchor) || now - anchor > 3000 || elapsed < minutes * 60 + entry.delay) continue;
    entry.attempted = true;
    state.flight = {id, key: order.key, label: order.label, platform, tabId: sender.tab.id, frameId: sender.frameId, token: crypto.randomUUID(), at: now, threshold: minutes * 60 + entry.delay, permitted: false};
    return {...state.flight};
  }
  return null;
}
