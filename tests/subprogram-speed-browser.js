async page => {
  const origin = 'http://127.0.0.1:8772';
  const sources = {};
  for (const name of ['schedule','feedback']) {
    for (const file of ['index.html','bootstrap.js','app.js']) {
      const path = `/apps/academy/pages/${name}/${file}`;
      sources[path] = await (await page.request.get(origin + path)).text();
    }
  }
  const stablePath = '/apps/academy/framework/stable-view.js';
  sources[stablePath] = await (await page.request.get(origin + stablePath)).text();
  let optimized = false;
  const requests = [];
  const mocks = {
    '/apps/network.js': 'window.APP_NETWORK={patchSupabase(){}};',
    '/apps/academy/framework/reliable-store.js': 'window.AcademyReliable={};',
    '/apps/academy/framework/store.js': `window.AcademyStore={getJSON:async()=>({rev:1,assignments:{},items:[]}),channel:()=>({unsubscribe(){}})};`,
    '/apps/academy/framework/auth.js': `window.AcademyAuth={session:{id:'test',name:'测试店长',role:'manager'},start:async()=>{},pull:async()=>{},list:()=>[{id:'test',name:'测试店长',role:'manager'}],isManager:()=>true,onChange:()=>()=>{},connectRealtime(){}};`,
    '/apps/academy/framework/save-status.js': '',
    '/apps/vendor/supabase.min.js': 'window.supabase={};'
  };
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (!url.startsWith(origin + '/')) return route.abort();
    const path = url.slice(origin.length).split('?')[0];
    if (path in mocks || path in sources) {
      let body = mocks[path] ?? sources[path];
      if (!optimized && path.endsWith('index.html')) body = body.replace(/\s*<link rel="preload"[^>]*>/g, '');
      if (!optimized && path.endsWith('bootstrap.js')) body = body.replace(/      \/\/ Download dependencies together[\s\S]*?      }\n/, '');
      if (path.endsWith('.js')) {
        requests.push(path);
        await page.waitForTimeout(150);
      }
      return route.fulfill({contentType:path.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8',body});
    }
    if (path.endsWith('.css')) return route.fulfill({contentType:'text/css',body:''});
    return route.abort();
  });
  const results = [];
  for (const name of ['schedule','feedback']) {
    for (const mode of [false,true]) {
      optimized = mode; requests.length = 0;
      await page.goto(`${origin}/apps/academy/pages/${name}/index.html`, {waitUntil:'domcontentloaded'});
      await page.waitForFunction(name => document.getElementById(`${name}-app`)?.getAttribute('aria-busy') === 'false', name);
      const measured = await page.evaluate(name => ({readyMs:Math.round(performance.now()),items:document.querySelectorAll(name === 'schedule' ? '.calendar-day' : '.empty-state').length}), name);
      results.push({name,optimized,...measured});
      for (const path of ['/apps/network.js','/apps/academy/framework/store.js',stablePath,`/apps/academy/pages/${name}/app.js`]) {
        if (requests.filter(value => value === path).length !== 1) throw new Error(`Duplicate or missing script ${path}`);
      }
    }
  }
  for (const name of ['schedule','feedback']) {
    const before = results.find(value => value.name === name && !value.optimized);
    const after = results.find(value => value.name === name && value.optimized);
    if (after.readyMs >= before.readyMs || !after.items) throw new Error(`${name}: no improvement or missing content`);
  }
  await page.unrouteAll({behavior:'wait'});
  return {scenario:'isolated standalone cold-start; each JS response delayed 150 ms; mocked account/data; not production latency',results};
}
