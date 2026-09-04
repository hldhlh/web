(() => {
  "use strict";

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
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
      window.SCHEDULE_USES_PARENT_RUNTIME = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  async function start() {
    // 在 Auto Office 内打开时复用主程序运行时，避免重复下载和账号同步。
    if (!inheritAutoOfficeRuntime()) {
      await Promise.all([
        loadScript("../../../network.js"),
        loadScript("../../../vendor/supabase.min.js"),
        loadScript("../../framework/store.js"),
        loadScript("../../framework/auth.js")
      ]);
    }
    await loadScript("./app.js");
  }

  start().catch((error) => {
    const status = document.getElementById("sync-status");
    if (status) status.textContent = error?.message || "排班程序加载失败";
    document.getElementById("schedule-app")?.setAttribute("aria-busy", "false");
  });
})();
