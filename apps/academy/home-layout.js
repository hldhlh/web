(() => {
  const blocks = { status: '今日状态', shortcuts: '快捷访问', workbench: '今日任务台', tasks: '任务面板', messages: '重要消息', exams: '重要考试' };
  const keys = Object.keys(blocks);
  function normalize(value) {
    const order = [...new Set((Array.isArray(value?.order) ? value.order : []).filter(key => keys.includes(key)))];
    return { order: [...order, ...keys.filter(key => !order.includes(key))], hidden: [...new Set((Array.isArray(value?.hidden) ? value.hidden : []).filter(key => keys.includes(key)))] };
  }
  function apply(root, value, preview = false) {
    const layout = normalize(value);
    for (const key of layout.order) {
      const block = root.querySelector(`[data-home-block="${key}"]`);
      if (!block) continue;
      block.hidden = !preview && layout.hidden.includes(key);
      root.append(block);
    }
  }
  function editorHTML() {
    return `<section class="home-layout-editor" aria-label="首页布局编辑器">
      <div class="home-layout-toolbar"><p>按住拖动手柄排序，也可使用上移、下移。预览内容以当前账号为例。</p>
      <div><button type="button" data-layout-action="reset">恢复默认</button><button type="button" data-layout-action="cancel">撤销修改</button><button type="button" class="primary" data-layout-action="save">保存布局</button></div></div>
      <p class="home-layout-feedback" role="status" aria-live="polite">布局已加载</p>
      <div class="home-layout-preview"></div></section>`;
  }
  function mount(root, value, renderHome, save) {
    const editor = root.querySelector('.home-layout-editor');
    const preview = editor.querySelector('.home-layout-preview');
    const feedback = editor.querySelector('[role="status"]');
    let saved = normalize(value), draft = normalize(value), busy = false, dragging = null;
    const content = document.createElement('div');
    renderHome(content, true);
    const originals = new Map([...content.children].map(node => [node.dataset.homeBlock, node]));
    function draw(focusKey, action) {
      preview.replaceChildren();
      draft.order.forEach((key, index) => {
        const hidden = draft.hidden.includes(key);
        const card = document.createElement('section');
        card.className = `home-layout-card${hidden ? ' is-hidden' : ''}`;
        card.dataset.layoutKey = key;
        card.innerHTML = `<header class="home-layout-card-head"><button type="button" class="home-layout-handle" data-layout-action="drag" aria-label="拖动${blocks[key]}，也可按上下方向键">⠿</button><strong>${blocks[key]}</strong><span>${index + 1} / ${keys.length}</span>
        <div><button type="button" data-layout-action="up" aria-label="上移${blocks[key]}" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-layout-action="down" aria-label="下移${blocks[key]}" ${index === keys.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-layout-action="toggle" aria-label="${hidden ? '显示' : '隐藏'}${blocks[key]}" aria-pressed="${!hidden}">${hidden ? '已隐藏' : '已显示'}</button></div></header>`;
        const body = document.createElement('div');
        body.className = 'home-layout-card-body';
        body.inert = true;
        body.setAttribute('aria-hidden', 'true');
        body.append(originals.get(key));
        card.append(body);
        preview.append(card);
      });
      if (focusKey) preview.querySelector(`[data-layout-key="${focusKey}"] [data-layout-action="${action}"]`)?.focus({ preventScroll: true });
    }
    function changed() { feedback.textContent = '有未保存的修改 · 点击保存布局后生效'; }
    function move(key, delta, action) {
      const index = draft.order.indexOf(key), next = index + delta;
      if (next < 0 || next >= draft.order.length) return;
      [draft.order[index], draft.order[next]] = [draft.order[next], draft.order[index]];
      draw(key, action); changed();
    }
    editor.addEventListener('click', async event => {
      event.stopPropagation();
      const button = event.target.closest('[data-layout-action]');
      if (!button || busy) return;
      const action = button.dataset.layoutAction, key = button.closest('[data-layout-key]')?.dataset.layoutKey;
      if (action === 'up' || action === 'down') move(key, action === 'up' ? -1 : 1, action);
      if (action === 'toggle') {
        draft.hidden = draft.hidden.includes(key) ? draft.hidden.filter(item => item !== key) : [...draft.hidden, key];
        draw(key, action); changed();
      }
      if (action === 'reset') { draft = normalize(); draw(); changed(); }
      if (action === 'cancel') { draft = normalize(saved); draw(); feedback.textContent = '已撤销未保存的修改'; }
      if (action === 'save') {
        busy = true; editor.setAttribute('aria-busy', 'true');
        editor.querySelectorAll('button').forEach(item => { item.disabled = true; });
        feedback.textContent = '正在保存…';
        try { await save(normalize(draft)); saved = normalize(draft); feedback.textContent = '布局已存本机，云端同步进度见页面保存状态'; }
        catch (error) { feedback.textContent = `保存失败，修改已保留，请重试：${error.message || '未知错误'}`; }
        finally { busy = false; editor.removeAttribute('aria-busy'); editor.querySelectorAll('.home-layout-toolbar button').forEach(item => { item.disabled = false; }); draw(); }
      }
    });
    editor.addEventListener('keydown', event => {
      if (!event.target.matches('.home-layout-handle') || busy) return;
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault(); event.stopPropagation();
      move(event.target.closest('[data-layout-key]').dataset.layoutKey, event.key === 'ArrowUp' ? -1 : 1, 'drag');
    });
    editor.addEventListener('pointerdown', event => {
      const handle = event.target.closest('.home-layout-handle');
      if (!handle || busy || event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      const card = handle.closest('[data-layout-key]');
      dragging = { card, handle, order: [...draft.order], id: event.pointerId };
      handle.setPointerCapture(event.pointerId);
      card.classList.add('is-dragging');
    });
    editor.addEventListener('pointermove', event => {
      if (!dragging || event.pointerId !== dragging.id) return;
      event.preventDefault(); event.stopPropagation();
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-layout-key]');
      if (target && target !== dragging.card && preview.contains(target)) {
        const rect = target.getBoundingClientRect();
        preview.insertBefore(dragging.card, event.clientY < rect.top + rect.height / 2 ? target : target.nextSibling);
      }
      if (event.clientY < 100) window.scrollBy(0, -24);
      if (event.clientY > innerHeight - 100) window.scrollBy(0, 24);
    });
    function end(event) {
      if (!dragging || event.pointerId !== dragging.id) return;
      event.stopPropagation();
      const { card, handle, order, id } = dragging;
      dragging = null;
      if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
      draft.order = event.type === 'pointercancel' ? order : [...preview.children].map(node => node.dataset.layoutKey);
      draw(card.dataset.layoutKey, 'drag');
      if (draft.order.join() !== order.join()) changed();
    }
    editor.addEventListener('pointerup', end);
    editor.addEventListener('pointercancel', end);
    draw();
  }
  window.AcademyHomeLayout = { normalize, apply, editorHTML, mount };
})();
