/* Durable local-first documents. Remote rows use the reserved doc: namespace in
 * academy_progress; real users retain their existing user_id and payload shape. */
window.AcademyReliable = (() => {
  'use strict';
  const DB_NAME = 'academy-reliable-v1';
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const plain = v => v && typeof v === 'object' && !Array.isArray(v);
  let database, adapter, running, timer, attempts = 0;
  const subscribers = new Set();
  const migrated = new Set();
  const keyFor = path => `doc:${path}:`;
  const tracked = path => ['academy/content.json', 'academy/schedule.json', 'academy/daily-feedback.json'].includes(path);
  function merge(base, local, remote, path = '', policy = 'conflict') {
    if (equal(local, base)) return clone(remote);
    if (equal(remote, base) || equal(local, remote)) return clone(local);
    if (plain(local) && plain(remote) && (plain(base) || base == null)) {
      const result = {};
      for (const key of new Set([...Object.keys(base || {}), ...Object.keys(local), ...Object.keys(remote)])) {
        if (['rev', 'updatedAt'].includes(key)) { result[key] = Math.max(Number(local[key]) || 0, Number(remote[key]) || 0); continue; }
        const value = merge(base?.[key], local[key], remote[key], `${path}/${key}`, policy);
        if (value !== undefined) result[key] = value;
      }
      return result;
    }
    if ([base, local, remote].every(Array.isArray) && [...base, ...local, ...remote].every(v => plain(v) && typeof v.id === 'string') && [base, local, remote].every(list => new Set(list.map(v => v.id)).size === list.length)) {
      const maps = [base, local, remote].map(list => new Map(list.map(v => [v.id, v])));
      return [...new Set([...remote.map(v => v.id), ...local.map(v => v.id)])].map(id => merge(maps[0].get(id), maps[1].get(id), maps[2].get(id), `${path}/${id}`, policy)).filter(v => v !== undefined);
    }
    if (path.startsWith('progress:') && /\/(onlineSeconds|minutes|lastSeenAt|streak)$/.test(path) && typeof local === 'number' && typeof remote === 'number') return Math.max(local, remote);
    if (policy === 'local') return clone(local);
    const error = new Error(`同一内容已在其他设备修改：${path || '记录'}`);
    error.conflict = true;
    throw error;
  }
  function open() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('cache', { keyPath: 'key' });
        request.result.createObjectStore('queue', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { database = null; reject(new Error('本机存储不可用，内容尚未保存，请勿关闭页面')); };
    });
    return database;
  }
  async function transaction(stores, mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('本机存储已满，内容尚未保存，请勿关闭页面'));
      action(tx, value => { result = value; });
    });
  }
  const get = (store, key) => transaction([store], 'readonly', (tx, done) => { tx.objectStore(store).get(key).onsuccess = e => done(e.target.result); });
  const all = store => transaction([store], 'readonly', (tx, done) => { tx.objectStore(store).getAll().onsuccess = e => done(e.target.result); });
  const putCache = row => transaction(['cache'], 'readwrite', tx => tx.objectStore('cache').put({ ...row, cachedAt: Date.now() }));
  async function reconcileCache(path, rows, startedAt) {
    await transaction(['cache'], 'readwrite', tx => {
      const store = tx.objectStore('cache');
      store.getAll().onsuccess = event => {
        const current = new Map(event.target.result.filter(row => row.path === path).map(row => [row.key, row]));
        const present = new Set(rows.map(row => row.key));
        for (const old of current.values()) {
          if (!old.key.endsWith('$legacy') && !present.has(old.key) && (old.cachedAt || 0) <= startedAt) store.delete(old.key);
        }
        for (const row of rows) {
          const old = current.get(row.key);
          if (old && (old.cachedAt || 0) > startedAt && Number(old.version) > Number(row.version)) continue;
          store.put({ ...row, path, cachedAt: Date.now() });
        }
      };
    });
  }
  function split(path, value) {
    if (path.startsWith('progress:')) return { [path]: value };
    const prefix = keyFor(path);
    if (path.endsWith('/schedule.json')) return Object.fromEntries(Object.entries(value?.assignments || {}).map(([id, data]) => [prefix + id, data]));
    if (path.endsWith('/daily-feedback.json')) return Object.fromEntries((value?.items || []).map(item => [prefix + item.id, item]));
    return { [prefix + 'value']: value };
  }
  function join(path, records) {
    const rows = records.filter(row => row.value !== null && row.value !== undefined);
    const rev = Math.max(0, ...records.map(row => Number(row.updatedAt) || 0));
    if (path.endsWith('/schedule.json')) return { rev, updatedAt: rev, assignments: Object.fromEntries(rows.map(row => [row.key.slice(keyFor(path).length), row.value])) };
    if (path.endsWith('/daily-feedback.json')) return { rev, updatedAt: rev, items: rows.map(row => row.value).sort((a, b) => b.createdAt - a.createdAt) };
    return rows[0]?.value ?? null;
  }
  async function emit() {
    const queue = await all('queue');
    const detail = { pending: queue.length, conflicts: queue.filter(row => row.conflict).length, entries: queue };
    subscribers.forEach(fn => fn(detail));
    window.dispatchEvent(new CustomEvent('academy-save-status', { detail }));
    return detail;
  }
  async function read(path, { cached = false } = {}) {
    const prefix = keyFor(path);
    if (!cached) {
      const startedAt = Date.now();
      const known = (await all("cache")).filter(row => row.path === path && !row.key.endsWith("$legacy"));
      const rows = await adapter.list(prefix, known);
      // The marker distinguishes a never-migrated file from an empty document.
      const marker = rows.find(row => row.key === prefix + '$ready');
      if (!marker) {
        const legacy = await adapter.legacy(path);
        const records = Object.entries(split(path, legacy)).map(([key, value]) => ({ key, path, value, version: null, updatedAt: Number(legacy?.rev) || 0 }));
        // Legacy base is captured locally. First write seeds all original records
        // with insert-if-absent before publishing the migration marker.
        await putCache({ key: prefix + '$legacy', path, value: legacy });
        await reconcileCache(path, records, startedAt);
      } else {
        await reconcileCache(path, rows, startedAt);
      }
    }
    const records = (await all('cache')).filter(row => row.path === path && !row.key.endsWith('$legacy') && !row.key.endsWith('$ready'));
    const map = new Map(records.map(row => [row.key, row]));
    for (const op of await all('queue')) if (op.path === path) map.set(op.key, { ...op, value: op.next, updatedAt: op.createdAt });
    return join(path, [...map.values()]);
  }
  async function enqueue(path, next, base) {
    const before = split(path, base);
    const after = split(path, next);
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    let conflictError;
    try {
      await transaction(['queue', 'cache'], 'readwrite', tx => {
        for (const key of keys) {
          const oldValue = before[key] ?? null, newValue = after[key] ?? null;
          if (equal(oldValue, newValue)) continue;
          const store = tx.objectStore('queue');
          store.get(key).onsuccess = e => {
            const old = e.target.result;
            try {
              const combined = old ? merge(oldValue, newValue, old.next, path) : clone(newValue);
              store.put({ key, path, base: old ? old.base : oldValue, next: combined, token: crypto.randomUUID(), createdAt: Date.now(), conflict: false });
            } catch (error) { conflictError = error; tx.abort(); }
          };
        }
      });
    } catch (error) {
      const failure = conflictError || error;
      window.dispatchEvent(new CustomEvent('academy-save-error', { detail: failure.message }));
      throw failure;
    }
    await emit();
    schedule(180);
    return { queued: true };
  }
  async function ensureMigrated(path) {
    if (!tracked(path) || migrated.has(path)) return;
    const prefix = keyFor(path);
    if (await adapter.one(prefix + '$ready')) { migrated.add(path); return; }
    const legacy = await adapter.legacy(path);
    const entries = Object.entries(split(path, legacy));
    // Bounded batches and ignore-duplicates preserve concurrent initial writers.
    for (let start = 0; start < entries.length; start += 100) {
      await adapter.seed(entries.slice(start, start + 100).map(([key, value]) => ({ key, value })));
    }
    await adapter.seed([{ key: prefix + '$ready', value: true }]);
    migrated.add(path);
  }
  async function finish(op, remote) {
    await transaction(['queue', 'cache'], 'readwrite', tx => {
      tx.objectStore('cache').put({ ...remote, path: op.path, cachedAt: Date.now() });
      const q = tx.objectStore('queue');
      q.get(op.key).onsuccess = e => {
        const current = e.target.result;
        if (current?.token === op.token) q.delete(op.key);
        else if (current) q.put({ ...current, base: clone(op.next) });
      };
    });
  }
  async function flushOne(op) {
    await ensureMigrated(op.path);
    for (let attempt = 0; attempt < 4; attempt++) {
      const remote = await adapter.one(op.key);
      if (remote?.token === op.token) { await finish(op, remote); return; }
      const value = !remote && op.path.startsWith("progress:") ? clone(op.next) : merge(op.base, op.next, remote?.value ?? null, op.path);
      if (remote && equal(value, remote.value)) { await finish(op, remote); return; }
      const result = await adapter.compareAndSet(op.key, value, remote?.version ?? null, op.token);
      if (result) { await finish(op, result); return; }
    }
    throw new Error('记录正在更新，稍后自动重试');
  }
  async function drain() {
    const queue = await all('queue');
    let failed = false;
    for (const snapshot of queue) {
      const op = await get('queue', snapshot.key);
      if (!op || op.conflict) continue;
      try { await flushOne(op); }
      catch (error) {
        failed = true;
        await transaction(['queue'], 'readwrite', tx => {
          const q = tx.objectStore('queue');
          q.get(op.key).onsuccess = e => {
            if (e.target.result?.token === op.token) q.put({ ...op, error: error.message, conflict: !!error.conflict });
          };
        });
      }
    }
    attempts = failed ? attempts + 1 : 0;
    const status = await emit();
    if (status.pending > status.conflicts) schedule(Math.min(30000, 1000 * 2 ** Math.min(attempts, 5)));
  }
  function schedule(ms = 0) { clearTimeout(timer); timer = setTimeout(() => flush().catch(() => {}), ms); }
  async function flush() {
    if (!adapter || navigator.onLine === false) return;
    if (running) return running;
    running = (navigator.locks ? navigator.locks.request(DB_NAME, drain) : drain()).finally(() => { running = null; });
    return running;
  }
  async function resolveConflict(key, choice) {
    const op = await get('queue', key);
    if (!op) return;
    const remote = await adapter.one(key);
    if (choice === 'remote') await finish(op, remote || { key, value: null, version: null });
    else await transaction(['queue'], 'readwrite', tx => {
      const q = tx.objectStore('queue');
      q.get(key).onsuccess = e => {
        if (e.target.result?.token === op.token) q.put({ ...op, base: remote?.value ?? null, next: merge(op.base, op.next, remote?.value ?? null, op.path, 'local'), token: crypto.randomUUID(), conflict: false, error: null });
      };
    });
    await emit(); schedule();
    window.dispatchEvent(new CustomEvent('academy-data-updated'));
  }
  function configure(next) { adapter = next; schedule(); emit().catch(() => {}); }
  window.addEventListener('online', () => schedule());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  return { configure, tracked, read, enqueue, flush, status: emit, resolveConflict, inspectConflict: key => adapter.one(key), merge, split, join,
    subscribe(fn) { subscribers.add(fn); emit().catch(() => {}); return () => subscribers.delete(fn); } };
})();
