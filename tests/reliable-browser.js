async page => {
  await page.goto('http://localhost:8765/apps/avatar/');
  await page.addScriptTag({ url: '/apps/academy/framework/reliable-store.js' });
  const result = await page.evaluate(async () => {
    const sync = window.AcademyReliable;
    const remote = new Map();
    const copy = v => v == null ? v : JSON.parse(JSON.stringify(v));
    const passed = [];
    const assert = (value, message) => { if (!value) throw new Error(message); passed.push(message); };
    let fail = false, loseResponse = false, writes = 0, collide = false;
    const adapter = {
      async list(prefix) { return [...remote.values()].filter(row => row.key.startsWith(prefix)).map(copy); },
      async one(key) { if (fail) throw new Error('offline'); return copy(remote.get(key)) || null; },
      async legacy(path) { return path.includes('schedule') ? { rev: 1, assignments: { '2026-09-01': [{ userId: 'a', shift: 'morning' }] } } : { rev: 1, items: [] }; },
      async seed(rows) { for (const row of rows) if (!remote.has(row.key)) remote.set(row.key, { ...copy(row), version: 1 }); },
      async compareAndSet(key, value, version, token) {
        if (fail) throw new Error('offline');
        if (collide) { collide = false; remote.set(key, { key, value: { a: 1, b: 2 }, version: version + 1 }); return null; }
        if ((remote.get(key)?.version ?? null) !== version) return null;
        const row = { key, value: copy(value), version: (version || 0) + 1, token, updatedAt: Date.now() };
        remote.set(key, row); writes++;
        if (loseResponse) { loseResponse = false; throw new Error('lost acknowledgement'); }
        return copy(row);
      }
    };
    sync.configure(adapter);
    await sync.flush();
    const id = 'progress:browser-' + Date.now();
    const started = performance.now();
    fail = true;
    await sync.enqueue(id, { a: 2, b: 1 }, { a: 1, b: 1 });
    const localMs = performance.now() - started;
    await sync.flush();
    assert((await sync.status()).entries.some(op => op.path === id), 'offline save survives failed sync');
    assert((await sync.read(id, { cached: true })).a === 2, 'offline read overlays pending edits');
    await sync.enqueue(id, { a: 3, b: 1 }, { a: 2, b: 1 });
    assert((await sync.status()).entries.filter(op => op.path === id).length === 1, 'consecutive edits coalesce');
    remote.set(id, { key: id, value: { a: 1, b: 2 }, version: 1 });
    fail = false;
    await sync.flush();
    assert(remote.get(id).value.a === 3 && remote.get(id).value.b === 2, 'independent edits merge without overwriting remote fields');
    assert(!(await sync.status()).entries.some(op => op.path === id), 'acknowledged operation is removed');
    await sync.enqueue(id, { a: 4, b: 2 }, { a: 3, b: 2 });
    remote.set(id, { key: id, value: { a: 5, b: 2 }, version: 2 });
    await sync.flush();
    assert((await sync.status()).entries.find(op => op.path === id)?.conflict, 'same-field conflict retains local draft');
    assert(remote.get(id).value.a === 5, 'conflict does not overwrite cloud data');
    await sync.resolveConflict(id, 'local'); await sync.flush();
    assert(remote.get(id).value.a === 4, 'explicit local conflict resolution saves selected content');
    const before = writes;
    loseResponse = true;
    await sync.enqueue(id, { a: 6, b: 2 }, { a: 4, b: 2 });
    await sync.flush(); await sync.flush();
    assert(writes === before + 1, 'lost response is recognized by operation token without a duplicate write');
    remote.set(id, { key: id, value: { a: 1, b: 1 }, version: 10 });
    collide = true;
    await sync.enqueue(id, { a: 2, b: 1 }, { a: 1, b: 1 });
    await sync.flush();
    assert(remote.get(id).value.a === 2 && remote.get(id).value.b === 2, 'CAS collision re-reads and merges latest record');
    const path = 'academy/schedule.json';
    const base = await sync.read(path);
    const next = copy(base); next.assignments['2026-09-02'] = [{ userId: 'b', shift: 'off' }];
    await sync.enqueue(path, next, base); await sync.flush();
    const schedule = await sync.read(path);
    assert(schedule.assignments['2026-09-01'][0].userId === 'a', 'migration preserves legacy schedule');
    assert(schedule.assignments['2026-09-02'][0].userId === 'b', 'schedule updates only changed day');
    remote.delete('doc:academy/schedule.json:2026-09-01');
    assert(!(await sync.read(path)).assignments['2026-09-01'], 'authoritative refresh removes deleted cached records');
    const savedCompare = adapter.compareAndSet;
    let release, entered;
    const inFlight = new Promise(resolve => { entered = resolve; });
    adapter.compareAndSet = async (...args) => { entered(); await new Promise(resolve => { release = resolve; }); return savedCompare(...args); };
    await sync.enqueue(id, { a: 3, b: 2 }, { a: 2, b: 2 });
    const firstFlush = sync.flush();
    await inFlight;
    await sync.enqueue(id, { a: 4, b: 2 }, { a: 3, b: 2 });
    adapter.compareAndSet = savedCompare;
    release(); await firstFlush; await sync.flush();
    assert(remote.get(id).value.a === 4, 'edit made during an inflight save survives the older acknowledgement');
    fail = true;
    await sync.enqueue(id, { a: 5, b: 2 }, { a: 4, b: 2 });
    await sync.enqueue(id, { a: 4, b: 3 }, { a: 4, b: 2 });
    const combined = await sync.read(id, { cached: true });
    assert(combined.a === 5 && combined.b === 3, 'two tabs editing different fields preserve both queued changes');
    let localConflict = false;
    try { await sync.enqueue(id, { a: 6, b: 2 }, { a: 4, b: 2 }); } catch (error) { localConflict = error.conflict; }
    assert(localConflict, 'conflicting tab edit rejects without replacing the existing durable draft');
    fail = false; await sync.flush();
    // Leave an offline draft, then the outer browser test reloads the entire page.
    fail = true;
    await sync.enqueue('progress:reload-test', { saved: 'survives reload' }, {});
    await sync.flush();
    return { passed, localMs: Math.round(localMs) };
  });
  await page.reload();
  await page.addScriptTag({ url: '/apps/academy/framework/reliable-store.js' });
  const recovered = await page.evaluate(async () => {
    const data = await window.AcademyReliable.read('progress:reload-test', { cached: true });
    if (data.saved !== 'survives reload') throw new Error('Reload lost the durable draft');
    return 'full browser reload preserves pending data in IndexedDB';
  });
  return { ...result, recovered };
}
