(() => {
  'use strict';
  const load = src => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src; script.onload = resolve; script.onerror = () => reject(new Error('程序加载失败，请刷新重试'));
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
    const theme = () => { document.documentElement.dataset.theme = parent.document.documentElement.dataset.theme || 'light'; };
    theme();
    const observer = new MutationObserver(theme);
    observer.observe(parent.document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
    if (!parent.supabase?.createClient) await load('../../../vendor/supabase.min.js');
    window.supabase = parent.supabase || window.supabase;
    await load('model.js'); await load('image-processing.js'); await load('editor.js'); await load('collaboration.js');
  }
  start().catch(error => { document.getElementById('syncStatus').textContent = error.message; });
})();
