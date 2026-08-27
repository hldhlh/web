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

  async function getJSON(path) {
    const response = await request(`${objectUrl(path)}?t=${Date.now()}`, {
      headers: headers({ "Cache-Control": "no-cache" }),
      cache: "no-store"
    });
    if (response.status === 400 || response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function putJSON(path, data) {
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

  return { origin, headers, objectUrl, getJSON, putJSON, restSelect, restUpsert, realtimeClient, channel };
})();
