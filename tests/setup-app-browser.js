async page => {
  const rows = new Map();
  const user = { id: 'test-manager', name: '测试店长', role: 'manager', access: 'full', sessionToken: 'test-session', deviceId: 'test-device' };
  const content = { rev: 1, data: { lessons: [], exams: [], notices: [], courseGroups: [], taskBoard: { title: '任务面板', stages: [] } } };
  await page.route('https://fmxddvjgkykuqwmasigo.supabase.co/**', async route => {
    const request = route.request();
    const url = { pathname: request.url().split('?')[0], searchParams: new Map((request.url().split('?')[1] || '').split('&').filter(Boolean).map(part => part.split('=').map(decodeURIComponent))) };
    let body = [];
    if (url.pathname.includes('/rest/v1/academy_progress')) {
      const filter = url.searchParams.get('user_id') || '';
      const matches = row => !filter || (filter.startsWith('eq.') ? row.user_id === filter.slice(3) : filter.startsWith('like.') ? row.user_id.startsWith(filter.slice(5).replace(/\*$/, '')) : filter.startsWith('in.') ? filter.includes(`"${row.user_id}"`) : false);
      if (request.method() === 'POST') {
        const parsed = request.postDataJSON();
        for (const row of Array.isArray(parsed) ? parsed : [parsed]) {
          if (!rows.has(row.user_id)) { rows.set(row.user_id, row); body.push(row); }
          else if (!(request.headers().prefer || '').includes('ignore-duplicates')) return route.fulfill({ status: 409, json: {} });
        }
      } else if (request.method() === 'PATCH') {
        const row = request.postDataJSON();
        const previous = [...rows.values()].find(matches);
        if (previous && String(previous.ts) === url.searchParams.get('ts')?.slice(3)) { rows.set(row.user_id, row); body = [row]; }
      } else body = [...rows.values()].filter(matches);
    } else if (url.pathname.includes('/storage/v1/object/')) {
      if (url.pathname.endsWith('/accounts.json')) body = { rev: 1, users: [user] };
      else if (url.pathname.includes('/sessions/')) body = { userId: user.id, token: user.sessionToken };
      else if (url.pathname.endsWith('/content.json')) body = content;
      else if (url.pathname.endsWith('/schedule.json')) body = { rev: 1, assignments: {} };
      else if (url.pathname.endsWith('/daily-feedback.json')) body = { rev: 1, items: [] };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  if (page.routeWebSocket) await page.routeWebSocket('**', socket => socket.close());
  await page.addInitScript(user => {
    sessionStorage.setItem('academy-session-v1', JSON.stringify(user));
    localStorage.setItem('academy-people-cache-v1', JSON.stringify([user]));
  }, user);
  await page.goto('http://localhost:8765/apps/academy/pages/feedback/');
  return { title: await page.title(), backend: 'all backend requests mocked; no production writes' };
}
