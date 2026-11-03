(() => {
  'use strict';
  const pending = new Map();
  const digest = async blob => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('');
  const key = value => new URL('/__dimension_cache__/' + encodeURIComponent(value), location.origin).href;
  async function storage() { try { return await caches.open('dimension-images-v1'); } catch (_) { return null; } }
  async function put(source, blob, expected) {
    const hash = await digest(blob);
    if (expected && hash !== expected) throw new Error('图片校验失败，请重试');
    const cache = await storage();
    if (cache) try {
      await cache.put(key('blob:' + hash), new Response(blob));
      await cache.put(key('source:' + source), new Response(hash));
      const keys = await cache.keys();
      // Bound disk use; missing aliases simply trigger a fresh download.
      for (const request of keys.slice(0, Math.max(0, keys.length - 240))) await cache.delete(request);
    } catch (_) { /* Cache quota and private mode must not block viewing. */ }
    return blob;
  }
  async function read(source, expected, download) {
    const cache = await storage();
    if (cache) try {
      const alias = expected ? null : await cache.match(key('source:' + source));
      const hash = expected || (alias && await alias.text());
      const hit = hash && await cache.match(key('blob:' + hash));
      if (hit) {
        const blob = await hit.blob();
        if (await digest(blob) === hash) return blob;
        await cache.delete(key('blob:' + hash));
      }
    } catch (_) {}
    return put(source, await download(), expected);
  }
  window.DimensionImageCache = { digest, put, get(source, hash, download) {
    const id = source + ':' + (hash || '');
    if (!pending.has(id)) pending.set(id, read(source, hash, download).finally(() => pending.delete(id)));
    return pending.get(id);
  } };
})();
