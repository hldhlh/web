(function (root) {
  'use strict';
  function sourcesFor(original, manifest) {
    const item = (manifest?.videos || []).find(v => v.original === original);
    const candidates = [...(item?.sources || []), { url: original, label: '原画' }];
    const seen = new Set();
    return candidates.filter(s => {
      try { if (new URL(s.url).protocol !== 'https:' || seen.has(s.url)) return false; }
      catch (_) { return false; }
      seen.add(s.url); return true;
    });
  }
  class Recovery {
    constructor(video, sources, report, clock = () => Date.now()) {
      this.video = video; this.sources = sources; this.report = report; this.clock = clock;
      this.index = Math.max(0, sources.findIndex(s => s.url === video.src));
      this.retries = 0; this.failed = new Set(); this.wanted = !video.paused;
      this.savedTime = video.currentTime || 0; this.savedRate = video.playbackRate || 1;
      this.loading = false; this.deadline = 0; this.disposed = false; this.listeners = [];
      this.on('play', () => { this.wanted = true; this.wait(); });
      this.on('pause', () => { if (!this.loading) { this.wanted = false; this.deadline = 0; } });
      this.on('waiting', () => { if (this.wanted) this.wait(); });
      this.on('stalled', () => { if (this.wanted || this.loading) this.wait(); });
      this.on('timeupdate', () => {
        if (video.currentTime > this.savedTime + .1) {
          this.savedTime = video.currentTime; this.deadline = 0;
          this.report('', this.index);
        }
      });
      this.on('playing', () => { this.loading = false; this.deadline = 0; this.report('', this.index); });
      this.on('seeking', () => { if (!this.loading) this.savedTime = video.currentTime; });
      this.on('ended', () => { this.wanted = false; this.deadline = 0; });
      this.on('loadedmetadata', () => {
        if (!this.loading) return;
        if (this.savedTime > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(this.savedTime, Math.max(0, video.duration - .25));
        video.playbackRate = this.savedRate;
        this.loading = false;
        if (this.wanted) this.play(); else { this.deadline = 0; this.report('', this.index); }
      });
      this.on('error', () => this.recover());
    }
    on(type, fn) { this.video.addEventListener(type, fn); this.listeners.push([type, fn]); }
    wait() { if (!this.deadline) this.deadline = this.clock() + 15000; }
    tick() { if (!this.disposed && this.deadline && this.clock() >= this.deadline) this.recover(); }
    play() {
      const p = this.video.play();
      if (p?.catch) p.catch(() => {
        if (this.disposed) return;
        this.wanted = false; this.deadline = 0;
        this.report('已准备好，请点击播放。', this.index);
      });
    }
    switchTo(index, manual = false) {
      if (this.disposed || !this.sources[index]) return;
      if (!this.loading) {
        this.savedTime = Number.isFinite(this.video.currentTime) ? this.video.currentTime : this.savedTime;
        this.savedRate = this.video.playbackRate || 1;
        this.wanted = !this.video.paused || this.wanted;
      }
      if (manual) { this.retries = 0; this.failed.clear(); }
      this.index = index; this.loading = true; this.deadline = this.clock() + 15000;
      this.report('正在加载' + this.sources[index].label + '视频…', index);
      this.video.src = this.sources[index].url; this.video.load();
    }
    recover() {
      if (this.disposed) return;
      this.deadline = 0;
      this.failed.add(this.index);
      // Prefer the smallest rendition or an independently hosted mirror when provided.
      const next = this.sources.findIndex((_, i) => !this.failed.has(i));
      if (next >= 0) return this.switchTo(next);
      if (this.retries < 1) { this.retries++; this.failed.clear(); return this.switchTo(0); }
      this.loading = false; this.wanted = false;
      this.report('视频暂时无法加载，请重试，或在浏览器中打开视频。', this.index, true);
    }
    dispose() { this.disposed = true; this.listeners.forEach(([t, f]) => this.video.removeEventListener(t, f)); this.deadline = 0; }
  }
  if (typeof module !== 'undefined') module.exports = { sourcesFor, Recovery };
  if (!root.document) return;
  const script = document.currentScript;
  const manifestUrl = new URL('./video-sources.json', script?.src || location.href);
  let manifest = {}, active = null;
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 5000);
  const ready = fetch(manifestUrl, { signal: abort.signal, cache: 'no-cache' })
    .then(r => r.ok ? r.json() : {}).then(x => { manifest = x; }).catch(() => {}).finally(() => clearTimeout(timeout));
  function attach() {
    const video = document.getElementById('lesson-video');
    if (active?.video === video) return;
    if (active) { active.dispose(); active = null; }
    if (!video) return;
    const original = video.getAttribute('src');
    ready.then(() => {
      if (!video.isConnected || active?.video === video) return;
      const sources = sourcesFor(original, manifest); if (!sources.length) return;
      const box = document.createElement('div'); box.className = 'video-network-controls';
      const label = document.createElement('label'); label.textContent = '画质';
      const select = document.createElement('select'); select.setAttribute('aria-label', '视频画质');
      sources.forEach((s, i) => { const o = document.createElement('option'); o.value = i; o.textContent = s.label; select.append(o); });
      label.append(select);
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重新加载';
      const direct = document.createElement('a'); direct.textContent = '直接打开视频'; direct.target = '_blank'; direct.rel = 'noopener';
      const status = document.createElement('span'); status.setAttribute('role', 'status');
      box.append(label, retry, direct, status); video.closest('.video-player-card')?.append(box);
      const controller = new Recovery(video, sources, (message, index, exhausted) => {
        status.textContent = message; select.value = String(index); direct.href = sources[index].url;
        retry.hidden = !exhausted; direct.hidden = !exhausted;
      });
      active = controller;
      const dispose = controller.dispose.bind(controller);
      controller.dispose = () => { dispose(); box.remove(); };
      select.value = String(controller.index); retry.hidden = true; direct.hidden = true;
      select.addEventListener('change', () => controller.switchTo(Number(select.value), true));
      retry.addEventListener('click', () => { controller.wanted = true; controller.switchTo(0, true); });
      // Start small on every network; no carrier or country is assumed to be fast.
      if (video.currentTime === 0 && video.paused && sources[0].url !== original) controller.switchTo(0);
      else if (video.error) controller.recover();
      else if (video.readyState === 0) { controller.loading = true; controller.wait(); }
    });
  }
  new MutationObserver(attach).observe(document.body, { childList: true, subtree: true });
  setInterval(() => { if (active?.video.isConnected) active.tick(); }, 1000);
  addEventListener('online', () => { if (active && active.video.error) active.switchTo(0, true); });
  attach();
})(typeof window === 'undefined' ? globalThis : window);
