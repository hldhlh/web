window.AcademyDailyStatus = (() => {
  const FILE = 'academy/daily-status.json';
  const CACHE = 'academy-daily-status-v1';
  const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const Auth = window.AcademyAuth;
  let data = normalize(null), channel, timer, pending;
  let draft = null;
  const escape = (text) => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function day(now = new Date()) {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const weekday = new Date(`${date}T12:00:00+08:00`).getUTCDay();
    return { date, index: (weekday + 6) % 7 };
  }
  function normalize(raw) {
    return { weekly: DAYS.map((_, i) => String(raw?.weekly?.[i] || '').slice(0, 500)),
      today: { date: String(raw?.today?.date || ''), text: String(raw?.today?.text || '').slice(0, 500) },
      rev: Number(raw?.rev) || 0 };
  }
  function current(value = data, now = new Date()) {
    const d = day(now);
    const temporary = value.today.date === d.date && Boolean(value.today.text.trim());
    return { ...d, temporary, text: temporary ? value.today.text : value.weekly[d.index] };
  }
  try { data = normalize(JSON.parse(localStorage.getItem(CACHE))); } catch (_) {}
  function paintHome() {
    const host = document.getElementById('home-daily-status');
    if (!host || !Auth.session) return;
    const status = current();
    host.hidden = !status.text;
    host.innerHTML = `<span class="daily-status-label">${status.temporary ? '今日安排' : `${DAYS[status.index]}固定安排`}</span><p>${escape(status.text)}</p>`;
  }
  async function pull() {
    if (pending) return pending;
    pending = (async () => {
      const raw = await window.AcademyStore.getJSON(FILE);
      const next = normalize(raw);
      if (next.rev >= data.rev || !raw) data = next;
      try { localStorage.setItem(CACHE, JSON.stringify(data)); } catch (_) {}
      paintHome();
    })().finally(() => { pending = null; });
    return pending;
  }
  function connect() {
    if (!channel) channel = window.AcademyStore.channel('academy-daily-status-live', { 'status-version': () => pull().catch(() => {}) });
    if (!timer) {
      pull().catch(() => {});
      timer = setInterval(() => {
        if (!Auth.session || document.hidden) return;
        paintHome();
        pull().catch(() => {});
      }, 30000);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && Auth.session) { paintHome(); pull().catch(() => {}); }
      });
    }
    paintHome();
  }
  function editorHTML() {
    return '<div id="daily-status-editor"><p role="status">正在读取今日状态设置…</p></div>';
  }
  async function mountEditor() {
    const host = document.getElementById('daily-status-editor');
    if (!host || !Auth.isManager(Auth.session)) return;
    connect();
    try {
      await pull();
      if (!host.isConnected || !Auth.isManager(Auth.session)) return;
      if (!draft) draft = { ...normalize(data), date: day().date };
      drawEditor(host);
    } catch (_) {
      if (!host.isConnected) return;
      host.innerHTML = '<p role="alert">无法读取最新设置，请检查网络后重试。</p><button type="button" class="ghost">重新加载</button>';
      host.querySelector('button').onclick = mountEditor;
    }
  }
  function drawEditor(host) {
    const baseline = normalize(data);
    const date = draft.date;
    const text = draft.today.date === date ? draft.today.text : '';
    host.innerHTML = `<form class="daily-status-form">
      <section class="daily-status-section">
        <h3>仅今天生效</h3><p class="muted">${escape(date)} · 临时内容优先显示；留空则使用每周固定内容，明天自动恢复。</p>
        <label for="daily-status-today">今日安排</label>
        <textarea id="daily-status-today" name="today" maxlength="500" rows="3" placeholder="例如：今天到店送酸梅汤，每桌一壶">${escape(text)}</textarea>
      </section>
      <section class="daily-status-section">
        <h3>每周固定内容</h3><p class="muted">按周一到周日自动切换，可填写赠品、活动或门店提醒。留空的日期不显示额外内容。</p>
        <div class="daily-status-week">${DAYS.map((label, i) => `<label for="daily-status-${i}">${label}<textarea id="daily-status-${i}" name="day${i}" maxlength="500" rows="2" placeholder="${label}的固定安排">${escape(draft.weekly[i])}</textarea></label>`).join('')}</div>
      </section>
      <div class="daily-status-preview"><strong>首页今日展示</strong><p id="daily-status-preview-text"></p></div>
      <p role="status" aria-live="polite" id="daily-status-message"></p>
      <div class="actions"><button class="primary" type="submit">保存设置</button><button class="ghost" type="button" id="daily-status-reset">放弃修改</button></div>
    </form>`;
    const form = host.querySelector('form');
    const read = () => {
      const values = new FormData(form);
      draft = { date, weekly: DAYS.map((_, i) => String(values.get(`day${i}`) || '')), today: { date, text: String(values.get('today') || '') } };
      host.querySelector('#daily-status-preview-text').textContent = current(draft).text || '当天未设置额外内容，保留问候语、日期和休息安排。';
    };
    form.addEventListener('input', read);
    read();
    host.querySelector('#daily-status-reset').onclick = () => { draft = null; mountEditor(); };
    form.onsubmit = async event => {
      event.preventDefault();
      const message = host.querySelector('#daily-status-message');
      if (!Auth.isManager(Auth.session)) { message.textContent = '只有店长可以保存设置。'; return; }
      if (date !== day().date) { message.textContent = '日期已变化，请重新打开今日状态设置。'; draft = null; return; }
      read();
      const changes = normalize(draft);
      const userId = Auth.session.id;
      form.querySelectorAll('button,textarea').forEach(el => { el.disabled = true; });
      message.textContent = '正在保存…';
      try {
        const latest = normalize(await window.AcademyStore.getJSON(FILE));
        if (!Auth.isManager(Auth.session) || Auth.session.id !== userId) throw new Error('账号已变化，请重新登录后保存。');
        if (date !== day().date) throw new Error('日期已变化，请重新打开今日状态设置。');
        // Merge only edited fields so unrelated weekly changes from another manager survive.
        latest.weekly = latest.weekly.map((value, i) => changes.weekly[i] !== baseline.weekly[i] ? changes.weekly[i].trim() : value);
        const oldToday = baseline.today.date === date ? baseline.today.text : '';
        if (changes.today.text !== oldToday) latest.today = { date, text: changes.today.text.trim() };
        latest.rev = Math.max(Date.now(), latest.rev + 1);
        await window.AcademyStore.putJSON(FILE, latest);
        data = latest;
          draft = null;
        try { localStorage.setItem(CACHE, JSON.stringify(data)); } catch (_) {}
        channel?.send({ type: 'broadcast', event: 'status-version', payload: { rev: latest.rev } }).catch(() => {});
        paintHome();
        if (host.isConnected) {
          draft = { ...normalize(data), date: day().date };
          drawEditor(host);
          host.querySelector('#daily-status-message').textContent = '已保存，首页今日状态已更新。';
        }
      } catch (error) {
        message.textContent = `保存失败，修改已保留。${error.message || '请检查网络后重试。'}`;
      } finally {
        form.querySelectorAll('button,textarea').forEach(el => { el.disabled = false; });
      }
    };
  }
  Auth.onChange(() => { draft = null; paintHome(); });
  return { connect, editorHTML, mountEditor };
})();
