(function () {
  const SUPABASE_URL = 'https://fmxddvjgkykuqwmasigo.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteGRkdmpna3lrdXF3bWFzaWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwNDMzMjcsImV4cCI6MjA1OTYxOTMyN30.XCU4-03oajGh6M2-PNiBotCZSIDn_nJXkIC0Thjjfqo';
  const PLATFORM_ID = 1;
  const STORAGE_BUCKET = 'course-media';
  const CACHE_KEY = 'courseAdminData';
  const VIDEO_LINE_CACHE_KEY = 'courseVideoLineChoice';
  const VIDEO_LINE_TTL = 6 * 60 * 60 * 1000;
  const CHUNK_SIZE = 1 * 1024 * 1024;
  const UPLOAD_CONCURRENCY = 4;
  const SUPABASE_HOST = new URL(SUPABASE_URL).hostname.split('.')[0];
  const VIDEO_LINE_PROMISES = new Map();
  const DEFAULT_VIDEO_LINES = [
    {
      id: 'supabase_primary',
      label: 'Supabase Primary',
      baseUrl: `${SUPABASE_URL}/storage/v1/object/public`
    },
    {
      id: 'supabase_storage',
      label: 'Supabase Storage',
      baseUrl: `https://${SUPABASE_HOST}.storage.supabase.co/storage/v1/object/public`
    }
  ];

  const DEFAULTS = {
    platformName: '正在载入...',
    platformMeta: '--- 关注者 · --- 单课',
    coverUrl: 'cover.png',
    logoUrl: 'logo.png',
    lessons: [
      { id: 1, name: '中秋节', duration: '25:10', views: 0, src: 'media/1.mp4' },
      { id: 2, name: '植树节', duration: '20:10', views: 0, src: 'media/2.mp4' },
      { id: 3, name: '生日会', duration: '25:30', views: 0, src: 'media/3.mp4' },
      { id: 4, name: '六一儿童节', duration: '23:30', views: 0, src: 'media/4.mp4' },
      { id: 5, name: '春天', duration: '22:45', views: 0, src: 'media/5.mp4' }
    ]
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const now = () => Date.now();

  const getNetworkKey = () => {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return 'unknown';
    const parts = [conn.effectiveType || 'unknown', conn.downlink || '', conn.rtt || '', conn.saveData ? 'save' : 'nosave'];
    return parts.join('|');
  };

  const normalizeLine = (line, index) => {
    if (!line) return null;
    if (typeof line === 'string') {
      const baseUrl = line.endsWith('/storage/v1/object/public') ? line.replace(/\/+$/, '') : `${line.replace(/\/+$/, '')}/storage/v1/object/public`;
      return { id: `line_${index}`, label: `Line ${index + 1}`, baseUrl };
    }
    if (typeof line === 'object') {
      const rawBase = String(line.baseUrl || line.base || '').replace(/\/+$/, '');
      if (!rawBase) return null;
      const baseUrl = rawBase.endsWith('/storage/v1/object/public') ? rawBase : `${rawBase}/storage/v1/object/public`;
      return {
        id: line.id || `line_${index}`,
        label: line.label || line.name || `Line ${index + 1}`,
        baseUrl
      };
    }
    return null;
  };

  const getVideoLines = () => {
    const extraLines = Array.isArray(window.COURSE_VIDEO_CDN_LINES) ? window.COURSE_VIDEO_CDN_LINES : [];
    return [...DEFAULT_VIDEO_LINES, ...extraLines].map(normalizeLine).filter(Boolean);
  };

  const getObjectPathFromUrl = (url) => {
    if (!url) return '';
    try {
      const u = new URL(url, window.location.href);
      const marker = '/storage/v1/object/public/';
      const idx = u.pathname.indexOf(marker);
      if (idx === -1) return '';
      return u.pathname.slice(idx + marker.length);
    } catch (e) {
      return '';
    }
  };

  const buildVideoUrl = (bucket, objectPath, line) => {
    const targetLine = line || getVideoLines()[0];
    if (!targetLine) return '';
    return `${targetLine.baseUrl}/${bucket}/${String(objectPath || '').replace(/^\/+/, '')}`;
  };

  const probeUrl = async (url, timeoutMs = 2500) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const start = performance.now();
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok && response.status !== 206) {
        throw new Error(`HTTP ${response.status}`);
      }
      await response.arrayBuffer();
      return { ok: true, ms: performance.now() - start };
    } finally {
      clearTimeout(timeout);
    }
  };

  const readCachedLine = () => {
    try {
      const raw = localStorage.getItem(`${VIDEO_LINE_CACHE_KEY}:${getNetworkKey()}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.lineId || !parsed.savedAt) return null;
      if (now() - parsed.savedAt > VIDEO_LINE_TTL) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  };

  const writeCachedLine = (lineId) => {
    try {
      localStorage.setItem(`${VIDEO_LINE_CACHE_KEY}:${getNetworkKey()}`, JSON.stringify({ lineId, savedAt: now() }));
    } catch (e) {}
  };

  const pickBestVideoLine = async (sample) => {
    const lines = getVideoLines();
    if (!lines.length) return null;

    const cached = readCachedLine();
    if (cached) {
      const found = lines.find((line) => line.id === cached.lineId);
      if (found) return found;
    }

    const cacheKey = getNetworkKey();
    if (VIDEO_LINE_PROMISES.has(cacheKey)) {
      return VIDEO_LINE_PROMISES.get(cacheKey);
    }

    const task = (async () => {
      const bucket = sample?.bucket || STORAGE_BUCKET;
      const samplePath = sample?.objectPath || sample?.path || getObjectPathFromUrl(sample?.url || '') || '';
      const probePath = samplePath || 'probe.txt';

      const results = await Promise.allSettled(lines.map(async (line) => {
        const probe = buildVideoUrl(bucket, probePath, line);
        const result = await probeUrl(probe);
        return { line, ms: result.ms };
      }));

      const successes = results
        .filter((r) => r.status === 'fulfilled')
        .map((r) => r.value)
        .sort((a, b) => a.ms - b.ms);

      const best = successes[0]?.line || lines[0];
      if (best) writeCachedLine(best.id);
      return best;
    })();

    VIDEO_LINE_PROMISES.set(cacheKey, task);
    try {
      return await task;
    } finally {
      if (VIDEO_LINE_PROMISES.get(cacheKey) === task) {
        VIDEO_LINE_PROMISES.delete(cacheKey);
      }
    }
  };
  const getClient = () => {
    if (window.CourseStore?._client) return window.CourseStore._client;
    if (window.supabase && window.supabase.createClient) {
      window.CourseStore._client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      return window.CourseStore._client;
    }
    return null;
  };

  const storagePath = (folder, filename) => {
    const safeName = String(filename || 'file').trim().replace(/[^\x00-\x7F]/g, '_').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-');
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    return `${folder}/${suffix}-${safeName}`;
  };

  const uploadBlob = async (blob, folder, filename, options = {}) => {
    const client = getClient();
    if (!client) throw new Error('Supabase SDK not loaded');
    const path = storagePath(folder, filename);
    const fullUrl = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', fullUrl);
      xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_KEY}`);
      xhr.setRequestHeader('apikey', SUPABASE_KEY);
      const contentType = options.contentType || blob.type || 'application/octet-stream';
      if (contentType) xhr.setRequestHeader('Content-Type', contentType);
      
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && typeof options.onProgress === 'function') {
          const total = e.total || blob.size || 0;
          const percent = total > 0 ? Math.round((e.loaded / total) * 100) : 0;
          options.onProgress(percent, {
            loaded: e.loaded,
            total
          });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({
            path,
            publicUrl: client.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl
          });
        } else reject(new Error('Upload failed'));
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(blob);
    });
  };

  const isVideoFile = (file) => {
    if (!file) return false;
    const mime = String(file.type || '').toLowerCase();
    if (mime.startsWith('video/')) return true;
    return /\.(mp4|mov|webm|m4v|mkv|avi)$/i.test(String(file.name || ''));
  };

  const uploadChunkedVideo = async (file, folder, options = {}) => {
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
    const uploadRoot = `${folder}/${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const progressByChunk = new Array(totalChunks).fill(0);
    const chunkMeta = new Array(totalChunks);

    const reportProgress = () => {
      if (typeof options.onProgress !== 'function') return;
      const loaded = progressByChunk.reduce((sum, value) => sum + value, 0);
      const pct = file.size > 0 ? Math.min(99, Math.round((loaded / file.size) * 100)) : 0;
      options.onProgress(pct);
    };

    const queue = Array.from({ length: totalChunks }, (_, index) => index);
    const workerCount = Math.min(UPLOAD_CONCURRENCY, totalChunks);

    const worker = async () => {
      while (queue.length) {
        const index = queue.shift();
        if (typeof index !== 'number') continue;
        const start = index * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const ext = String(file.name || 'mp4').split('.').pop() || 'mp4';
        const chunkName = `${String(index + 1).padStart(4, '0')}.${ext}`;
        const chunk = file.slice(start, end, file.type || 'video/mp4');
        const uploaded = await uploadBlob(chunk, `${uploadRoot}/parts`, chunkName, {
          contentType: file.type || 'video/mp4',
          onProgress: (percent, meta) => {
            progressByChunk[index] = meta?.loaded ?? Math.round((percent / 100) * (end - start));
            reportProgress();
          }
        });
        progressByChunk[index] = end - start;
        chunkMeta[index] = {
          index: index + 1,
          size: end - start,
          path: uploaded.path
        };
        reportProgress();
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    if (typeof options.onProgress === 'function') options.onProgress(100);

    const manifest = {
      mode: 'chunked_video',
      bucket: STORAGE_BUCKET,
      chunkSize: CHUNK_SIZE,
      originalName: file.name,
      mimeType: file.type || 'video/mp4',
      totalSize: file.size,
      chunks: chunkMeta
    };

    return {
      manifest,
      src: `chunked:${encodeURIComponent(JSON.stringify(manifest))}`
    };
  };

  const uploadToStorage = async (file, folder, options = {}) => {
    if (isVideoFile(file)) {
      return uploadChunkedVideo(file, folder, options);
    }

    const uploaded = await uploadBlob(file, folder, file.name, options);
    return {
      ...uploaded,
      src: uploaded.publicUrl
    };
  };

  window.CourseStore = {
    defaults: clone(DEFAULTS),
    cloneDefaults: () => clone(DEFAULTS),
    getVideoLines,
    buildVideoUrl: (bucket, objectPath, line) => buildVideoUrl(bucket, objectPath, line),
    getPreferredVideoLine: async (sample) => pickBestVideoLine(sample),
    warmupVideoLine: (sample) => {
      return pickBestVideoLine(sample).catch(() => null);
    },
    resolveStoragePublicUrl: async (src, sample = {}) => {
      if (window.CDNSelector?.getFastestUrl) {
        const rewritten = window.CDNSelector.getFastestUrl(src);
        if (rewritten) return rewritten;
      }
      const bucket = sample.bucket || STORAGE_BUCKET;
      const path = sample.objectPath || getObjectPathFromUrl(src);
      if (!path) return src;
      const line = await pickBestVideoLine({ bucket, objectPath: path, url: src });
      if (!line) return src;
      return buildVideoUrl(bucket, path, line);
    },
    load: async () => {
      const client = getClient();
      if (!client) return JSON.parse(localStorage.getItem(CACHE_KEY)) || DEFAULTS;
      const { data: p } = await client.from('course_platforms').select('*').eq('id', PLATFORM_ID).maybeSingle();
      const { data: l } = await client.from('course_lessons').select('*').eq('platform_id', PLATFORM_ID).order('sort_order');
      if (!p) return DEFAULTS;
      const res = { platformName: p.platform_name, platformMeta: p.platform_meta, coverUrl: p.cover_url, logoUrl: p.logo_url, lessons: l || [] };
      localStorage.setItem(CACHE_KEY, JSON.stringify(res));
      return res;
    },
    save: async (data) => {
      const client = getClient();
      if (!client) {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        return clone(data);
      }
      await client.from('course_platforms').upsert({ id: PLATFORM_ID, platform_name: data.platformName, platform_meta: data.platformMeta, cover_url: data.coverUrl, logo_url: data.logoUrl });
      const keepIds = data.lessons.map((l) => Number(l.id)).filter((id) => Number.isFinite(id));
      const rows = data.lessons.map((l, i) => ({ id: l.id, platform_id: PLATFORM_ID, sort_order: i + 1, name: l.name, duration: l.duration, views: l.views, src: l.src }));
      for (const r of rows) await client.from('course_lessons').upsert(r);
      if (keepIds.length > 0) {
        await client.from('course_lessons').delete().eq('platform_id', PLATFORM_ID).not('id', 'in', `(${keepIds.join(',')})`);
      } else {
        await client.from('course_lessons').delete().eq('platform_id', PLATFORM_ID);
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      return clone(data);
    },
    incrementViews: async (id) => {
      const client = getClient();
      if (!client) return;
      // 简单实现：先查后增并更新 (由于是单ID单行，并发竞态对统计精度影响极小)
      const { data } = await client.from('course_lessons').select('views').eq('id', id).maybeSingle();
      if (data) {
        await client.from('course_lessons').update({ views: (data.views || 0) + 1 }).eq('id', id);
      }
    },
    getPosts: async () => {
      const client = getClient();
      if (!client) return [];
      const { data } = await client.from('course_posts').select('*').eq('platform_id', PLATFORM_ID).order('created_at', { ascending: false });
      return data || [];
    },
    addPost: async (nickname, content) => {
      const client = getClient();
      if (!client) return;
      await client.from('course_posts').insert({ user_nickname: nickname, content, platform_id: PLATFORM_ID });
    },
    deletePost: async (id) => {
      const client = getClient();
      if (!client) return;
      await client.from('course_posts').delete().eq('id', id);
    },
    uploadToStorage,



    get client() { return getClient(); }
  };
})();
