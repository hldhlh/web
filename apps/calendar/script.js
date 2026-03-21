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
  // Timeline elements (read-only)
  const tlList = $('#tlList');
  // Info card elements
  const todoCard = $('#todoCard');
  const todoTitle = $('#todoTitle');
  const todoDate = $('#todoDate');
  const holidayInfo = $('#holidayInfo');
  const beijingTime = $('#beijingTime');
  const urumqiTime = $('#urumqiTime');
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

  // Holiday store (remote API, aggregated)
  const holidayCache = new Map();
  const holidayInfoCache = new Map();

  async function fetchTimorYear(year) {
    const r = await fetch(`https://timor.tech/api/holiday/year/${year}`);
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
    const r = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/CN`);
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
    if (holidayCache.has(year)) return holidayCache.get(year);
    const promise = (async () => {
      const merged = new Map();
      try {
        const timorMap = await fetchTimorYear(year);
        timorMap.forEach((value, key) => merged.set(key, value));
      } catch (err) {
        console.warn('Timor year fetch failed:', err);
      }
      try {
        const nagerMap = await fetchNagerYear(year);
        nagerMap.forEach((value, key) => {
          if (!merged.has(key)) merged.set(key, value);
        });
      } catch (err) {
        console.warn('Nager year fetch failed:', err);
      }
      holidayCache.set(year, merged);
      return merged;
    })().catch(err => {
      console.warn('Holiday aggregate failed:', err);
      const empty = new Map();
      holidayCache.set(year, empty);
      return empty;
    });
    holidayCache.set(year, promise);
    return promise;
  }

  async function ensureHolidayInfo(dateStr) {
    if (holidayInfoCache.has(dateStr)) return holidayInfoCache.get(dateStr);
    const promise = fetch(`https://timor.tech/api/holiday/info/${dateStr}`)
      .then(r => {
        if (!r.ok) throw new Error(`timor info ${r.status}`);
        return r.json();
      })
      .then(data => {
        holidayInfoCache.set(dateStr, data || null);
        return data || null;
      })
      .catch(err => {
        console.warn('Holiday info fetch failed:', err);
        holidayInfoCache.set(dateStr, null);
        return null;
      });
    holidayInfoCache.set(dateStr, promise);
    return promise;
  }

  function getHolidayForDate(d) {
    const maybe = holidayCache.get(d.getFullYear());
    if (!maybe || typeof maybe.then === 'function') return null;
    return maybe.get(isoDate(d)) || null;
  }

  function getHolidayInfoForDateStr(dateStr) {
    const maybe = holidayInfoCache.get(dateStr);
    if (!maybe || typeof maybe.then === 'function') return null;
    return maybe;
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
      btn.classList.add('holiday');
      const holiday = document.createElement('span');
      holiday.className = 'holiday-label';
      holiday.textContent = holidayText;
      btn.appendChild(holiday);
    }

    if (isSameDate(date, today)) btn.classList.add('today');
    if (isSameDate(date, selected)) btn.classList.add('selected');

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
    setHeader(view.y, view.m);
    buildGrid(view.y, view.m);
    updateTodoCard();
    updateTimeline();
    const currentYearState = holidayCache.get(view.y);
    if (!currentYearState || typeof currentYearState.then === 'function') {
      ensureHolidayYear(view.y).then(() => render());
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
  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else if (theme === 'light') {
      root.removeAttribute('data-theme'); // rely on light vars
    } else {
      // auto: follow system; remove explicit override
      root.removeAttribute('data-theme');
    }
  }
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    applyTheme(saved || 'auto');
  }
  themeToggle.addEventListener('click', () => {
    const root = document.documentElement;
    const hasDark = root.getAttribute('data-theme') === 'dark';
    const next = hasDark ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });

  // Init
  initTheme();
  updateDualTime();
  setInterval(updateDualTime, 30000);
  fetchTodos();
  migrateLocalData();

  // Info card logic
  function weekdayName(d) {
    const idx = (d.getDay() + 6) % 7; // Monday-first
    return weekdayFull[idx];
  }
  function updateTodoCard() {
    const isToday = isSameDate(selected, today);
    // migrate legacy boolean flag to list on view
    const key = isoDate(selected);
    todoTitle.textContent = isToday ? '今日提示' : '日期提示';
    todoDate.textContent = `${selected.getFullYear()}年${selected.getMonth() + 1}月${selected.getDate()}日 ${weekdayName(selected)}`;
    const holiday = getHolidayForDate(selected);
    const info = getHolidayInfoForDateStr(key);
    if (holidayInfo) {
      const parts = [];
      if (holiday) {
        parts.push(holiday.isWorkday
          ? `特殊日：${holiday.localName || '补班'}`
          : `特殊日：${holiday.localName || holiday.name || '节假日'}`);
      }
      if (holiday && holiday.note) parts.push(holiday.note);
      if (info && info.type && info.type.name && !/^周[一二三四五六日天]$/.test(info.type.name)) {
        parts.push(info.type.name);
      }
      holidayInfo.textContent = parts.join(' · ') || ' ';
    }
    const arr = listTodos(selected);
    const total = arr.length;
    const done = arr.filter(x => x.done).length;
    const undone = total - done;
    todoStatus.textContent = total ? `${total} 条 · 未 ${undone}` : '无代办';

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

  // Timeline rendering
  function parseISODate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function updateTimeline() {
    if (!tlList) return;
    tlList.innerHTML = '';
    const keys = Object.keys(todos).filter(k => Array.isArray(todos[k]) && todos[k].length > 0);
    // Sort desc by date
    keys.sort((a, b) => (a < b ? 1 : -1));
    for (const k of keys) {
      const arr = todos[k];
      const date = parseISODate(k);
      const group = document.createElement('li');
      group.className = 'tl-group';

      const title = document.createElement('div');
      title.className = 'tl-date-title';
      const idx = (date.getDay() + 6) % 7; // Monday-first
      const label = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weekdayFull[idx]}`;
      title.textContent = label;

      // Minimal: no badges or extra prompts
      group.appendChild(title);

      const ul = document.createElement('ul');
      ul.className = 'tl-items';
      for (const it of arr) {
        const li = document.createElement('li');
        li.className = 'tl-entry' + (it.done ? ' done' : '');
        const text = document.createElement('div'); text.className = 'tl-text'; text.textContent = it.text;
        li.appendChild(text);
        ul.appendChild(li);
      }
      group.appendChild(ul);
      tlList.appendChild(group);
    }
  }
  // Read-only timeline: no interactions bound
})();
