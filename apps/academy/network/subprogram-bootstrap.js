(() => {
  "use strict";

  const appName = document.currentScript?.dataset.app;
  const applications = {
    schedule: { runtimeFlag: "SCHEDULE_USES_PARENT_RUNTIME", error: "排班程序加载失败" },
    feedback: { runtimeFlag: "FEEDBACK_USES_PARENT_RUNTIME", error: "问题反馈程序加载失败" }
  };
  const config = applications[appName];
  if (!config) throw new Error("未知的 Auto Office 子程序");
  const assets = JSON.parse(document.getElementById("app-assets")?.textContent || "{}");
  const asset = src => assets[src] || src;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = asset(src);
      script.onload = resolve;
      script.onerror = () => reject(new Error(`无法加载 ${src}`));
      document.head.appendChild(script);
    });
  }

  function inheritAutoOfficeRuntime() {
    try {
      if (window.parent === window || !window.parent.AcademyAuth || !window.parent.AcademyStore) return false;
      window.AcademyAuth = window.parent.AcademyAuth;
      window.AcademyStore = window.parent.AcademyStore;
      window[config.runtimeFlag] = true;
      const relayUpdate = event => window.dispatchEvent(new CustomEvent('academy-data-updated', { detail: event.detail }));
      window.parent.addEventListener('academy-data-updated', relayUpdate);
      window.addEventListener('pagehide', event => {
        if (!event.persisted) window.parent.removeEventListener('academy-data-updated', relayUpdate);
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  async function start() {
    // Embedded applications share the parent runtime and its connection lifecycle.
    if (!inheritAutoOfficeRuntime()) {
      // Download dependencies together while preserving their execution order.
      for (const href of ['../../../network.js', '../../network/reliable-store.js', '../../network/store.js', '../../network/secure-auth.js', '../../network/auth.js']) {
        const link = document.createElement('link');
        link.rel = 'preload'; link.as = 'script'; link.href = asset(href);
        document.head.appendChild(link);
      }
      await loadScript("../../../network.js");
      await loadScript("../../network/reliable-store.js");
      await loadScript("../../network/store.js");
      await loadScript("../../network/secure-auth.js");
      await loadScript("../../network/auth.js");
    }
    await loadScript("../../framework/stable-view.js");
    await loadScript("./app.js");
    await loadScript("../../network/save-status.js");
    if (!window.parent?.supabase && !window.supabase) {
      loadScript("../../../vendor/supabase.min.js").then(() => {
        window.APP_NETWORK?.patchSupabase();
        window.AcademyAuth.connectRealtime?.();
        window.dispatchEvent(new Event('academy-sdk-ready'));
      }).catch(() => {});
    }
  }

  start().catch((error) => {
    const status = document.getElementById("sync-status");
    if (status) status.textContent = error?.message || config.error;
    document.getElementById(`${appName}-app`)?.setAttribute("aria-busy", "false");
  });
})();
