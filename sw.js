// 部署时由 scripts/generate-build-meta.mjs 替换为当前 Git 提交版本。
const CACHE_NAME = 'web-shell-__BUILD_VERSION__-academy-network-first-v3';
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
  './apps/notes/icon.svg',
  './apps/jlksh/icon.svg',
  './apps/jlhcdh/icon.svg',
  './apps/academy/icon.svg',
  './apps/vista/icon.svg',
  './apps/svg/icon.svg',
  './apps/vista/index.html',
  './apps/log/icon.svg',
  './apps/avatar/icon.svg',
  './apps/ledger/icon.svg',
  './apps/gui-design-demo/icon.svg',
  './apps/jlhcdh/index.html',
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
  if (url.pathname.endsWith('/version.json')) return false;
  return !/\.(?:mp4|mov|mp3|zip|pptx?|xlsx?|xls|csv)$/i.test(url.pathname);
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || network;
}

async function networkFirst(request, cacheMode = 'no-cache') {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: cacheMode });
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  } catch (_) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') return cache.match('./index.html');
    throw _;
  }
}

self.addEventListener('fetch', (event) => {
  if (!canCache(event.request)) return;
  const url = new URL(event.request.url);
  if (url.pathname.includes('/apps/academy/')) {
    event.respondWith(networkFirst(event.request, 'reload'));
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(staleWhileRevalidate(event.request));
});
