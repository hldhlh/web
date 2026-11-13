(() => {
  function duration(text) {
    const value = String(text || '').trim();
    let m = /^(\d{1,4}):([0-5]\d)(?!\d|:)/.exec(value);
    if (m) return {seconds: Number(m[1]) * 60 + Number(m[2]), length: m[0].length};
    m = /^(?:(\d{1,3})小时)?(?:(\d{1,4})分(?:钟)?)?(?:(\d{1,2})秒)?/.exec(value);
    if (!m || !m.slice(1).some(part => part !== undefined)) return null;
    return {seconds: Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0), length: m[0].length};
  }
  function after(text, pattern) {
    const match = pattern.exec(text);
    return match ? duration(text.slice(match.index + match[0].length))?.seconds ?? null : null;
  }
  function read(text) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    const elapsed = after(value, /(?:出餐用时|已用时|用时)\s*[:：]?\s*/);
    let limit = after(value, /(?:参考出餐时长|建议出餐时长|建议时长|出餐时长)\s*[:：]?\s*/);
    const pair = /(?:出餐用时|已用时|用时)\s*[:：]?\s*\d{1,4}:[0-5]\d\s*\/\s*(.*)/.exec(value);
    if (pair) limit = duration(pair[1])?.seconds ?? limit;
    let remaining = after(value, /(?:剩余出餐时间|出餐剩余|距出餐|剩余)\s*[:：]?\s*/);
    // Ele.me's suggestion is a decreasing countdown, not a fixed prep-time limit.
    const leading = duration(value);
    if (leading && /^内出餐/.test(value.slice(leading.length).trim())) remaining = leading.seconds;
    const suggested = /建议\s*(.+?)\s*内出餐/.exec(value);
    if (remaining === null && suggested) remaining = duration(suggested[1])?.seconds ?? null;
    const overdue = after(value, /(?:出餐超时|已超时|超时)\s*[:：]?\s*/);
    if (overdue !== null) remaining = -overdue;
    if (elapsed !== null) return {elapsed, remaining: remaining ?? (limit !== null ? limit - elapsed : null), limit, source: 'elapsed'};
    if (remaining !== null && limit !== null && limit - remaining >= 0) return {elapsed: limit - remaining, remaining, limit, source: 'countdown'};
    return {elapsed: null, remaining, limit, source: remaining !== null ? 'remaining' : 'unknown'};
  }
  function acceptedMinute(trace, footer, now = Date.now()) {
    const clock = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(trace || '').trim());
    const placed = /下单时间\s*[:：]?\s*(\d{2})-(\d{2})\s+([01]\d|2[0-3]):([0-5]\d)/.exec(String(footer || ''));
    if (!clock || !placed) return null;
    const year = Number(new Intl.DateTimeFormat('en-US', {timeZone: 'Asia/Shanghai', year: 'numeric'}).format(now));
    const candidates = [year - 1, year, year + 1].map(y => Date.parse(`${y}-${placed[1]}-${placed[2]}T${placed[3]}:${placed[4]}:00+08:00`)).filter(t => Number.isFinite(t) && t <= now && now - t < 172800000);
    if (candidates.length !== 1) return null;
    const placedAt = candidates[0];
    const delta = (Number(clock[1]) * 60 + Number(clock[2])) - (Number(placed[3]) * 60 + Number(placed[4]));
    const accepted = placedAt + (delta < 0 ? delta + 1440 : delta) * 60000;
    return accepted <= now && now - accepted < 86400000 ? accepted : null;
  }
  globalThis.MealTiming = {
    parse(text) { return /^(?:出餐用时|已用时|用时)/.test(String(text || '').trim()) ? read(text).elapsed : null; },
    read, acceptedMinute,
    order(key, label, text) { return {key: String(key || ''), label: String(label || ''), ...read(text)}; }
  };
})();
