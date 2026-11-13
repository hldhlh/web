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

  // One transport owner per Auto Office runtime (embedded tools inherit it).
  // Channel handles survive transport replacement; SDK callbacks are generation
  // checked so late deliveries from an old network cannot mutate current state.
  const subscriptions = new Set();
  const topics = new Map();
  let rawClient = null, rawOrigin = null, networkResetTimer;
  let transportStarts = 0, recoveries = 0;
  let probeTimer = null, probing = false, heartbeatRttMs = null, reusedConnections = 0;
  let transportStartedAt = 0, firstSubscriptionMs = null;
  const online = () => navigator.onLine !== false;
  const selectedRealtimeOrigin = () => window.APP_NETWORK?.realtimeOrigin || window.APP_NETWORK?.projectOrigin || cfg().url;
  const safely = (fn, ...args) => { try { Promise.resolve(fn?.(...args)).catch(() => {}); } catch (_) {} };
  function transportClient() {
    if (!rawClient && window.supabase?.createClient && online()) {
      rawOrigin = selectedRealtimeOrigin();
      transportStarts++;
      transportStartedAt = Date.now(); firstSubscriptionMs = null;
      rawClient = window.supabase.createClient(rawOrigin, cfg().key, {
        appNetworkRealtimeDirect: true,
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { timeout: 12000, params: { eventsPerSecond: 20 } }
      });
      const created = rawClient;
      created.realtime?.onHeartbeat?.((status, latency) => {
        if (created !== rawClient) return;
        if (status === 'ok') {
          if (Number.isFinite(latency)) heartbeatRttMs = latency;
          if (probing) { reusedConnections++; cancelProbe(); }
        } else if (probing && ['error', 'timeout', 'disconnected'].includes(status)) {
          cancelProbe(); resetConnections();
        }
      });
    }
    return rawClient;
  }
  function managedChannel(name, options) {
    const bindings = [], pending = new Map();
    let instance = null, owner = null, callback, retryTimer, joinTimer;
    let generation = 0, attempts = 0, active = false, stopped = false, joined = false, presence;
    const clearTimers = () => { clearTimeout(retryTimer); clearTimeout(joinTimer); retryTimer = joinTimer = null; };
    const detach = () => {
      generation++; joined = false;
      const old = instance, client = owner;
      instance = null; owner = null;
      if (old) safely(() => client.removeChannel(old));
    };
    const retry = () => {
      if (stopped || retryTimer || !online()) return;
      const delay = Math.min(30000, 500 * 2 ** Math.min(attempts++, 6)) + Math.floor(Math.random() * 250);
      retryTimer = setTimeout(() => { retryTimer = null; detach(); start(); }, delay);
    };
    const start = () => {
      if (stopped || !active || instance || !online()) return;
      const client = transportClient();
      if (!client) return; // SDK ready event resumes registrations.
      owner = client; instance = client.channel(name, options);
      const current = instance, token = ++generation;
      const valid = () => !stopped && instance === current && generation === token;
      for (const [type, filter, fn] of bindings) current.on(type, filter, (...args) => { if (valid()) safely(fn, ...args); });
      joinTimer = setTimeout(() => {
        if (!valid() || joined) return;
        safely(callback, 'TIMED_OUT'); retry();
      }, 14000);
      current.subscribe(status => {
        if (!valid()) return;
        joined = status === 'SUBSCRIBED';
        if (joined) {
          if (firstSubscriptionMs === null) firstSubscriptionMs = Date.now() - transportStartedAt;
          clearTimers(); attempts = 0;
          if (presence) safely(() => current.track(presence));
          for (const data of pending.values()) safely(() => current.send(data));
          pending.clear();
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          clearTimeout(joinTimer); retry();
          if (attempts >= 2 && window.APP_NETWORK?.reportRealtimeFailure?.(rawOrigin)) resetConnections();
        }
        safely(callback, status);
        retimePolls();
      });
    };
    const handle = {
      managed: true,
      on(type, filter, fn) { bindings.push([type, filter, fn]); return handle; },
      subscribe(fn) { if (active) return handle; callback = fn; active = true; start(); return handle; },
      send(data) {
        if (stopped) return Promise.resolve('closed');
        if (joined && instance) return Promise.resolve(instance.send(data));
        // Only invalidation broadcasts are retained; coalesce by event, bounded.
        if (data?.type === 'broadcast') {
          pending.set(data.event, data);
          if (pending.size > 64) pending.delete(pending.keys().next().value);
        }
        return Promise.resolve('queued');
      },
      track(data) { presence = data; return joined ? Promise.resolve(instance.track(data)) : Promise.resolve('queued'); },
      untrack() { presence = null; return joined ? Promise.resolve(instance.untrack()) : Promise.resolve(); },
      presenceState() { return joined && instance ? instance.presenceState() : {}; },
      unsubscribe() { stopped = true; active = false; clearTimers(); detach(); pending.clear(); presence = null; subscriptions.delete(handle); return Promise.resolve('ok'); },
      restart() { if (stopped) return; clearTimers(); attempts = 0; detach(); safely(callback, online() ? 'CONNECTING' : 'CLOSED'); start(); },
      start,
      get connected() { return joined; }
    };
    subscriptions.add(handle);
    return handle;
  }
  const clientFacade = {
    managed: true,
    channel: managedChannel,
    removeChannel: channel => channel.unsubscribe(),
    removeAllChannels: () => Promise.all([...subscriptions].map(channel => channel.unsubscribe()))
  };
  function realtimeClient() { return clientFacade; }
  function resetConnections() {
    cancelProbe();
    clearTimeout(networkResetTimer);
    networkResetTimer = setTimeout(() => {
      recoveries++;
      const previous = rawClient;
      rawClient = null; rawOrigin = null;
      for (const channel of [...subscriptions]) channel.restart();
      // Never block a replacement transport on an old unsubscribe acknowledgement.
      if (previous) safely(() => previous.removeAllChannels());
      refreshPolls();
      window.dispatchEvent(new CustomEvent('academy-realtime-reset'));
    }, 180);
  }
  function cancelProbe() { clearTimeout(probeTimer); probeTimer = null; probing = false; }
  function recoverConnections() {
    refreshPolls();
    if (probing) return;
    const socket = rawClient?.realtime;
    if (!online() || !socket?.isConnected?.() || !socket.onHeartbeat || !socket.sendHeartbeat) {
      resetConnections(); return;
    }
    // Visibility and connection events do not prove a working socket is dead.
    // Validate it with one heartbeat rather than paying DNS/TLS/join again.
    probing = true;
    probeTimer = setTimeout(() => { cancelProbe(); resetConnections(); }, 3000);
    // Sending another heartbeat while one is pending makes this SDK close the
    // socket. Wait for its existing acknowledgement instead.
    if (!socket.pendingHeartbeatRef) {
      try { Promise.resolve(socket.sendHeartbeat()).catch(() => { if (probing) { cancelProbe(); resetConnections(); } }); }
      catch (_) { cancelProbe(); resetConnections(); }
    }
  }
  window.addEventListener('app-network-recovered', recoverConnections);
  window.addEventListener('offline', resetConnections);
  window.addEventListener('online', recoverConnections);
  window.addEventListener('app-network-change', () => {
    if (rawClient && selectedRealtimeOrigin() !== rawOrigin) recoverConnections();
  });
  for (const event of ['app-sdk-ready', 'academy-sdk-ready']) {
    window.addEventListener(event, () => { for (const channel of subscriptions) channel.start(); });
  }

  // One deadline timer for all network reconciliation jobs. A job never overlaps
  // itself; a recovery during an in-flight read schedules one follow-up pass.
  const polls = new Set();
  let pollTimer;
  const visible = () => !window.document?.hidden;
  function armPolls() {
    clearTimeout(pollTimer); pollTimer = null;
    if (!online() || !visible()) return;
    const due = [...polls].filter(job => !job.running).map(job => job.due);
    if (due.length) pollTimer = setTimeout(tickPolls, Math.max(0, Math.min(...due) - Date.now()));
  }
  function tickPolls() {
    pollTimer = null;
    if (!online() || !visible()) return;
    for (const job of polls) {
      if (job.running || job.due > Date.now()) continue;
      job.running = true;
      Promise.resolve().then(job.run).then(() => { job.failures = 0; }, () => { job.failures++; }).finally(() => {
        job.running = false;
        if (!polls.has(job)) return;
        const interval = typeof job.interval === 'function' ? job.interval() : job.interval;
        job.due = job.again ? Date.now() : Date.now() + Math.min(120000, Math.max(1000, interval) * 2 ** Math.min(job.failures, 3));
        job.again = false; armPolls();
      });
    }
    armPolls();
  }
  function retimePolls() {
    for (const job of polls) {
      if (!job.running && typeof job.interval === 'function') job.due = Math.min(job.due, Date.now() + Math.max(1000, job.interval()));
    }
    armPolls();
  }
  function connectionStatus() {
    return { origin: rawOrigin, online: online(), transportStarts, recoveries,
      heartbeatRttMs, firstSubscriptionMs, reusedConnections, probing,
      subscriptions: subscriptions.size, connected: [...subscriptions].filter(channel => channel.connected).length,
      pollingJobs: polls.size, runningReads: [...polls].filter(job => job.running).length };
  }
  function refreshPolls() {
    for (const job of polls) { if (job.running) job.again = true; else job.due = Date.now(); }
    armPolls();
  }
  function poll(run, { interval = 30000, immediate = false } = {}) {
    const job = { run, interval, running: false, failures: 0, again: false,
      due: immediate ? Date.now() : Date.now() + (typeof interval === 'function' ? interval() : interval) };
    polls.add(job); armPolls();
    return { stop() { polls.delete(job); armPolls(); }, refresh() { if (job.running) job.again = true; else job.due = Date.now(); armPolls(); } };
  }
  window.document?.addEventListener('visibilitychange', () => { if (visible()) refreshPolls(); else armPolls(); });

  function channel(name, handlers = {}) {
    let topic = topics.get(name);
    if (!topic) {
      topic = { listeners: new Set(), connected: false };
      topics.set(name, topic);
      topic.channel = managedChannel(name, { config: { broadcast: { self: false } } });
      topic.channel.on('broadcast', { event: '*' }, ({event, payload}) => {
        for (const listener of topic.listeners) safely(listener[event], payload);
      });
      const documents = { 'content-version': 'academy/content.json', 'schedule-version': 'academy/schedule.json', 'feedback-version': 'academy/daily-feedback.json' };
      // Content is one row; schedule/feedback are split across rows, so retain
      // prefix matching for those documents (Realtime has no LIKE filter).
      const docEvent = Object.keys(handlers).find(event => documents[event]);
      if (docEvent) topic.channel.on('postgres_changes', {
        event: '*', schema: 'public', table: cfg().table || 'academy_progress',
        ...(docEvent === 'content-version' ? {filter: `user_id=eq.doc:${documents[docEvent]}:value`} : {})
      }, ({new: row, old}) => {
        const record = row?.user_id ? row : old;
        if (!record?.user_id?.startsWith(`doc:${documents[docEvent]}:`)) return;
        for (const listener of topic.listeners) safely(listener[docEvent], {rev: Math.max(Date.now(), Number(record.ts) || 0)});
      });
      topic.channel.subscribe(status => {
        topic.connected = status === 'SUBSCRIBED';
        for (const listener of topic.listeners) {
          safely(listener.connection, topic.connected);
          if (topic.connected) safely(listener.connected);
        }
      });
    }
    topic.listeners.add(handlers);
    if (topic.connected) { safely(handlers.connection, true); safely(handlers.connected); }
    return {
      get connected() { return topic.connected; },
      send: payload => topic.channel.send(payload),
      unsubscribe() { topic.listeners.delete(handlers); if (!topic.listeners.size) { topic.channel.unsubscribe(); topics.delete(name); } }
    };
  }

  const reliable = window.AcademyReliable;
  const bases = new Map();
  const reads = new Map();
  const generations = new Map();
  function invalidateReads(path) {
    generations.set(path, (generations.get(path) || 0) + 1);
    reads.delete(`${path}:cached`);
    reads.delete(`${path}:remote`);
  }
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
    const feedback = key.startsWith('doc:academy/daily-feedback.json:');
    // Session credentials go only to the configured project, never network mirrors.
    const target = new URL(restUrl(table(), params));
    const project = new URL(cfg().url);
    if (feedback) { target.protocol = project.protocol; target.host = project.host; }
    const send = feedback ? (url, init) => window.fetch(url, init) : request;
    const response = await send(target.toString(), {
      method: version == null ? 'POST' : 'PATCH',
      cache: 'no-store',
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation',
        ...(feedback ? {
          'x-academy-user-id': window.AcademyAuth?.session?.id || '',
          'x-academy-session-token': window.AcademyAuth?.session?.sessionToken || ''
        } : {})
      }),
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
    const key = `${path}:${options.cached ? 'cached' : 'remote'}`;
    let pending = reads.get(key);
    if (!pending) {
      const generation = generations.get(path) || 0;
      pending = (async () => {
        let value;
        try { value = await reliable.read(path, options); }
        catch (error) {
          if (!options.cached && navigator.onLine !== false) throw error;
          value = await reliable.read(path, { cached: true });
        }
        if (value == null || (options.cached && !value.rev)) value = localFallback(path) || value;
        if ((generations.get(path) || 0) === generation) bases.set(path, copy(value));
        return value;
      })();
      reads.set(key, pending);
      const clear = () => { if (reads.get(key) === pending) reads.delete(key); };
      pending.then(clear, clear);
    }
    // Share only in-flight work, never mutable objects or a stale time-based cache.
    return copy(await pending);
  }
  async function putJSON(path, data, options = {}) {
    if (!reliable?.tracked(path)) return putLegacyJSON(path, data);
    const base = options.base !== undefined ? options.base : bases.get(path) ?? localFallback(path);
    invalidateReads(path);
    const result = await reliable.enqueue(path, data, copy(base));
    invalidateReads(path);
    bases.set(path, copy(data));
    return result;
  }
  async function saveProgress(id, data, base) {
    return reliable.enqueue(`progress:${id}`, data, base);
  }
  // Progress is already a single database row, unlike the legacy JSON documents.
  return { origin, headers, objectUrl, getJSON, putJSON, saveProgress, restSelect, restUpsert, realtimeClient, channel, poll, connectionStatus, reliable };
})();
