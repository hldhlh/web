/*
 * Shared backend route selector.
 * Add production proxy origins to ENDPOINTS after they are deployed. Every
 * endpoint must proxy /rest, /auth, /storage, /functions and /realtime paths.
 */
(function () {
  const PROJECT_ORIGIN = 'https://fmxddvjgkykuqwmasigo.supabase.co';
  const ENDPOINTS = [
    { name: 'Supabase Global', origin: PROJECT_ORIGIN }
    // Example after deployment and CORS configuration:
    // { name: '中国大陆网关', origin: 'https://api.example.cn' },
    // { name: '海外边缘网关', origin: 'https://api-global.example.com' }
  ].concat(Array.isArray(window.APP_NETWORK_ENDPOINTS) ? window.APP_NETWORK_ENDPOINTS : []);

  const CACHE_KEY = 'app-network-best-v1';
  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const nativeFetch = window.fetch.bind(window);
  let benchmarking = false;

  const normalize = (value) => String(value || '').replace(/\/+$/, '');
  const nodes = Array.from(new Map(ENDPOINTS.map((node) => {
    const origin = normalize(node.origin);
    return [origin, { name: node.name || origin, origin }];
  })).values()).filter((node) => /^https:\/\//.test(node.origin));

  function readCachedOrigin() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.savedAt < CACHE_TTL && nodes.some((node) => node.origin === cached.origin)) {
        return cached.origin;
      }
    } catch (_) { }
    return nodes[0]?.origin || PROJECT_ORIGIN;
  }

  let currentOrigin = readCachedOrigin();

  function remember(origin, latency) {
    currentOrigin = origin;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ origin, latency, savedAt: Date.now() })); } catch (_) { }
    window.dispatchEvent(new CustomEvent('app-network-change', { detail: { origin, latency } }));
  }

  function replaceOrigin(input, targetOrigin) {
    const value = typeof input === 'string' ? input : input.url;
    try {
      const url = new URL(value, location.href);
      if (nodes.some((node) => url.origin === node.origin) || url.origin === PROJECT_ORIGIN) {
        return targetOrigin + url.pathname + url.search + url.hash;
      }
    } catch (_) { }
    return input;
  }

  function withTimeout(promiseFactory, timeout = 2200) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    return promiseFactory(controller.signal).finally(() => clearTimeout(timer));
  }

  async function probe(node) {
    const startedAt = performance.now();
    try {
      const response = await withTimeout((signal) => nativeFetch(`${node.origin}/auth/v1/health`, {
        method: 'GET', cache: 'no-store', mode: 'cors', signal
      }));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { ...node, latency: Math.round(performance.now() - startedAt) };
    } catch (_) {
      return { ...node, latency: Infinity };
    }
  }

  async function benchmark() {
    if (benchmarking || nodes.length < 2 || !navigator.onLine) return currentOrigin;
    benchmarking = true;
    try {
      const results = (await Promise.all(nodes.map(probe))).filter((result) => Number.isFinite(result.latency));
      results.sort((a, b) => a.latency - b.latency);
      if (results[0]) remember(results[0].origin, results[0].latency);
      return currentOrigin;
    } finally {
      benchmarking = false;
    }
  }

  function enhanceOptions(options = {}) {
    const existingFetch = options.global?.fetch;
    if (existingFetch || nodes.length < 2) return options;

    const routeFetch = async (input, init = {}) => {
      const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const ordered = [currentOrigin, ...nodes.map((node) => node.origin).filter((origin) => origin !== currentOrigin)];
      let lastError;

      for (let index = 0; index < ordered.length; index++) {
        try {
          const response = await nativeFetch(replaceOrigin(input, ordered[index]), init);
          const retryableStatus = [502, 503, 504].includes(response.status);
          if (!retryableStatus || !['GET', 'HEAD'].includes(method) || index === ordered.length - 1) {
            if (response.ok && ordered[index] !== currentOrigin) remember(ordered[index], null);
            return response;
          }
        } catch (error) {
          lastError = error;
          if (!['GET', 'HEAD'].includes(method) || index === ordered.length - 1) throw error;
        }
      }
      throw lastError || new Error('All backend routes failed');
    };

    return { ...options, global: { ...(options.global || {}), fetch: routeFetch } };
  }

  function patchSupabase() {
    const sdk = window.supabase;
    if (!sdk?.createClient || sdk.createClient.__appNetworkPatched) return Boolean(sdk?.createClient);
    const createClient = sdk.createClient.bind(sdk);
    const patched = (url, key, options) => createClient(replaceOrigin(url, currentOrigin), key, enhanceOptions(options));
    patched.__appNetworkPatched = true;
    sdk.createClient = patched;
    return true;
  }

  window.APP_NETWORK = {
    get origin() { return currentOrigin; },
    get endpoints() { return nodes.map((node) => ({ ...node })); },
    benchmark,
    patchSupabase,
    rewriteUrl(url) { return replaceOrigin(url, currentOrigin); }
  };

  patchSupabase();
  window.addEventListener('online', benchmark, { passive: true });
  const schedule = window.requestIdleCallback || ((callback) => setTimeout(callback, 1200));
  schedule(() => benchmark());
})();
