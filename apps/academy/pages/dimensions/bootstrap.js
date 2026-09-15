(() => {
  'use strict';
  const load = src => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => { script.remove(); reject(new Error('标注工具加载超时，请检查网络后重新加载')); }, 45000);
    script.src = src;
    script.onload = () => { clearTimeout(timeout); resolve(); };
    script.onerror = () => { clearTimeout(timeout); reject(new Error('标注工具加载失败，请重新加载')); };
    document.head.append(script);
  });
  async function start() {
    const parent = window.parent;
    if (parent === window || !parent.AcademyAuth || !parent.AcademyStore) {
      const target = new URL('../../index.html', location.href);
      target.hash = '#/apps/dimensions' + (location.search || '');
      location.replace(target); return;
    }
    window.AcademyAuth = parent.AcademyAuth;
    window.AcademyStore = parent.AcademyStore;
    window.ACADEMY_CONFIG = parent.ACADEMY_CONFIG;
    window.APP_NETWORK = parent.APP_NETWORK;
    const operation = document.getElementById('imageOperation');
    operation.hidden = false;
    document.getElementById('imageOperationTitle').textContent = '正在加载标注工具';
    document.getElementById('imageOperationMessage').textContent = '正在准备图片处理和编辑功能…';
    const theme = () => { document.documentElement.dataset.theme = parent.document.documentElement.dataset.theme || 'light'; };
    theme();
    const observer = new MutationObserver(theme);
    observer.observe(parent.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
    if (!parent.supabase?.createClient) await load('../../../vendor/supabase.min.js');
    window.supabase = parent.supabase || window.supabase;
    await load('model.js'); await load('image-processing.js'); await load('editor.js'); await load('collaboration.js');
    if (!window.DimensionCollab) throw new Error('标注工具初始化失败，请重新加载');
    if (document.getElementById('workspace').getAttribute('aria-busy') !== 'true') operation.hidden = true;
  }
  start().catch(error => {
    document.querySelector('.sync-bar').dataset.status = 'error';
    document.getElementById('syncStatus').textContent = error.message;
    document.getElementById('imageOperation').hidden = false;
    document.getElementById('imageOperation').dataset.status = 'error';
    document.getElementById('imageOperationTitle').textContent = '标注工具未能打开';
    document.getElementById('imageOperationMessage').textContent = error.message;
    document.getElementById('imageOperationProgress').hidden = true;
    const retry = document.getElementById('retryImageOperation');
    retry.hidden = false; retry.textContent = '重新加载'; retry.onclick = () => location.reload();
    retry.focus({ preventScroll: true });
  });
})();
