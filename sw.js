// 部署时由 scripts/generate-build-meta.mjs 替换为当前 Git 提交版本。
const CACHE_NAME = 'web-shell-__BUILD_VERSION__-ranked-network-v5';
const SHELL = [
  './',
  './index.html',
  './favicon.svg',
  './apps.js',
  './apps/calendar/icon.svg',
  './apps/todo/icon.svg',
  './apps/image-converter/icon.svg',
  './apps/thought-matrix/icon.svg',
  './apps/cloud/icon.svg',
  './apps/eatwhat/icon.svg',
  './apps/academy/pages/notes/icon.svg',
  './apps/academy/pages/jlhcdh/icon.svg',
  './apps/academy/icon.svg',
  './apps/academy/version-guard.js',
  './apps/academy/home-layout.js',
  './apps/academy/dashboard-workbench.js',
  './apps/academy/framework/reliable-store.js',
  './apps/academy/framework/store.js',
  './apps/academy/framework/save-status.js',
  './apps/academy/framework/save-status.css',
  './apps/vista/icon.svg',
  './apps/svg/icon.svg',
  './apps/vista/index.html',
  './apps/log/icon.svg',
  './apps/avatar/icon.svg',
  './apps/ledger/icon.svg',
  './apps/gui-design-demo/icon.svg',
  './apps/academy/pages/jlhcdh/index.html',
  './apps/log/index.html',
  './apps/log/styles.css',
  './apps/log/script.js',
  './apps/cloud/index.html',
  './apps/cloud/style.css',
  './apps/cloud/script.js',
  './apps/ledger/index.html',
  './apps/vendor/supabase.min.js',
  './apps/network.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function canCache(request) {
  if (request.method !== 'GET' || request.headers.has('range')) return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (/\/(rest|auth|storage|functions|realtime)\/v1(?:\/|$)/.test(url.pathname)) return false;
  if (url.pathname.endsWith('/version.json')) return false;
  return !/\.(?:mp4|mov|mp3|zip|pptx?|xlsx?|xls|csv)$/i.test(url.pathname);
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request, { cache: 'no-cache' }).then(async (response) => {
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  event.waitUntil(network);
  return cached || network;
}

async function networkFirst(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  let timer;
  // Return a cached page promptly on a slow network, but let revalidation finish.
  const network = fetch(request, { cache: 'no-cache' }).then(async response => {
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return !response.ok && cached ? cached : response;
  }).catch(error => {
    if (cached) return cached;
    throw error;
  });
  event.waitUntil(network.catch(() => {}));
  try {
    return cached ? await Promise.race([
      network, new Promise(resolve => { timer = setTimeout(() => resolve(cached), 600); })
    ]) : await network;
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('fetch', (event) => {
  if (!canCache(event.request)) return;
  const url = new URL(event.request.url);
  // Only a release-versioned static URL is immutable. Manifests and APIs bypass us.
  const version = url.searchParams.get('v');
  if (/^[0-9a-f]{7,40}$/i.test(version || '') && /\.(js|css)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(event.request) || networkFirst(event.request, event);
    })());
    return;
  }
  if (event.request.mode === 'navigate' || /\.(?:html|js|css)$/.test(url.pathname)
    || url.pathname.includes('/apps/academy/')) {
    event.respondWith(networkFirst(event.request, event));
    return;
  }
  event.respondWith(staleWhileRevalidate(event.request, event));
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_PAGE' || !Array.isArray(event.data.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(event.data.urls.slice(0, 100).map(async value => {
      const url = new URL(value, self.location.origin);
      const request = new Request(url.href);
      if (!canCache(request)) return;
      if (!(url.pathname.endsWith('/') || /\.(html|js|css|svg|ico|woff2?|ttf)$/.test(url.pathname))) return;
      if (!await cache.match(request)) await cache.add(request);
    }));
  })());
});
