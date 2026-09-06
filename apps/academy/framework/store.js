window.AcademyStore = (() => {
  function cfg() {
    return window.ACADEMY_CONFIG;
  }

  function origin() {
    return window.APP_NETWORK?.origin || cfg().url;
  }

  function request(input, init) {
    return window.APP_NETWORK?.request
      ? window.APP_NETWORK.request(input, init)
      : window.fetch(input, init);
  }

  function headers(extra) {
    const key = cfg().key;
    return Object.assign({
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json"
    }, extra || {});
  }

  function objectUrl(path) {
    return `${origin()}/storage/v1/object/${cfg().bucket}/${path}`;
  }

  function restUrl(table, params) {
    const url = new URL(`${origin()}/rest/v1/${table}`);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value != null && value !== "") url.searchParams.set(key, value);
    });
    return url.toString();
  }

  async function restSelect(table, params) {
    const response = await request(restUrl(table, params), {
      headers: headers({ "Cache-Control": "no-cache" }),
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function restUpsert(table, row, onConflict) {
    const response = await request(restUrl(table, onConflict ? { on_conflict: onConflict } : {}), {
      method: "POST",
      appNetworkSafeWrite: true,
      headers: headers({
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      }),
      body: JSON.stringify(row)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return true;
  }

  async function getLegacyJSON(path, options = {}) {
    const required = options.required === true;
    const requestOptions = {
      headers: headers({ "Cache-Control": "no-cache" }),
      cache: "no-store"
    };
    if (required && window.APP_NETWORK?.request) requestOptions.appNetworkRequireSuccess = true;
    const response = await request(objectUrl(path), requestOptions);
    if (!required && response.status === 404) return null;
    if (!required && response.status === 400) {
      const error = await response.clone().json().catch(() => ({}));
      if (Number(error.statusCode) === 404 || error.error === 'not_found') return null;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function putLegacyJSON(path, data) {
    const response = await request(objectUrl(path), {
      method: "POST",
      appNetworkSafeWrite: true,
      headers: headers({
        "Content-Type": "application/json",
        "x-upsert": "true",
        "cache-control": "max-age=0"
      }),
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return true;
  }

  function realtimeClient() {
    if (!window.supabase?.createClient) return null;
    const selectedOrigin = window.APP_NETWORK?.projectOrigin || cfg().url;
    if (realtimeClient._sb && realtimeClient._origin === selectedOrigin) return realtimeClient._sb;
    realtimeClient._origin = selectedOrigin;
    realtimeClient._sb = window.supabase.createClient(selectedOrigin, cfg().key, {
      appNetworkRealtimeDirect: true,
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 20 } }
    });
    return realtimeClient._sb;
  }

  const delayedChannels = new Set();
  window.addEventListener('app-sdk-ready', () => { for (const start of [...delayedChannels]) start(); });
  function channel(name, handlers) {
    let instance;
    const start = () => {
      if (instance) return;
      const sb = realtimeClient();
      if (!sb) { delayedChannels.add(start); return; }
      delayedChannels.delete(start);
      instance = sb.channel(name, { config: { broadcast: { self: false } } });
      Object.entries(handlers || {}).forEach(([event, fn]) => instance.on('broadcast', { event }, ({ payload }) => fn(payload)));
      const documents = {
        'content-version': 'academy/content.json',
        'schedule-version': 'academy/schedule.json',
        'feedback-version': 'academy/daily-feedback.json'
      };
      if (Object.keys(handlers).some(event => documents[event])) {
        instance.on('postgres_changes', { event: '*', schema: 'public', table: cfg().table || 'academy_progress' }, ({ new: row }) => {
          for (const [event, fn] of Object.entries(handlers)) {
            if (documents[event] && row?.user_id?.startsWith(`doc:${documents[event]}:`)) fn({ rev: Math.max(Date.now(), Number(row.ts) || 0) });
          }
        });
      }
      instance.subscribe();
    };
    start();
    return {
      send: payload => instance?.send(payload) || Promise.resolve('not connected'),
      unsubscribe() { delayedChannels.delete(start); if (instance) realtimeClient()?.removeChannel(instance); instance = null; }
    };
  }

  const reliable = window.AcademyReliable;
  const bases = new Map();
  const cacheKeys = {
    "academy/content.json": "academy-ops-content-v1",
    "academy/schedule.json": "academy-schedule-cache-v1",
    "academy/daily-feedback.json": "academy-daily-feedback-cache-v1"
  };
  const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
  function localFallback(path) {
    try {
      const data = JSON.parse(localStorage.getItem(cacheKeys[path]) || "null");
      return path === "academy/content.json" && data ? { rev: data.rev, data } : data;
    } catch (_) { return null; }
  }
  const table = () => cfg().table || 'academy_progress';
  const remoteId = key => key.startsWith('progress:') ? key.slice(9) : key;
  function decode(row) {
    if (!row) return null;
    const document = row.user_id.startsWith('doc:');
    const payload = row.payload || {};
    const { _saveToken, ...progress } = payload;
    return {
      key: document ? row.user_id : `progress:${row.user_id}`,
      value: document ? payload.value : progress,
      token: document ? payload.token : _saveToken,
      version: row.ts,
      updatedAt: Date.parse(row.updated_at) || 0
    };
  }
  function rowFor(key, value, version, token) {
    return { user_id: remoteId(key), payload: key.startsWith('doc:') ? { value, token } : { ...value, _saveToken: token }, ts: version, updated_at: new Date().toISOString() };
  }
  async function one(key) {
    const rows = await restSelect(table(), { user_id: `eq.${remoteId(key)}`, select: 'user_id,payload,ts,updated_at' });
    return decode(rows[0]);
  }
  async function seed(records) {
    if (!records.length) return;
    const response = await request(restUrl(table(), { on_conflict: 'user_id' }), {
      method: 'POST', appNetworkSafeWrite: true,
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' }),
      body: JSON.stringify(records.map(({ key, value }) => rowFor(key, value, 1, 'migration')))
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }
  async function compareAndSet(key, value, version, token) {
    const row = rowFor(key, value, Math.max(Date.now(), Number(version) + 1), token);
    const params = version == null ? {} : { user_id: `eq.${remoteId(key)}`, ts: `eq.${version}`, select: 'user_id,payload,ts,updated_at' };
    const response = await request(restUrl(table(), params), {
      method: version == null ? 'POST' : 'PATCH',
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(row)
    });
    if (response.status === 409) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = await response.json();
    return decode(rows[0]);
  }
  reliable?.configure({
    one, seed, compareAndSet, legacy: getLegacyJSON,
    async list(prefix, known = []) {
      const index = new Map(known.map(row => [row.key, row]));
      const warm = known.some(row => row.version != null);
      const rows = [];
      for (let offset = 0; ; offset += 500) {
        const page = await restSelect(table(), { user_id: `like.${prefix}*`, select: warm ? 'user_id,ts' : 'user_id,payload,ts,updated_at', order: 'user_id.asc', limit: 500, offset });
        rows.push(...page);
        if (page.length < 500) break;
      }
      if (!warm) return rows.map(decode);
      const changed = rows.filter(row => index.get(row.user_id)?.version !== row.ts);
      for (let start = 0; start < changed.length; start += 80) {
        const ids = changed.slice(start, start + 80).map(row => `"${row.user_id.replaceAll('"', '\\"')}"`);
        const page = await restSelect(table(), { user_id: `in.(${ids.join(',')})`, select: 'user_id,payload,ts,updated_at' });
        page.map(decode).forEach(row => index.set(row.key, row));
      }
      return rows.map(row => index.get(row.user_id)).filter(Boolean);
    }
  });
  async function getJSON(path, options = {}) {
    if (!reliable?.tracked(path)) return getLegacyJSON(path, options);
    let value;
    try { value = await reliable.read(path, options); }
    catch (error) {
      if (!options.cached && navigator.onLine !== false) throw error;
      value = await reliable.read(path, { cached: true });
    }
    if (value == null || (options.cached && !value.rev)) value = localFallback(path) || value;
    bases.set(path, copy(value));
    return value;
  }
  async function putJSON(path, data, options = {}) {
    if (!reliable?.tracked(path)) return putLegacyJSON(path, data);
    const base = options.base !== undefined ? options.base : bases.get(path) ?? localFallback(path);
    const result = await reliable.enqueue(path, data, copy(base));
    bases.set(path, copy(data));
    return result;
  }
  async function saveProgress(id, data, base) {
    return reliable.enqueue(`progress:${id}`, data, base);
  }
  // Progress is already a single database row, unlike the legacy JSON documents.
  return { origin, headers, objectUrl, getJSON, putJSON, saveProgress, restSelect, restUpsert, realtimeClient, channel, reliable };
})();
