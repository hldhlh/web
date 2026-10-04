/*
 * Shared backend route selector.
 * Add production proxy origins to ENDPOINTS after they are deployed. Every
 * endpoint must proxy /rest, /auth, /storage, /functions and /realtime paths.
 */
(function () {
  const scriptUrl = document.currentScript?.src;
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
  let benchmarkPromise;
  const inflightReads = new Map();
  const metrics = [];
  const unhealthyUntil = new Map();
  const rankings = new Map();
  let networkGeneration = 0;
  let lastPersistedAt = 0;

  const normalize = (value) => String(value || '').replace(/\/+$/, '');
  const nodes = Array.from(new Map(ENDPOINTS.map((node) => {
    const origin = normalize(node.origin);
    return [origin, { name: node.name || origin, origin }];
  })).values()).filter((node) => /^https:\/\//.test(node.origin));

  // Restore only a previously verified gateway belonging to this site.
  try {
    const gateway = JSON.parse(localStorage.getItem('app-network-gateway-v1') || 'null');
    if (sameOriginGateway && gateway?.origin === sameOriginGateway.origin && gateway.available
      && !nodes.some(node => node.origin === gateway.origin)) nodes.push(sameOriginGateway);
  } catch (_) {}

  function readCachedOrigin() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      for (const item of Array.isArray(cached?.rankings) ? cached.rankings : []) {
        if (nodes.some(node => node.origin === item.origin) && Number.isFinite(item.latency) && item.latency >= 0) {
          rankings.set(item.origin, { latency: item.latency, savedAt: item.savedAt });
        }
      }
      // Expired measurements remain hints, never a reason to block startup.
      if (cached && nodes.some((node) => node.origin === cached.origin)) {
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

  function remember(origin, latency, force = false) {
    const changed = currentOrigin !== origin;
    currentOrigin = origin;
    if (!force && !changed && Date.now() - lastPersistedAt < 1000) return;
    lastPersistedAt = Date.now();
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ origin, latency, savedAt: Date.now(),
      rankings: [...rankings].map(([origin, item]) => ({ origin, ...item })) })); } catch (_) { }
    if (changed) window.dispatchEvent(new CustomEvent('app-network-change', { detail: { origin, latency } }));
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
      await withTimeout(async (signal) => {
        const response = await nativeFetch(`${node.origin}/auth/v1/health`, {
          method: 'GET', cache: 'no-store', mode: 'cors', signal
        });
        if (!response.ok && response.status !== 401) throw new Error(`HTTP ${response.status}`);
        const type = response.headers.get('content-type') || '';
        if (!type.includes('json')) throw new Error('Invalid gateway response');
        const payload = await response.json();
        if (!payload || typeof payload !== 'object') throw new Error('Invalid gateway payload');
      });
      return { ...node, latency: Math.round(performance.now() - startedAt) };
    } catch (_) {
      return { ...node, latency: Infinity };
    }
  }

  async function benchmark() {
    if (benchmarking) return benchmarkPromise;
    if (nodes.length < 2 || !navigator.onLine) return currentOrigin;
    benchmarking = true;
    const generation = networkGeneration;
    benchmarkPromise = (async () => {
      try {
        const results = (await Promise.all(nodes.map(probe))).filter((result) => Number.isFinite(result.latency));
        if (generation !== networkGeneration) return currentOrigin;
        results.sort((a, b) => a.latency - b.latency);
        results.forEach(result => {
          rankings.set(result.origin, { latency: result.latency, savedAt: Date.now() });
          unhealthyUntil.delete(result.origin);
        });
        nodes.filter(node => !results.some(result => result.origin === node.origin))
          .forEach(node => unhealthyUntil.set(node.origin, Date.now() + FAILURE_COOLDOWN));
        if (results[0]) remember(results[0].origin, results[0].latency, true);
        return currentOrigin;
      } finally {
        benchmarking = false;
      }
    })();
    return benchmarkPromise;
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

  async function discoverSameOriginGateway(force = false) {
    if (!sameOriginGateway || nodes.some((node) => node.origin === sameOriginGateway.origin)) return false;
    try {
      const cached = JSON.parse(localStorage.getItem('app-network-gateway-v1') || 'null');
      if (!force && cached?.origin === sameOriginGateway.origin && Date.now() - cached.at < CACHE_TTL) {
        if (cached.available) nodes.push(sameOriginGateway);
        return !!cached.available;
      }
    } catch (_) {}
    const result = await probe(sameOriginGateway);
    try { localStorage.setItem('app-network-gateway-v1', JSON.stringify({ origin: sameOriginGateway.origin, at: Date.now(), available: Number.isFinite(result.latency) })); } catch (_) {}
    if (!Number.isFinite(result.latency)) return false;
    nodes.push({ name: sameOriginGateway.name, origin: sameOriginGateway.origin });
    addConnectionHint(sameOriginGateway.origin);
    return true;
  }

  function getOrderedOrigins() {
    const now = Date.now();
    const ordered = [currentOrigin, ...nodes.map((node) => node.origin).filter((origin) => origin !== currentOrigin)
      .sort((a, b) => (rankings.get(a)?.latency ?? Infinity) - (rankings.get(b)?.latency ?? Infinity))];
    const healthy = ordered.filter((origin) => (unhealthyUntil.get(origin) || 0) <= now);
    return [...healthy, ...ordered.filter(origin => !healthy.includes(origin))];
  }

  function raceRead(input, init, origins, requireSuccess = false) {
    return new Promise((resolve, reject) => {
      let active = 0;
      let next = 0;
      let settled = false;
      let timer;
      let lastError;
      const controllers = new Set();
      const generation = networkGeneration;
      const cleanup = (winner) => {
        clearTimeout(timer);
        init.signal?.removeEventListener('abort', onAbort);
        controllers.forEach(controller => { if (controller !== winner) controller.abort(); });
      };
      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(init.signal.reason || new DOMException('Aborted', 'AbortError'));
      };
      const launch = () => {
        clearTimeout(timer);
        if (settled || next >= origins.length) return;
        const origin = origins[next++];
        const controller = new AbortController();
        controllers.add(controller);
        active++;
        const started = performance.now();
        if (next < origins.length) timer = setTimeout(launch, HEDGE_DELAY);
        (async () => {
          try {
            const response = await fetchWithTimeout(replaceOrigin(input, origin), { ...init, signal: controller.signal });
            if (isRetryableResponse(response) || (requireSuccess && !response.ok)) {
              response.body?.cancel().catch(() => {});
              throw new Error(`HTTP ${response.status}`);
            }
            if (settled) {
              response.body?.cancel().catch(() => {});
              return;
            }
            settled = true;
            cleanup(controller); // Do not abort the winning response body/stream.
            if (generation === networkGeneration) {
              const latency = Math.round(performance.now() - started);
              unhealthyUntil.delete(origin);
              rankings.set(origin, { latency, savedAt: Date.now() });
              remember(origin, latency);
            }
            resolve(response);
          } catch (error) {
            if (settled) return;
            lastError = error;
            if (generation === networkGeneration) unhealthyUntil.set(origin, Date.now() + FAILURE_COOLDOWN);
            // A definite failure starts the next route immediately, without a probe.
            if (next < origins.length) launch();
          } finally {
            active--;
            if (!settled && active === 0 && next === origins.length) {
              settled = true;
              cleanup();
              reject(lastError || new Error('All backend routes failed'));
            }
          }
        })();
      };
      if (init.signal?.aborted) return onAbort();
      init.signal?.addEventListener('abort', onAbort, { once: true });
      launch();
    });
  }

  async function performFetch(input, init = {}) {
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

    if (!safeWrite) return fetchWithTimeout(replaceOrigin(input, PROJECT_ORIGIN), requestInit, 30000);

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
        if (!response.ok && !isRetryableResponse(response)) return response;
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

  async function routeFetch(input, init = {}) {
    if (input instanceof Request) {
      const original = input;
      input = original.url;
      init = { method: original.method, headers: original.headers, credentials: original.credentials,
        cache: original.cache, signal: original.signal,
        ...(!['GET', 'HEAD'].includes(original.method) ? { body: await original.clone().arrayBuffer() } : {}), ...init };
    }
    const method = String(init.method || 'GET').toUpperCase();
    const read = method === 'GET' || method === 'HEAD';
    // Only identical simultaneous reads share transport. Each consumer gets its
    // own Response body, and callers with cancellation retain independent work.
    const pathname = new URL(input, location.href).pathname;
    const streaming = new Headers(init.headers).has('range') || (pathname.includes('/storage/v1/') && !pathname.endsWith('.json'));
    const key = read && !init.signal && !streaming ? JSON.stringify([input, method,
      [...new Headers(init.headers).entries()].sort(), init.cache, init.credentials, !!init.appNetworkRequireSuccess]) : null;
    if (key && inflightReads.has(key)) return (await inflightReads.get(key)).clone();
    if (!read) inflightReads.clear();
    const started = performance.now();
    const promise = performFetch(input, init);
    if (key) inflightReads.set(key, promise);
    try {
      const response = await promise;
      metrics.push({ method, path: new URL(input, location.href).pathname, ms: Math.round(performance.now() - started), status: response.status });
      if (metrics.length > 100) metrics.shift();
      return key ? response.clone() : response;
    } finally {
      if (key && inflightReads.get(key) === promise) inflightReads.delete(key);
    }
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
    window.dispatchEvent(new CustomEvent("app-sdk-ready"));
    return true;
  }

  window.APP_NETWORK = {
    get origin() { return currentOrigin; },
    get projectOrigin() { return PROJECT_ORIGIN; },
    get endpoints() { return nodes.map((node) => ({ ...node })); },
    get ranking() { return getOrderedOrigins().map(origin => ({ origin, ...rankings.get(origin) })); },
    benchmark,
    get metrics() { return metrics.map(item => ({ ...item })); },
    addEndpoints,
    request: routeFetch,
    patchSupabase,
    rewriteUrl(url) { return replaceOrigin(url, currentOrigin); }
  };

  // Direct visits to a sub-app also install the shared offline shell. Cache
  // resources after load/idle so the first screen retains network priority.
  if (scriptUrl && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    const cachePage = () => {
      const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1200));
      idle(async () => {
        try {
          await navigator.serviceWorker.register(new URL('../sw.js', scriptUrl));
          const registration = await navigator.serviceWorker.ready;
          const urls = [location.href, ...performance.getEntriesByType('resource').map(entry => entry.name)]
            .filter(value => { const url = new URL(value); return url.origin === location.origin && (value === location.href || /\.(js|css|svg|ico|woff2?|ttf)$/.test(url.pathname)); });
          registration.active?.postMessage({ type: 'CACHE_PAGE', urls: [...new Set(urls)] });
        } catch (_) {}
      });
    };
    if (document.readyState === 'complete') cachePage();
    else window.addEventListener('load', cachePage, { once: true });
  }

  patchSupabase();
  const refreshNetwork = () => {
    networkGeneration++;
    unhealthyUntil.clear();
    inflightReads.clear();
    // Requests keep using the saved list while the new network is measured.
    const pending = benchmarkPromise;
    Promise.resolve(pending).then(async () => {
      await discoverSameOriginGateway(true);
      await benchmark();
    }).catch(() => {});
  };
  window.addEventListener('online', refreshNetwork, { passive: true });
  navigator.connection?.addEventListener('change', refreshNetwork);

  const schedule = window.requestIdleCallback || ((callback) => setTimeout(callback, 1200));
  schedule(async () => {
    await discoverSameOriginGateway();
    await benchmark();
  });
})();
