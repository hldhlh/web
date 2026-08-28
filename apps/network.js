/*
 * Shared backend route selector.
 * Add production proxy origins to ENDPOINTS after they are deployed. Every
 * endpoint must proxy /rest, /auth, /storage, /functions and /realtime paths.
 */
(function () {
  const PROJECT_ORIGIN = 'https://fmxddvjgkykuqwmasigo.supabase.co';
  const sameOriginGateway = location.protocol === 'https:'
    && location.origin !== PROJECT_ORIGIN
    && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
    ? { name: '站点边缘网关', origin: location.origin }
    : null;
  const ENDPOINTS = [
    { name: 'Supabase Global', origin: PROJECT_ORIGIN }
  ].concat(
    Array.isArray(window.APP_NETWORK_ENDPOINTS) ? window.APP_NETWORK_ENDPOINTS : []
  );

  const CACHE_KEY = 'app-network-best-v3';
  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const READ_TIMEOUT = 6500;
  const RETRY_TIMEOUT = 10000;
  const HEDGE_DELAY = 320;
  const FAILURE_COOLDOWN = 30 * 1000;
  const nativeFetch = window.fetch.bind(window);
  let benchmarking = false;
  const unhealthyUntil = new Map();

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

  function addConnectionHint(origin) {
    if (!document?.head) return;
    ['dns-prefetch', 'preconnect'].forEach((rel) => {
      if (document.head.querySelector(`link[rel="${rel}"][href="${origin}"]`)) return;
      const link = document.createElement('link');
      link.rel = rel;
      link.href = origin;
      if (rel === 'preconnect') link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    });
  }

  nodes.forEach((node) => addConnectionHint(node.origin));

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

  function fetchWithTimeout(input, init = {}, timeout = READ_TIMEOUT) {
    return withTimeout((timeoutSignal) => {
      const originalSignal = init.signal;
      if (!originalSignal) return nativeFetch(input, { ...init, signal: timeoutSignal });
      if (originalSignal.aborted) return Promise.reject(originalSignal.reason || new DOMException('Aborted', 'AbortError'));

      const controller = new AbortController();
      const abortFromOriginal = () => controller.abort(originalSignal.reason);
      const abortFromTimeout = () => controller.abort(timeoutSignal.reason);
      originalSignal.addEventListener('abort', abortFromOriginal, { once: true });
      timeoutSignal.addEventListener('abort', abortFromTimeout, { once: true });
      return nativeFetch(input, { ...init, signal: controller.signal }).finally(() => {
        originalSignal.removeEventListener('abort', abortFromOriginal);
        timeoutSignal.removeEventListener('abort', abortFromTimeout);
      });
    }, timeout);
  }

  function isRetryableResponse(response) {
    return [408, 425, 429, 502, 503, 504].includes(response.status);
  }

  function delay(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason || new DOMException('Aborted', 'AbortError'));
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason || new DOMException('Aborted', 'AbortError'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  async function probe(node) {
    const startedAt = performance.now();
    try {
      const response = await withTimeout((signal) => nativeFetch(`${node.origin}/auth/v1/health`, {
        method: 'GET', cache: 'no-store', mode: 'cors', signal
      }));
      if (!response.ok && response.status !== 401) throw new Error(`HTTP ${response.status}`);
      const type = response.headers.get('content-type') || '';
      if (!type.includes('json')) throw new Error('Invalid gateway response');
      const payload = await response.json();
      if (!payload || typeof payload !== 'object') throw new Error('Invalid gateway payload');
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

  function addEndpoints(extraEndpoints = []) {
    extraEndpoints.forEach((endpoint) => {
      const origin = normalize(endpoint?.origin);
      if (!/^https:\/\//.test(origin) || nodes.some((node) => node.origin === origin)) return;
      nodes.push({ name: endpoint.name || origin, origin });
      addConnectionHint(origin);
    });
    return benchmark();
  }

  async function discoverSameOriginGateway() {
    if (!sameOriginGateway || nodes.some((node) => node.origin === sameOriginGateway.origin)) return false;
    const result = await probe(sameOriginGateway);
    if (!Number.isFinite(result.latency)) return false;
    nodes.push({ name: sameOriginGateway.name, origin: sameOriginGateway.origin });
    addConnectionHint(sameOriginGateway.origin);
    return true;
  }

  function getOrderedOrigins() {
    const now = Date.now();
    const ordered = [currentOrigin, ...nodes.map((node) => node.origin).filter((origin) => origin !== currentOrigin)];
    const healthy = ordered.filter((origin) => (unhealthyUntil.get(origin) || 0) <= now);
    return healthy.length ? healthy : ordered;
  }

  function raceRead(input, init, origins, requireSuccess = false) {
    return new Promise((resolve, reject) => {
      let failures = 0;
      let settled = false;
      let lastError;

      origins.forEach((origin, index) => {
        (async () => {
          try {
            // 缓存最优节点立即发出；只有超过阈值仍未返回才启动下一条线路。
            if (index > 0) await delay(HEDGE_DELAY * index, init.signal);
            if (settled) return;
            const response = await fetchWithTimeout(replaceOrigin(input, origin), init);
            if (isRetryableResponse(response) || (requireSuccess && !response.ok)) {
              throw new Error(`HTTP ${response.status}`);
            }
            if (settled) return;
            settled = true;
            unhealthyUntil.delete(origin);
            if (origin !== currentOrigin) remember(origin, null);
            resolve(response);
          } catch (error) {
            if (settled) return;
            lastError = error;
            failures++;
            if (error?.name !== 'AbortError') unhealthyUntil.set(origin, Date.now() + FAILURE_COOLDOWN);
            if (failures === origins.length) reject(lastError || new Error('All backend routes failed'));
          }
        })();
      });
    });
  }

  async function routeFetch(input, init = {}) {
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const readable = method === 'GET' || method === 'HEAD';
    const requireSuccess = init.appNetworkRequireSuccess === true;
    const safeWrite = init.appNetworkSafeWrite === true;
    const requestInit = { ...init };
    delete requestInit.appNetworkRequireSuccess;
    delete requestInit.appNetworkSafeWrite;

    if (readable) {
      const origins = getOrderedOrigins();
      try {
        return await raceRead(input, requestInit, origins, requireSuccess);
      } catch (firstError) {
        if (origins.length > 1 || requestInit.signal?.aborted) throw firstError;
        await delay(160, requestInit.signal);
        return fetchWithTimeout(replaceOrigin(input, origins[0]), requestInit, RETRY_TIMEOUT);
      }
    }

    if (!safeWrite) return nativeFetch(replaceOrigin(input, PROJECT_ORIGIN), requestInit);

    const origins = getOrderedOrigins();
    let lastError;
    const bodyBytes = typeof requestInit.body === 'string'
      ? new Blob([requestInit.body]).size
      : Number(requestInit.body?.size || 0);
    const writeTimeout = Math.min(
      180000,
      RETRY_TIMEOUT + Math.ceil(bodyBytes / (256 * 1024)) * 1000
    );
    for (const origin of origins) {
      try {
        const response = await fetchWithTimeout(replaceOrigin(input, origin), requestInit, writeTimeout);
        // Safe writes are idempotent upserts. Any failed gateway response can
        // therefore fall back to the next route without creating duplicates.
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        unhealthyUntil.delete(origin);
        if (origin !== currentOrigin) remember(origin, null);
        return response;
      } catch (error) {
        if (requestInit.signal?.aborted) throw error;
        lastError = error;
        unhealthyUntil.set(origin, Date.now() + FAILURE_COOLDOWN);
      }
    }
    throw lastError || new Error('All backend routes failed');
  }

  function enhanceOptions(options = {}) {
    const existingFetch = options.global?.fetch;
    if (existingFetch) return options;

    return { ...options, global: { ...(options.global || {}), fetch: routeFetch } };
  }

  function patchSupabase() {
    const sdk = window.supabase;
    if (!sdk?.createClient || sdk.createClient.__appNetworkPatched) return Boolean(sdk?.createClient);
    const createClient = sdk.createClient.bind(sdk);
    const patched = (url, key, options = {}) => {
      const directRealtime = options.appNetworkRealtimeDirect === true;
      const clientOptions = { ...options };
      delete clientOptions.appNetworkRealtimeDirect;
      const targetOrigin = normalize(url || PROJECT_ORIGIN);
      return createClient(targetOrigin, key, enhanceOptions(clientOptions));
    };
    patched.__appNetworkPatched = true;
    sdk.createClient = patched;
    return true;
  }

  window.APP_NETWORK = {
    get origin() { return currentOrigin; },
    get projectOrigin() { return PROJECT_ORIGIN; },
    get endpoints() { return nodes.map((node) => ({ ...node })); },
    benchmark,
    addEndpoints,
    request: routeFetch,
    patchSupabase,
    rewriteUrl(url) { return replaceOrigin(url, currentOrigin); }
  };

  patchSupabase();
  window.addEventListener('online', benchmark, { passive: true });
  const schedule = window.requestIdleCallback || ((callback) => setTimeout(callback, 1200));
  schedule(async () => {
    await discoverSameOriginGateway();
    benchmark();
  });
})();
