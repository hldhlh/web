(function () {
  const SUPABASE_URL = 'https://fmxddvjgkykuqwmasigo.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteGRkdmpna3lrdXF3bWFzaWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwNDMzMjcsImV4cCI6MjA1OTYxOTMyN30.XCU4-03oajGh6M2-PNiBotCZSIDn_nJXkIC0Thjjfqo';
  const PLATFORM_ID = 1;
  const STORAGE_BUCKET = 'course-media';
  const CACHE_KEY = 'courseAdminData';

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

  const uploadToStorage = async (file, folder, options = {}) => {
    const client = getClient();
    if (!client) throw new Error('Supabase SDK not loaded');
    const path = storagePath(folder, file.name);
    const fullUrl = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', fullUrl);
      xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_KEY}`);
      xhr.setRequestHeader('apikey', SUPABASE_KEY);
      if (file.type) xhr.setRequestHeader('Content-Type', file.type);
      
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && typeof options.onProgress === 'function') {
          options.onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ publicUrl: client.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl });
        } else reject(new Error('Upload failed'));
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(file);
    });
  };

  window.CourseStore = {
    defaults: clone(DEFAULTS),
    cloneDefaults: () => clone(DEFAULTS),
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
      if (!client) return localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      await client.from('course_platforms').upsert({ id: PLATFORM_ID, platform_name: data.platformName, platform_meta: data.platformMeta, cover_url: data.coverUrl, logo_url: data.logoUrl });
      const rows = data.lessons.map((l, i) => ({ id: l.id, platform_id: PLATFORM_ID, sort_order: i + 1, name: l.name, duration: l.duration, views: l.views, src: l.src }));
      for (const r of rows) await client.from('course_lessons').upsert(r);
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
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
