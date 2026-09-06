(() => {
  const sync = window.AcademyStore?.reliable;
  if (!sync) return;
  const box = document.createElement('details');
  box.className = 'save-status';
  box.hidden = true;
  const summary = document.createElement('summary');
  summary.setAttribute('aria-live', 'polite');
  box.append(summary);
  const content = document.createElement('div');
  box.append(content);
  (document.querySelector('main') || document.body).before(box);
  const button = (label, action) => {
    const el = document.createElement('button');
    el.type = 'button'; el.textContent = label;
    el.onclick = async () => {
      el.disabled = true;
      try { await action(); } catch (e) { summary.textContent = e.message; }
      finally { el.disabled = false; }
    };
    return el;
  };
  function label(entry) {
    if (entry.path.endsWith('/schedule.json')) return `排班 · ${entry.key.slice(-10)}`;
    if (entry.path.endsWith('/daily-feedback.json')) return `问题反馈 · ${entry.next?.title || '未命名问题'}`;
    if (entry.path.startsWith('progress:')) return '学习记录';
    return '课程与通知';
  }
  function preview(entry, value) {
    if (!value) return '这条记录已被删除';
    if (entry.path.endsWith('/schedule.json')) {
      const people = new Map((window.AcademyAuth?.list() || []).map(user => [user.id, user.name]));
      const shifts = { morning: '早班', middle: '中班', evening: '晚班', full: '全天', off: '休息' };
      return value.map(item => `${people.get(item.userId) || '员工'}：${shifts[item.shift] || item.shift}`).join('\n') || '当天没有安排';
    }
    if (entry.path.endsWith('/daily-feedback.json')) return `${value.title}\n${value.detail}\n状态：${({ open: '待处理', processing: '处理中', resolved: '已解决' })[value.status] || value.status}`;
    if (entry.path.startsWith('progress:')) return `已完成 ${Object.keys(value.completed || {}).length} 节课程，累计学习 ${value.minutes || 0} 分钟`;
    const content = value.data || value;
    return ['lessons', 'exams', 'notices'].map((key, index) => `${['课程', '考试', '通知'][index]}：${(content[key] || []).map(item => item.title).join('、') || '无'}`).join('\n');
  }
  let hadPending = false;
  let saveError = '';
  let hideTimer = 0;
  window.addEventListener('academy-save-error', event => {
    clearTimeout(hideTimer);
    hideTimer = 0;
    saveError = event.detail;
    box.dataset.state = 'error';
    box.hidden = false; summary.textContent = saveError;
  });
  const unsubscribe = sync.subscribe(state => {
    if (state.pending) saveError = '';
    if (saveError) { box.hidden = false; summary.textContent = saveError; return; }
    if (state.pending) {
      clearTimeout(hideTimer);
      hideTimer = 0;
      box.hidden = false;
    } else if (hadPending) {
      box.hidden = false;
      box.open = false;
      hideTimer = setTimeout(() => { box.hidden = true; hideTimer = 0; }, 2500);
    } else if (!hideTimer) {
      box.hidden = true;
    }
    box.dataset.state = state.conflicts ? 'error' : state.pending ? 'pending' : 'success';
    const conflictText = state.conflicts ? `，${state.conflicts} 项修改冲突` : '';
    summary.textContent = state.pending
      ? `已存本机 · ${state.pending} 项待同步` + conflictText
      : '已同步到云端';
    content.replaceChildren();
    if (state.pending) content.append(button('立即重试', () => sync.flush()));
    for (const entry of state.entries.filter(e => e.conflict)) {
      const row = document.createElement('div');
      const title = document.createElement('p'); title.textContent = `${label(entry)}：其他设备也修改了此内容，请选择要保留的修改。`;
      const draft = document.createElement('pre'); draft.textContent = `本机内容\n${preview(entry, entry.next)}`;
      row.append(title, draft,
        button('查看云端内容', async () => { const remote = await sync.inspectConflict(entry.key); const cloud = document.createElement('pre'); cloud.textContent = `云端内容\n${preview(entry, remote?.value)}`; row.append(cloud); }),
        button('保留本机修改', () => sync.resolveConflict(entry.key, 'local')),
        button('采用云端内容', () => sync.resolveConflict(entry.key, 'remote')));
      content.append(row);
    }
    if (hadPending && !state.pending) window.dispatchEvent(new CustomEvent('academy-data-updated'));
    hadPending = !!state.pending;
  });
  window.addEventListener("pagehide", event => { if (!event.persisted) { clearTimeout(hideTimer); unsubscribe(); } });
})();
