(() => {
  'use strict';

  const CHECK_INTERVAL_MS = 5 * 60 * 1000;
  const DISMISSED_KEY = 'academy-version-dismissed';
  const REALTIME_ROW_ID = 'app-version';
  const VERSION_PATTERN = /^[0-9a-f]{7,40}$/i;
  const currentVersion = document.querySelector('meta[name="app-build-version"]')?.content?.trim() || '';
  const manifestUrl = new URL('../../version.json', document.baseURI);
  let checking = null;
  let updating = false;
  let modal = null;
  let realtimeChannel = null;
  let realtimeRetryTimer = 0;
  let realtimeRetryAttempt = 0;

  function isVersion(value) {
    return VERSION_PATTERN.test(String(value || '').trim());
  }

  function removeRefreshMarker() {
    const url = new URL(location.href);
    if (!url.searchParams.has('_cache_refresh')) return;
    url.searchParams.delete('_cache_refresh');
    history.replaceState(history.state, '', url.href);
  }

  async function fetchLatestVersion() {
    const url = new URL(manifestUrl);
    url.searchParams.set('_', Date.now().toString());
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`Version check failed: ${response.status}`);
    const manifest = await response.json();
    return String(manifest?.version || '').trim();
  }

  function handleLatestVersion(latestVersion) {
    const normalized = String(latestVersion || '').trim();
    if (!isVersion(currentVersion) || !isVersion(normalized) || updating) return false;
    if (normalized === currentVersion) {
      try { sessionStorage.removeItem(DISMISSED_KEY); } catch (_) {}
      return false;
    }
    let dismissed = '';
    try { dismissed = sessionStorage.getItem(DISMISSED_KEY) || ''; } catch (_) {}
    if (dismissed !== normalized) showPrompt(normalized);
    return true;
  }

  function injectStyles() {
    if (document.getElementById('academy-update-style')) return;
    const style = document.createElement('style');
    style.id = 'academy-update-style';
    style.textContent = `
      .academy-update-mask{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:24px;background:rgba(17,24,39,.42);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
      .academy-update-card{box-sizing:border-box;width:min(100%,380px);padding:26px 24px 22px;border:1px solid rgba(0,0,0,.08);border-radius:26px;background:#fff;color:#111827;box-shadow:0 24px 70px rgba(0,0,0,.22);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .academy-update-icon{display:grid;place-items:center;width:50px;height:50px;margin-bottom:18px;border-radius:16px;background:#e8f3ff;color:#087ff5;font-size:27px;font-weight:800}
      .academy-update-card h2{margin:0 0 9px;font-size:24px;line-height:1.25;letter-spacing:-.02em}
      .academy-update-card p{margin:0;color:#667085;font-size:15px;line-height:1.6}
      .academy-update-version{margin-top:14px!important;padding:10px 12px;border-radius:12px;background:#f5f7fa;color:#475467!important;font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace!important}
      .academy-update-actions{display:grid;grid-template-columns:1fr 1.45fr;gap:10px;margin-top:22px}
      .academy-update-actions button{min-height:48px;border:0;border-radius:14px;font:600 16px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}
      .academy-update-later{background:#f2f4f7;color:#344054}
      .academy-update-now{background:#087ff5;color:#fff}
      .academy-update-actions button:disabled{cursor:wait;opacity:.65}
      @media (prefers-color-scheme:dark){.academy-update-card{border-color:rgba(255,255,255,.12);background:#1c1c1e;color:#f5f5f7}.academy-update-card p{color:#a1a1aa}.academy-update-version{background:#2c2c2e;color:#d1d5db!important}.academy-update-later{background:#2c2c2e;color:#f5f5f7}}
    `;
    document.head.appendChild(style);
  }

  function closePrompt(latestVersion) {
    try { sessionStorage.setItem(DISMISSED_KEY, latestVersion); } catch (_) {}
    modal?.remove();
    modal = null;
  }

  function showPrompt(latestVersion) {
    if (modal || updating) return;
    injectStyles();
    modal = document.createElement('div');
    modal.className = 'academy-update-mask';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'academy-update-title');
    modal.innerHTML = `
      <section class="academy-update-card">
        <div class="academy-update-icon" aria-hidden="true">↻</div>
        <h2 id="academy-update-title">发现新版本</h2>
        <p>Auto Office 已更新。立即更新会清理本站缓存和可访问的 Cookie，可能需要重新登录，不会删除学习记录或云端数据。</p>
        <p class="academy-update-version">当前 ${currentVersion} · 最新 ${latestVersion}</p>
        <div class="academy-update-actions">
          <button class="academy-update-later" type="button">稍后</button>
          <button class="academy-update-now" type="button">清理并更新</button>
        </div>
      </section>`;
    const laterButton = modal.querySelector('.academy-update-later');
    const updateButton = modal.querySelector('.academy-update-now');
    laterButton.addEventListener('click', () => closePrompt(latestVersion));
    updateButton.addEventListener('click', () => clearAndReload(latestVersion, updateButton, laterButton));
    document.body.appendChild(modal);
    updateButton.focus();
  }

  function cookiePaths() {
    const sitePath = new URL('../../', location.href).pathname;
    const appsPath = new URL('../', location.href).pathname;
    const appPath = new URL('./', location.href).pathname;
    return [...new Set(['/', sitePath, appsPath, appPath])];
  }

  async function clearCookies() {
    const paths = cookiePaths();
    if ('cookieStore' in window) {
      try {
        const cookies = await window.cookieStore.getAll();
        await Promise.all(cookies.flatMap((cookie) => {
          const exactCookie = { name: cookie.name };
          if (cookie.domain) exactCookie.domain = cookie.domain;
          if (cookie.path) exactCookie.path = cookie.path;
          const exactDelete = window.cookieStore.delete(exactCookie).catch(() => {});
          const pathDeletes = paths.map((path) =>
            window.cookieStore.delete({ name: cookie.name, path }).catch(() => {})
          );
          return [exactDelete, ...pathDeletes];
        }));
      } catch (_) {}
    }
    const names = document.cookie.split(';').map((item) => item.split('=')[0].trim()).filter(Boolean);
    const hostParts = location.hostname.split('.');
    const domains = ['', location.hostname, `.${location.hostname}`];
    if (hostParts.length > 2) domains.push(`.${hostParts.slice(-2).join('.')}`);
    for (const name of names) {
      for (const path of paths) {
        for (const domain of domains) {
          const domainPart = domain ? `; domain=${domain}` : '';
          document.cookie = `${name}=; Max-Age=0; path=${path}${domainPart}; SameSite=Lax`;
        }
      }
    }
  }

  async function clearAndReload(latestVersion, updateButton, laterButton) {
    if (updating) return;
    updating = true;
    updateButton.disabled = true;
    laterButton.disabled = true;
    updateButton.textContent = '正在更新…';
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      }
      await clearCookies();
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
    } catch (error) {
      console.warn('[Auto Office] 部分缓存未能清理，将继续刷新。', error);
    }
    try { sessionStorage.removeItem(DISMISSED_KEY); } catch (_) {}
    const url = new URL(location.href);
    url.searchParams.set('_cache_refresh', `${latestVersion}-${Date.now()}`);
    location.replace(url.href);
  }

  async function checkForUpdate() {
    if (!isVersion(currentVersion) || updating || modal || !navigator.onLine) return false;
    if (checking) return checking;
    checking = (async () => {
      try {
        const latestVersion = await fetchLatestVersion();
        return handleLatestVersion(latestVersion);
      } catch (error) {
        console.debug('[Auto Office] 后台版本核对暂不可用。', error);
        return false;
      } finally {
        checking = null;
      }
    })();
    return checking;
  }

  function scheduleRealtimeReconnect() {
    if (realtimeRetryTimer || realtimeChannel || updating || !navigator.onLine) return;
    const delay = Math.min(30000, 800 * (2 ** Math.min(realtimeRetryAttempt, 5)));
    realtimeRetryAttempt += 1;
    realtimeRetryTimer = setTimeout(() => {
      realtimeRetryTimer = 0;
      connectRealtime();
    }, delay);
  }

  function connectRealtime() {
    if (realtimeChannel || updating || !navigator.onLine) return realtimeChannel;
    const client = window.AcademyStore?.realtimeClient?.();
    if (!client) {
      scheduleRealtimeReconnect();
      return null;
    }
    const channel = client
      .channel('auto-office-version-live')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'academy_state',
        filter: `id=eq.${REALTIME_ROW_ID}`
      }, (change) => {
        const row = change?.new && Object.keys(change.new).length ? change.new : change?.old;
        handleLatestVersion(row?.payload?.version);
      });
    realtimeChannel = channel;
    channel.subscribe((status) => {
      if (realtimeChannel !== channel) return;
      if (status === 'SUBSCRIBED') {
        realtimeRetryAttempt = 0;
        clearTimeout(realtimeRetryTimer);
        realtimeRetryTimer = 0;
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        realtimeChannel = null;
        try { client.removeChannel(channel); } catch (_) {}
        scheduleRealtimeReconnect();
      }
    });
    return channel;
  }

  removeRefreshMarker();
  window.AutoOfficeVersion = Object.freeze({
    current: currentVersion,
    check: checkForUpdate,
    subscribe: connectRealtime
  });
  window.addEventListener('load', () => {
    connectRealtime();
    setTimeout(checkForUpdate, 1200);
  }, { once: true });
  window.addEventListener('online', () => {
    connectRealtime();
    checkForUpdate();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      connectRealtime();
      checkForUpdate();
    }
  });
  setInterval(checkForUpdate, CHECK_INTERVAL_MS);
})();
