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
    const selectedOrigin = origin();
    if (realtimeClient._sb && realtimeClient._origin === selectedOrigin) return realtimeClient._sb;
    realtimeClient._origin = selectedOrigin;
    realtimeClient._sb = window.supabase.createClient(selectedOrigin, cfg().key, {
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
