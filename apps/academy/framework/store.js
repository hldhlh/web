window.AcademyStore = (() => {
  function cfg() {
    return window.ACADEMY_CONFIG;
  }

  function origin() {
    const base = cfg().url;
    try {
      const cached = JSON.parse(localStorage.getItem("app-network-best-v2") || "null");
      if (cached && Date.now() - cached.savedAt < 6 * 60 * 60 * 1000 && /^https:\/\//.test(cached.origin)) {
        return cached.origin;
      }
    } catch (_) { }
    return base;
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

  async function getJSON(path) {
    const response = await fetch(`${objectUrl(path)}?t=${Date.now()}`, {
      headers: headers({ "Cache-Control": "no-cache" }),
      cache: "no-store"
    });
    if (response.status === 400 || response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function putJSON(path, data) {
    const response = await fetch(objectUrl(path), {
      method: "POST",
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
    if (realtimeClient._sb) return realtimeClient._sb;
    realtimeClient._sb = window.supabase.createClient(cfg().url, cfg().key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 20 } }
    });
    return realtimeClient._sb;
  }

  function channel(name, handlers) {
    const sb = realtimeClient();
    if (!sb) return null;
    const ch = sb.channel(name, { config: { broadcast: { self: false } } });
    Object.entries(handlers || {}).forEach(([event, fn]) => {
      ch.on("broadcast", { event }, ({ payload }) => fn(payload));
    });
    ch.subscribe();
    return ch;
  }

  return { origin, headers, objectUrl, getJSON, putJSON, realtimeClient, channel };
})();
