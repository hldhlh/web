// 物语日历 · 无第三方库
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Supabase Configuration
  const SUPABASE_URL = 'https://fmxddvjgkykuqwmasigo.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteGRkdmpna3lrdXF3bWFzaWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwNDMzMjcsImV4cCI6MjA1OTYxOTMyN30.XCU4-03oajGh6M2-PNiBotCZSIDn_nJXkIC0Thjjfqo';
  const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // Elements
  const yearLabel = $('#yearLabel');
  const monthLabel = $('#monthLabel');
  const daysEl = $('#days');
  const prevBtn = $('#prevBtn');
  const nextBtn = $('#nextBtn');
  const todayBtn = $('#todayBtn');
  const themeToggle = $('#themeToggle');
  // Info card elements
  const todoCard = $('#todoCard');
  const todoTitle = $('#todoTitle');
  const todoDate = $('#todoDate');
  const holidayInfo = $('#holidayInfo');
  const todoStatus = $('#todoStatus');
  const todoInput = $('#todoInput');
  const todoAdd = $('#todoAdd');
  const todoList = $('#todoList');

  // State
  const today = stripTime(new Date());
  let view = { y: today.getFullYear(), m: today.getMonth() }; // m: 0-11
  let selected = new Date(today);

  // Localization
  const monthsCN = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const weekdayCN = ['一', '二', '三', '四', '五', '六', '日']; // Monday-first
  const weekdayFull = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  // Helpers
  function stripTime(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function isSameDate(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function isoDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

  // Holiday store: render verified local data immediately, then refresh from remote APIs.
  const holidayCache = new Map();
  const holidayRequests = new Map();
  const HOLIDAY_REQUEST_TIMEOUT = 4500;

  // 国务院办公厅《2026年部分节假日安排的通知》（国办发明电〔2025〕7号）
  const localHolidayData = {
    2026: {
      '2026-01-01': { name: '元旦', isHoliday: true },
      '2026-01-02': { name: '元旦', isHoliday: true },
      '2026-01-03': { name: '元旦', isHoliday: true },
      '2026-01-04': { name: '补班', isWorkday: true, note: '为元旦调休' },
      '2026-02-14': { name: '补班', isWorkday: true, note: '为春节调休' },
      '2026-02-15': { name: '春节', isHoliday: true },
      '2026-02-16': { name: '春节', isHoliday: true },
      '2026-02-17': { name: '春节', isHoliday: true },
      '2026-02-18': { name: '春节', isHoliday: true },
      '2026-02-19': { name: '春节', isHoliday: true },
      '2026-02-20': { name: '春节', isHoliday: true },
      '2026-02-21': { name: '春节', isHoliday: true },
      '2026-02-22': { name: '春节', isHoliday: true },
      '2026-02-23': { name: '春节', isHoliday: true },
      '2026-02-28': { name: '补班', isWorkday: true, note: '为春节调休' },
      '2026-04-04': { name: '清明节', isHoliday: true },
      '2026-04-05': { name: '清明节', isHoliday: true },
      '2026-04-06': { name: '清明节', isHoliday: true },
      '2026-05-01': { name: '劳动节', isHoliday: true },
      '2026-05-02': { name: '劳动节', isHoliday: true },
      '2026-05-03': { name: '劳动节', isHoliday: true },
      '2026-05-04': { name: '劳动节', isHoliday: true },
      '2026-05-05': { name: '劳动节', isHoliday: true },
      '2026-05-09': { name: '补班', isWorkday: true, note: '为劳动节调休' },
      '2026-06-19': { name: '端午节', isHoliday: true },
      '2026-06-20': { name: '端午节', isHoliday: true },
      '2026-06-21': { name: '端午节', isHoliday: true },
      '2026-09-20': { name: '补班', isWorkday: true, note: '为国庆节调休' },
      '2026-09-25': { name: '中秋节', isHoliday: true },
      '2026-09-26': { name: '中秋节', isHoliday: true },
      '2026-09-27': { name: '中秋节', isHoliday: true },
      '2026-10-01': { name: '国庆节', isHoliday: true },
      '2026-10-02': { name: '国庆节', isHoliday: true },
      '2026-10-03': { name: '国庆节', isHoliday: true },
      '2026-10-04': { name: '国庆节', isHoliday: true },
      '2026-10-05': { name: '国庆节', isHoliday: true },
      '2026-10-06': { name: '国庆节', isHoliday: true },
      '2026-10-07': { name: '国庆节', isHoliday: true },
      '2026-10-10': { name: '补班', isWorkday: true, note: '为国庆节调休' }
    }
  };

  function seedLocalHolidayYear(year) {
    if (holidayCache.has(year)) return holidayCache.get(year);
    const map = new Map();
    const source = localHolidayData[year] || {};
    Object.entries(source).forEach(([date, item]) => {
      map.set(date, {
        date,
        localName: item.name,
        name: item.name,
        isHoliday: !!item.isHoliday,
        isWorkday: !!item.isWorkday,
        source: 'local',
        note: item.note || ''
      });
    });
    holidayCache.set(year, map);
    return map;
  }

  async function fetchWithTimeout(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HOLIDAY_REQUEST_TIMEOUT);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchTimorYear(year) {
    const r = await fetchWithTimeout(`https://timor.tech/api/holiday/year/${year}`);
    if (!r.ok) throw new Error(`timor year ${r.status}`);
    const data = await r.json();
    const raw = data && data.holiday ? data.holiday : {};
    const map = new Map();
    Object.keys(raw).forEach(key => {
      const item = raw[key];
      if (!item || !item.date) return;
      map.set(item.date, {
        date: item.date,
        localName: item.name || '特殊日',
        name: item.name || 'Special Day',
        isHoliday: !!item.holiday,
        isWorkday: item.holiday === false && !!(item.after !== undefined || item.target),
        source: 'timor',
        note: item.target ? `${item.after ? '补班' : '调休'} · ${item.target}` : '',
      });
    });
    return map;
  }

  async function fetchNagerYear(year) {
    const r = await fetchWithTimeout(`https://date.nager.at/api/v3/PublicHolidays/${year}/CN`);
    if (!r.ok) throw new Error(`nager ${r.status}`);
    const list = await r.json();
    const map = new Map();
    (Array.isArray(list) ? list : []).forEach(item => {
      if (!item || !item.date) return;
      map.set(item.date, {
        date: item.date,
        localName: item.localName || item.name || '节假日',
        name: item.name || item.localName || 'Holiday',
        isHoliday: true,
        isWorkday: false,
        source: 'nager',
        note: '',
      });
    });
    return map;
  }

  async function ensureHolidayYear(year) {
    if (holidayRequests.has(year)) return holidayRequests.get(year);
    const merged = seedLocalHolidayYear(year);
    const promise = (async () => {
      const [timorResult, nagerResult] = await Promise.allSettled([
        fetchTimorYear(year),
        fetchNagerYear(year)
      ]);

      // Nager only provides public holidays, so it fills gaps without replacing
      // the verified local adjusted-workday data.
      if (nagerResult.status === 'fulfilled') {
        nagerResult.value.forEach((value, key) => {
          if (!merged.has(key)) merged.set(key, value);
        });
      } else {
        console.warn('Nager year fetch failed:', nagerResult.reason);
      }

      // Timor includes adjusted working days and fills dates not covered by the
      // verified local schedule. Official local dates remain authoritative.
      if (timorResult.status === 'fulfilled') {
        timorResult.value.forEach((value, key) => {
          if (!merged.has(key) || merged.get(key).source !== 'local') {
            merged.set(key, value);
          }
        });
      } else {
        console.warn('Timor year fetch failed:', timorResult.reason);
      }

      return merged;
    })().catch(err => {
      console.warn('Holiday aggregate failed:', err);
      return merged;
    });
    holidayRequests.set(year, promise);
    return promise;
  }

  function getHolidayForDate(d) {
    const maybe = holidayCache.get(d.getFullYear());
    if (!maybe) return null;
    return maybe.get(isoDate(d)) || null;
  }

  // Todo store (Using Supabase)
  let todos = {};
  const TODO_KEY = 'wy-calendar-todos';

  async function fetchTodos() {
    const { data, error } = await _supabase
      .from('calendar_events')
      .select('*')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }); // Use ID as a stable tie-breaker

    if (error) {
      console.error('Fetch error:', error);
      return;
    }

    const newTodos = {};
    data.forEach(item => {
      const k = item.date;
      if (!newTodos[k]) newTodos[k] = [];
      newTodos[k].push({ id: item.id, text: item.text, done: item.done });
    });
    todos = newTodos;
    render();
  }

  // Set up Realtime
  _supabase
    .channel('calendar_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, payload => {
      fetchTodos();
    })
    .subscribe();

  async function migrateLocalData() {
    const local = localStorage.getItem(TODO_KEY);
    if (!local) return;
    try {
      const parsed = JSON.parse(local);
      const toInsert = [];
      for (const date of Object.keys(parsed)) {
        const items = Array.isArray(parsed[date]) ? parsed[date] : (parsed[date] === true ? [] : []);
        items.forEach(it => {
          toInsert.push({ date: date, text: it.text || '任务', done: !!it.done });
        });
      }
      if (toInsert.length > 0) {
        console.log('Migrating local data to Supabase...', toInsert.length);
        await _supabase.from('calendar_events').insert(toInsert);
      }
      localStorage.removeItem(TODO_KEY);
      await fetchTodos();
    } catch (e) {
      console.error('Migration failed:', e);
    }
  }

  function dayData(key) { return todos[key]; }
  function hasTodo(d) {
    const v = dayData(isoDate(d));
    return Array.isArray(v) && v.length > 0;
  }
  function listTodos(d) {
    const v = dayData(isoDate(d));
    return Array.isArray(v) ? v : [];
  }

  async function addTodo(d, text) {
    const k = isoDate(d);
    const { error } = await _supabase
      .from('calendar_events')
      .insert([{ date: k, text: text.trim(), done: false }]);

    if (error) console.error('Add error:', error);
    // Realtime will trigger refetch
  }

  async function toggleDone(d, id) {
    const arr = listTodos(d);
    const it = arr.find(x => x.id === id);
    if (!it) return;

    const { error } = await _supabase
      .from('calendar_events')
      .update({ done: !it.done })
      .eq('id', id);

    if (error) console.error('Toggle error:', error);
  }

  async function deleteTodo(d, id) {
    const { error } = await _supabase
      .from('calendar_events')
      .delete()
      .eq('id', id);

    if (error) console.error('Delete error:', error);
  }

  async function clearTodos(d) {
    const k = isoDate(d);
    const { error } = await _supabase
      .from('calendar_events')
      .delete()
      .eq('date', k);

    if (error) console.error('Clear error:', error);
  }

  function monthInfo(year, month) {
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    // JS: 0=Sun..6=Sat -> Monday-first index 0..6
    const jsFirst = first.getDay();
    const offset = (jsFirst + 6) % 7; // 0 when Monday
    return { offset, daysInMonth, daysInPrev };
  }

  function setHeader(y, m) {
    yearLabel.textContent = `${y}`;
    monthLabel.textContent = monthsCN[m];
  }

  function holidayLabelText(date) {
    const holiday = getHolidayForDate(date);
    if (!holiday) return '';
    if (holiday.isWorkday) return holiday.localName || '补班';
    return holiday.localName || holiday.name || '节假日';
  }

  function buildGrid(y, m) {
    const { offset, daysInMonth, daysInPrev } = monthInfo(y, m);
    daysEl.innerHTML = '';

    const frag = document.createDocumentFragment();

    // Previous month padding
    const prev = shiftMonth(y, m, -1);
    for (let i = 0; i < offset; i++) {
      const dayNum = daysInPrev - offset + 1 + i;
      const d = new Date(prev.y, prev.m, dayNum);
      frag.appendChild(dayButton(d, { muted: true, col: i % 7 }));
    }

    // Current month
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      const idx = (offset + (day - 1)) % 7;
      frag.appendChild(dayButton(d, { col: idx }));
    }

    // Next month padding to 6 weeks (42 cells)
    const total = offset + daysInMonth;
    const padTail = 42 - total;
    const next = shiftMonth(y, m, 1);
    for (let i = 1; i <= padTail; i++) {
      const d = new Date(next.y, next.m, i);
      const idx = (total + (i - 1)) % 7;
      frag.appendChild(dayButton(d, { muted: true, col: idx }));
    }

    daysEl.appendChild(frag);
  }

  function dayButton(date, opts = {}) {
    const { muted = false, col = 0 } = opts;
    const btn = document.createElement('button');
    btn.className = 'day';
    if (muted) btn.classList.add('muted');
    if (col === 5 || col === 6) btn.classList.add('weekend');

    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(date.getDate());
    btn.appendChild(num);

    const holidayText = holidayLabelText(date);
    if (holidayText) {
      const holiday = getHolidayForDate(date);
      if (holiday && holiday.isWorkday) {
        btn.classList.add('workday');
      } else {
        btn.classList.add('holiday');
      }
      const label = document.createElement('span');
      label.className = 'holiday-label';
      label.textContent = holidayText;
      btn.appendChild(label);
    }

    if (isSameDate(date, today)) btn.classList.add('today');
    const isSelected = isSameDate(date, selected);
    if (isSelected) btn.classList.add('selected');

    if (hasTodo(date)) {
      const dot = document.createElement('i');
      const arr = listTodos(date);
      const allDone = Array.isArray(arr) && arr.length > 0 && arr.every(x => x.done);
      dot.className = 'todo-dot' + (allDone ? ' done' : '');
      dot.title = allDone ? '全部完成' : '有代办';
      btn.appendChild(dot);
    }

    btn.dataset.date = isoDate(date);
    btn.setAttribute('role', 'gridcell');
    btn.setAttribute('aria-selected', String(isSelected));
    const wIndex = (date.getDay() + 6) % 7;
    btn.title = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weekdayFull[wIndex]}`;
    btn.setAttribute('aria-label', btn.title);

    btn.addEventListener('click', () => {
      // If clicked day is outside current view, navigate to its month
      const outside = date.getMonth() !== view.m || date.getFullYear() !== view.y;
      selected = stripTime(date);
      if (outside) {
        view = { y: selected.getFullYear(), m: selected.getMonth() };
      }
      render();
    });

    return btn;
  }

  function shiftMonth(y, m, delta) {
    const d = new Date(y, m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  }

  function render() {
    // Seed verified local dates before building the grid so holiday labels are
    // visible on the very first paint, even when external APIs are unavailable.
    seedLocalHolidayYear(view.y);
    setHeader(view.y, view.m);
    buildGrid(view.y, view.m);
    updateTodoCard();
    if (!holidayRequests.has(view.y)) {
      const requestedYear = view.y;
      ensureHolidayYear(requestedYear).then(() => {
        if (view.y === requestedYear) render();
      });
    }
  }

  // Navigation
  prevBtn.addEventListener('click', () => { view = shiftMonth(view.y, view.m, -1); render(); });
  nextBtn.addEventListener('click', () => { view = shiftMonth(view.y, view.m, 1); render(); });
  todayBtn.addEventListener('click', () => { view = { y: today.getFullYear(), m: today.getMonth() }; selected = new Date(today); render(); });

  // Keyboard: left/right change day; PgUp/PgDn change month; Home/End jump to first/last day of month
  document.addEventListener('keydown', (e) => {
    const key = e.key;
    const dir = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (key in dir) {
      e.preventDefault();
      const next = new Date(selected);
      next.setDate(next.getDate() + dir[key]);
      selected = stripTime(next);
      view = { y: selected.getFullYear(), m: selected.getMonth() };
      render();
      return;
    }
    if (key === 'PageUp' || (e.ctrlKey && key === 'ArrowUp')) {
      e.preventDefault(); view = shiftMonth(view.y, view.m, -1); render();
    } else if (key === 'PageDown' || (e.ctrlKey && key === 'ArrowDown')) {
      e.preventDefault(); view = shiftMonth(view.y, view.m, 1); render();
    } else if (key === 'Home') {
      e.preventDefault(); selected = new Date(view.y, view.m, 1); render();
    } else if (key === 'End') {
      e.preventDefault(); selected = new Date(view.y, view.m + 1, 0); render();
    } else if (key === 't' || key === 'T') {
      // quick jump
      view = { y: today.getFullYear(), m: today.getMonth() }; selected = new Date(today); render();
    }
  });

  // Theme toggle
  const THEME_KEY = 'wy-calendar-theme';
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'dark' || theme === 'light') root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');

    const isDark = theme === 'dark' || (theme !== 'light' && systemTheme.matches);
    const target = isDark ? '浅色' : '深色';
    themeToggle.textContent = isDark ? '☀︎' : '☾';
    themeToggle.setAttribute('aria-label', `切换到${target}主题`);
    themeToggle.title = `切换到${target}主题`;
    themeToggle.setAttribute('aria-pressed', String(isDark));
  }
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    applyTheme(saved || 'auto');
  }

  themeToggle.addEventListener('click', () => {
    const root = document.documentElement;
    const selected = root.getAttribute('data-theme');
    const isDark = selected ? selected === 'dark' : systemTheme.matches;
    const next = isDark ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });

  systemTheme.addEventListener?.('change', () => {
    if (!localStorage.getItem(THEME_KEY)) applyTheme('auto');
  });

  // Init
  initTheme();
  render();
  fetchTodos();
  migrateLocalData();

  // Info card logic
  function weekdayName(d) {
    const idx = (d.getDay() + 6) % 7; // Monday-first
    return weekdayFull[idx];
  }
  function updateTodoCard() {
    const isToday = isSameDate(selected, today);
    todoTitle.textContent = isToday ? '今天' : '所选日期';
    todoDate.textContent = `${selected.getFullYear()}年${selected.getMonth() + 1}月${selected.getDate()}日 · ${weekdayName(selected)}`;
    const holiday = getHolidayForDate(selected);
    if (holidayInfo) {
      const parts = [];
      if (holiday) {
        if (holiday.isWorkday) {
          holidayInfo.dataset.kind = 'workday';
          parts.push(`${holiday.localName || '补班'} · 上班`);
        } else {
          holidayInfo.dataset.kind = 'holiday';
          parts.push(`${holiday.localName || holiday.name || '节假日'} · 放假`);
        }
      } else if (selected.getDay() === 0 || selected.getDay() === 6) {
        holidayInfo.dataset.kind = 'weekend';
        parts.push('周末 · 休息日');
      } else {
        holidayInfo.dataset.kind = 'normal';
        parts.push('普通工作日');
      }
      holidayInfo.textContent = parts.join(' · ');
    }
    const arr = listTodos(selected);
    const total = arr.length;
    const done = arr.filter(x => x.done).length;
    const undone = total - done;
    todoStatus.textContent = total
      ? (undone ? `${undone} 项待办` : `${total} 项已完成`)
      : '无事项';

    // Build list UI
    todoList.innerHTML = '';
    for (const item of arr) {
      const li = document.createElement('li');
      li.className = 'todo-item' + (item.done ? ' done' : '');
      li.dataset.id = item.id;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!item.done;
      cb.setAttribute('aria-label', '完成');

      const text = document.createElement('div');
      text.className = 'todo-text';
      text.textContent = item.text;

      const del = document.createElement('button');
      del.className = 'todo-del';
      del.textContent = '×';
      del.title = '删除';

      li.appendChild(cb);
      li.appendChild(text);
      li.appendChild(del);
      todoList.appendChild(li);
    }

    // No explicit clear-all button to keep minimal
  }
  todoAdd.addEventListener('click', () => {
    const val = (todoInput.value || '').trim();
    if (!val) { todoInput.focus(); return; }
    addTodo(selected, val);
    todoInput.value = '';
    render();
  });
  todoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); todoAdd.click(); }
  });
  // Delegation for list actions
  todoList.addEventListener('change', (e) => {
    const cb = e.target;
    if (cb && cb.matches('input[type="checkbox"]')) {
      const li = cb.closest('.todo-item');
      if (!li) return;
      toggleDone(selected, li.dataset.id);
      render();
    }
  });
  todoList.addEventListener('click', (e) => {
    const btn = e.target;
    if (btn && btn.matches('.todo-del')) {
      const li = btn.closest('.todo-item');
      if (!li) return;
      deleteTodo(selected, li.dataset.id);
      render();
    }
  });

})();
