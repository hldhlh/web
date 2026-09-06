async page => {
  await page.evaluate(async () => {
    for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister();
    for (const key of await caches.keys()) await caches.delete(key);
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'serviceWorker', { value: {
      register: () => Promise.reject(new Error('disabled for measurement')),
      getRegistration: () => Promise.resolve(null), getRegistrations: () => Promise.resolve([])
    } });
    new MutationObserver(() => {
      const view = document.querySelector('#view');
      if (!window.__firstContent && view?.children.length && !view.querySelector('.boot-screen')) { window.__firstContent = performance.now(); window.__sdkAtFirstContent = !!window.supabase; }
    }).observe(document, { subtree: true, childList: true });
  });
  await page.route('**/vendor/supabase.min.js', async route => {
    await page.waitForTimeout(3000);
    await route.continue();
  });
  const results = [];
  for (const port of [8767, 8765]) {
    await page.goto(`http://localhost:${port}/apps/academy/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__firstContent > 0);
    results.push(await page.evaluate(() => ({ firstContentMs: Math.round(window.__firstContent),
      uploadLibraryRequested: performance.getEntriesByType('resource').some(e => e.name.includes('/tus.min.js')),
      sdkLoadedAtFirstContent: window.__sdkAtFirstContent,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth })));
  }
  return { scenario: 'same cached test account, local server, SDK delayed 3000ms; not a production latency measurement', before: results[0], after: results[1] };
}
