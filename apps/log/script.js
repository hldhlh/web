// Supabase配置
const SUPABASE_URL = window.LOG_CONFIG?.url || 'https://fmxddvjgkykuqwmasigo.supabase.co';
const SUPABASE_ANON_KEY = window.LOG_CONFIG?.key || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteGRkdmpna3lrdXF3bWFzaWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwNDMzMjcsImV4cCI6MjA1OTYxOTMyN30.XCU4-03oajGh6M2-PNiBotCZSIDn_nJXkIC0Thjjfqo';
const CACHE_KEY = 'logs_cache';
const PENDING_KEY = 'logs_pending_ops';
const PAGE_SIZE = 20;
const CACHE_LIMIT = 40;
const PREVIEW_CHARS = 800;

let dbClient = null; // 改名以避免与全局库变量名冲突
let isAppInitialized = false;

// 状态显示
const status = {
    update(type, text) {
        const el = document.getElementById('statusIndicator');
        if (!el) return;
        el.className = 'status-indicator ' + type;
        const textEl = el.querySelector('.status-text');
        if (textEl) textEl.textContent = text;
    },
    online() { this.update('online', '实时同步'); },
    offline() { this.update('offline', '离线模式'); },
    loading(text) { this.update('loading', text || '同步中...'); }
};

// 网络状态
const network = {
    online: navigator.onLine,
    maxRetries: 3,
    init() {
        window.addEventListener('online', () => {
            this.online = true;
            if (!dbClient && window.supabase && window.supabase.createClient) initApp();
            else if (window.logManager) window.logManager.connect(dbClient);
        });
        window.addEventListener('offline', () => {
            this.online = false;
            if (window.logManager) window.logManager.isConnected = false;
            status.offline();
        });
    },
    async retry(fn) {
        for (let i = 1; i <= this.maxRetries; i++) {
            try {
                if (!navigator.onLine) throw new Error('离线');
                return await fn();
            } catch (e) {
                if (i === this.maxRetries) throw e;
                await new Promise(r => setTimeout(r, 1000 * i));
            }
        }
    }
};
network.init();

// 初始化
function initSupabase() {
    // 全局库提供的对象是 window.supabase
    if (!window.supabase || !window.supabase.createClient) return null;
    try {
        return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
        console.error('Supabase init error:', e);
        return null;
    }
}

function initApp() {
    startApp();

    // DOMContentLoaded、CDN ready 和网络恢复都可能触发初始化，只创建一个客户端。
    if (dbClient) return;

    dbClient = initSupabase();
    if (!dbClient) {
        status.update('offline', '本地可用');
        return;
    }

    if (window.logManager) window.logManager.connect(dbClient);
}

function startApp() {
    if (isAppInitialized || typeof LogManager === 'undefined') return;
    window.logManager = new LogManager();
    isAppInitialized = true;
}

// 监听 CDN 加载信号
window.addEventListener('cdnReady', function () {
    console.log('收到 cdnReady 信号');
    setTimeout(initApp, 50);
});

window.addEventListener('cdnError', function () {
    console.error('收到 cdnError 信号');
    startApp();
    status.update('offline', '本地可用');
});

// 日志管理
class LogManager {
    constructor() {
        this.logs = [];
        this.pendingOps = [];
        this.editingId = null;
        this.channel = null;
        this.isSubmitting = false;
        this.isDeleting = false;
        this.isConnected = false;
        this.isSyncing = false;
        this.isLoadingLogs = false;
        this.hasMore = false;
        this.oldestRemoteCreatedAt = null;
        this.currentPage = 1;
        this.totalLogs = 0;
        this.totalPages = 1;
        this.deletedLocalIds = new Set();
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadCache();
        this.loadPending();
        this.render();
        status.update(navigator.onLine ? 'loading' : 'offline', navigator.onLine ? '本地就绪' : '离线模式');

        if (dbClient) this.connect(dbClient);
    }

    loadCache() {
        try {
            const data = localStorage.getItem(CACHE_KEY);
            if (data) this.logs = JSON.parse(data);
        } catch (e) { }
    }

    saveCache() {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(this.logs.slice(0, CACHE_LIMIT).map(log => this.compactForCache(log))));
        } catch (e) { }
    }

    compactForCache(log) {
        if (this.isLocalId(log.id)) return log;
        if (!log.content || log.content.length <= PREVIEW_CHARS) return log;
        return Object.assign({}, log, {
            content: log.content.slice(0, PREVIEW_CHARS),
            isPreview: true,
            fullLoaded: false
        });
    }

    loadPending() {
        try {
            const data = localStorage.getItem(PENDING_KEY);
            if (data) this.pendingOps = JSON.parse(data);
        } catch (e) {
            this.pendingOps = [];
        }
    }

    savePending() {
        try { localStorage.setItem(PENDING_KEY, JSON.stringify(this.pendingOps)); } catch (e) { }
    }

    connect(client) {
        if (!client || !navigator.onLine) {
            this.isConnected = false;
            status.offline();
            return;
        }

        dbClient = client;
        if (this.isConnected) return;
        this.isConnected = true;
        status.loading('后台同步');
        this.setupRealtime();
        // 首屏读取和离线操作补传互不依赖，直接并行。
        this.loadLogs(true);
        this.flushPending();
    }

    bindEvents() {
        const form = document.getElementById('logForm');
        if (form) form.addEventListener('submit', e => this.submit(e));

        const cancelBtn = document.getElementById('cancelBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.resetForm());

        const cancelDel = document.getElementById('cancelDelete');
        if (cancelDel) cancelDel.addEventListener('click', () => this.hideModal());

        const confirmDel = document.getElementById('confirmDelete');
        if (confirmDel) confirmDel.addEventListener('click', () => this.doDelete());

        const prevPageBtn = document.getElementById('prevPageBtn');
        if (prevPageBtn) prevPageBtn.addEventListener('click', () => this.goToPage(this.currentPage - 1));

        const nextPageBtn = document.getElementById('nextPageBtn');
        if (nextPageBtn) nextPageBtn.addEventListener('click', () => this.goToPage(this.currentPage + 1));

        const modal = document.getElementById('deleteModal');
        if (modal) modal.addEventListener('click', e => {
            if (e.target.id === 'deleteModal') this.hideModal();
        });

        // 粘贴事件
        const contentDiv = document.getElementById('logContent');
        if (contentDiv) {
            contentDiv.addEventListener('paste', e => this.handlePaste(e));
        }

        // Ctrl+S 快捷键
        window.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                e.stopPropagation();
                this.submit(e);
            }
        });
    }

    handlePaste(e) {
        // 简单处理：如果是纯文本，让浏览器默认处理（或者清理样式）；如果是图片，拦截
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;

        let hasImage = false;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                hasImage = true;
                const blob = items[i].getAsFile();
                this.processImage(blob);
                e.preventDefault();
                break; // 一次只处理一张或第一张图片
            }
        }

        if (!hasImage) {
            // 如果是纯文本，为了防止粘贴进带样式的HTML（如Word），可以强制转为纯文本
            // 这里为了简单，先让浏览器默认处理。如果需要纯文本：
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
        }
    }

    processImage(blob) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target.result;
            // 在光标处插入图片
            // 使用 execCommand 兼容性好，虽已废弃但仍稳健
            // 或者用 Range API
            const imgHtml = `<img src="${base64}"><div><br></div>`;
            document.execCommand('insertHTML', false, imgHtml);
        };
        reader.readAsDataURL(blob);
    }

    makeLocalId() {
        return 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    }

    isLocalId(id) {
        return typeof id === 'string' && id.indexOf('local-') === 0;
    }

    makeOp(type, payload) {
        return Object.assign({ opId: 'op-' + Date.now() + '-' + Math.random().toString(36).slice(2), type }, payload);
    }

    queueOp(op) {
        if (op.type === 'insert') {
            const existing = this.pendingOps.findIndex(item => item.type === 'insert' && item.localId === op.localId);
            if (existing !== -1) this.pendingOps[existing] = op;
            else this.pendingOps.push(op);
        } else if (op.type === 'update') {
            if (this.isLocalId(op.id)) {
                const insertOp = this.pendingOps.find(item => item.type === 'insert' && item.localId === op.id);
                if (insertOp) insertOp.content = op.content;
            } else {
                this.pendingOps = this.pendingOps.filter(item => !(item.type === 'update' && item.id === op.id));
                this.pendingOps.push(op);
            }
        } else if (op.type === 'delete') {
            if (this.isLocalId(op.id)) {
                this.pendingOps = this.pendingOps.filter(item => item.localId !== op.id && item.id !== op.id);
            } else {
                this.pendingOps = this.pendingOps.filter(item => !(item.id === op.id && item.type === 'update'));
                this.pendingOps.push(op);
            }
        }
        this.savePending();
    }

    removeQueuedOp(op) {
        this.pendingOps = this.pendingOps.filter(item => item.opId !== op.opId);
        this.savePending();
    }

    async syncOp(op, fromQueue) {
        if (!dbClient || !navigator.onLine) {
            if (!fromQueue) this.queueOp(op);
            status.update('offline', '待同步');
            return;
        }

        try {
            const data = await this.executeOp(op);
            if (fromQueue) this.removeQueuedOp(op);
            this.applyRemoteResult(op, data);
            status.online();
        } catch (err) {
            console.error('Sync op error:', err);
            if (!fromQueue) this.queueOp(op);
            status.update('offline', '待同步');
        }
    }

    async executeOp(op) {
        if (op.type === 'insert') {
            const res = await network.retry(() => dbClient.from('logs').insert([{ content: op.content }]).select());
            return res.data;
        }

        if (op.type === 'update') {
            if (this.isLocalId(op.id)) return null;
            const res = await network.retry(() => dbClient.from('logs').update({ content: op.content }).eq('id', op.id).select());
            return res.data;
        }

        if (op.type === 'delete') {
            if (this.isLocalId(op.id)) return null;
            await network.retry(() => dbClient.from('logs').delete().eq('id', op.id));
            return null;
        }
    }

    applyRemoteResult(op, data) {
        if (op.type === 'insert' && data && data[0]) {
            const remote = data[0];
            const localIndex = this.logs.findIndex(l => l.id === op.localId);
            const remoteIndex = this.logs.findIndex(l => l.id === remote.id);

            if (this.deletedLocalIds.has(op.localId)) {
                if (localIndex !== -1) this.logs.splice(localIndex, 1);
                this.deletedLocalIds.delete(op.localId);
                this.syncOp(this.makeOp('delete', { id: remote.id }), false);
                this.saveCache();
                this.render();
                return;
            }

            if (remoteIndex !== -1 && localIndex !== -1) {
                this.logs.splice(localIndex, 1);
            } else if (localIndex !== -1) {
                this.logs[localIndex] = remote;
            } else if (remoteIndex === -1) {
                this.logs.unshift(remote);
            }
        } else if (op.type === 'update' && data && data[0]) {
            const i = this.logs.findIndex(l => l.id === op.id);
            if (i !== -1) this.logs[i] = data[0];
        }

        this.saveCache();
        this.render();
    }

    async flushPending() {
        if (this.isSyncing || !this.pendingOps.length || !dbClient || !navigator.onLine) return;
        this.isSyncing = true;
        status.loading('后台同步');

        const ops = [...this.pendingOps];
        for (const op of ops) {
            if (!this.pendingOps.some(item => item.opId === op.opId)) continue;
            await this.syncOp(op, true);
        }

        this.isSyncing = false;
        if (this.pendingOps.length) status.update('offline', '待同步');
        else status.online();
    }

    async submit(e) {
        if (e && e.preventDefault) e.preventDefault();
        const div = document.getElementById('logContent');
        if (!div) return;

        let content = div.innerHTML.trim();
        // 简单清理空标签
        if (content === '<br>' || content === '') return;

        if (this.isSubmitting) return;

        if (this.editingId) {
            const id = this.editingId;
            const i = this.logs.findIndex(l => l.id === id);
            if (i !== -1) {
                this.logs[i] = Object.assign({}, this.logs[i], { content: content, updated_at: new Date().toISOString() });
            }
            this.resetForm();
            this.saveCache();
            this.render();
            const op = this.makeOp('update', { id, content });
            this.syncOp(op, false);
            return;
        }

        const now = new Date().toISOString();
        const localId = this.makeLocalId();
        const log = { id: localId, content, created_at: now, updated_at: now };
        this.logs.unshift(log);
        this.resetForm();
        this.saveCache();
        this.render();

        const op = this.makeOp('insert', { localId, content });
        this.syncOp(op, false);
    }

    setSubmitting(loading) {
        this.isSubmitting = loading;
        const btn = document.getElementById('submitBtn');
        const contentDiv = document.getElementById('logContent');
        const cancelBtn = document.getElementById('cancelBtn');

        if (btn) {
            btn.disabled = loading;
            if (loading) {
                btn.dataset.originalText = btn.textContent;
                btn.textContent = this.editingId ? '更新中...' : '保存中...';
                btn.classList.add('loading');
            } else {
                btn.textContent = this.editingId ? '更新' : '保存';
                btn.classList.remove('loading');
            }
        }
        if (contentDiv) {
            contentDiv.contentEditable = !loading;
            if (loading) contentDiv.classList.add('disabled'); // 需要CSS配合
            else contentDiv.classList.remove('disabled');
        }
        if (cancelBtn) cancelBtn.disabled = loading;
    }

    async loadLogs(silent) {
        return this.loadPage(1, silent);
    }

    async loadPage(page, silent) {
        if (!dbClient || this.isLoadingLogs) return;
        this.isLoadingLogs = true;
        this.updatePagination();

        try {
            const targetPage = Math.max(1, page || 1);
            const result = await network.retry(() => this.selectLogsPage(targetPage));
            if (result && result.error) throw result.error;
            const data = Array.isArray(result.data) ? result.data.map(row => this.normalizeListRow(row)) : [];
            if (data) {
                const localLogs = targetPage === 1 ? this.logs.filter(log => this.isLocalId(log.id)) : [];
                const localIds = new Set(localLogs.map(log => log.id));
                this.logs = localLogs.concat(data.filter(log => !localIds.has(log.id)));
                this.oldestRemoteCreatedAt = data.length ? data[data.length - 1].created_at : null;
                this.currentPage = targetPage;
                this.totalLogs = Number.isFinite(result.count) ? result.count : Math.max(this.totalLogs, (targetPage - 1) * PAGE_SIZE + data.length);
                this.totalPages = Math.max(1, Math.ceil(this.totalLogs / PAGE_SIZE));
                this.hasMore = this.currentPage < this.totalPages;
                if (targetPage === 1) this.saveCache();
                this.render();
            }
            if (result && result.countPromise) {
                result.countPromise.then(count => {
                    if (!Number.isFinite(count)) return;
                    this.totalLogs = count;
                    this.totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
                    this.hasMore = this.currentPage < this.totalPages;
                    this.updatePagination();
                });
            }
            if (!this.pendingOps.length) status.online();
        } catch (e) {
            console.error('Load logs error:', e);
            if (!silent) status.update('offline', '加载失败');
            else status.update('offline', '本地可用');
        } finally {
            this.isLoadingLogs = false;
            this.updatePagination();
        }
    }

    selectLogsPage(page) {
        const bootstrap = window.LOG_BOOTSTRAP;
        if (page === 1 && bootstrap && !bootstrap.used) {
            bootstrap.used = true;
            return bootstrap.page.then(result => {
                if (result && !result.error) return Object.assign({}, result, { countPromise: bootstrap.count });
                return this.selectLogsPageFromClient(page);
            });
        }

        return this.selectLogsPageFromClient(page);
    }

    selectLogsPageFromClient(page) {
        const from = (Math.max(1, page || 1) - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        return dbClient
            .from('logs_list')
            .select('id,content_preview,content_size,created_at,updated_at', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);
    }

    normalizeListRow(row) {
        if (Object.prototype.hasOwnProperty.call(row, 'content_preview')) {
            const size = Number(row.content_size || 0);
            return {
                id: row.id,
                content: row.content_preview || '',
                contentSize: size,
                isPreview: size > PREVIEW_CHARS,
                fullLoaded: size <= PREVIEW_CHARS,
                created_at: row.created_at,
                updated_at: row.updated_at
            };
        }
        return row;
    }

    async loadMoreLogs() {
        return this.goToPage(this.currentPage + 1);
    }

    async goToPage(page) {
        const targetPage = Math.max(1, Math.min(page, this.totalPages || 1));
        if (targetPage === this.currentPage || this.isLoadingLogs) return;
        return this.loadPage(targetPage, false);
    }

    async fetchFullLog(id) {
        if (!dbClient || this.isLocalId(id)) return this.logs.find(l => l.id === id) || null;
        const result = await network.retry(() =>
            dbClient
                .from('logs')
                .select('content,updated_at')
                .eq('id', id)
                .limit(1)
        );
        const full = result && Array.isArray(result.data) ? result.data[0] : null;
        if (!full) return null;

        const log = this.logs.find(l => l.id === id);
        if (!log) return null;
        log.content = full.content || '';
        log.updated_at = full.updated_at || log.updated_at;
        log.isPreview = false;
        log.fullLoaded = true;
        return log;
    }

    async ensureFullLog(id) {
        const log = this.logs.find(l => l.id === id);
        if (!log) return null;
        if (!log.isPreview) return log;

        status.loading('加载完整内容');
        try {
            const full = await this.fetchFullLog(id);
            if (!this.pendingOps.length) status.online();
            return full;
        } catch (e) {
            console.error('Fetch full log error:', e);
            status.update('offline', '加载失败');
            return null;
        }
    }

    async expand(id) {
        const log = await this.ensureFullLog(id);
        if (!log) return;
        this.saveCache();
        this.render();
    }

    applyRealtimeChange(p) {
        if (p.eventType === 'INSERT' && p.new) {
            const exists = this.logs.some(l => l.id === p.new.id);
            this.totalLogs += exists ? 0 : 1;
            this.totalPages = Math.max(1, Math.ceil(this.totalLogs / PAGE_SIZE));
            this.hasMore = this.currentPage < this.totalPages;
            if (!exists && this.currentPage === 1) {
                this.logs.unshift(this.normalizeFullRowForList(p.new));
                if (this.logs.length > PAGE_SIZE) this.logs.pop();
            }
        } else if (p.eventType === 'UPDATE' && p.new) {
            const i = this.logs.findIndex(l => l.id === p.new.id);
            if (i !== -1) this.logs[i] = this.normalizeFullRowForList(p.new);
        } else if (p.eventType === 'DELETE' && p.old) {
            this.totalLogs = Math.max(0, this.totalLogs - 1);
            this.totalPages = Math.max(1, Math.ceil(this.totalLogs / PAGE_SIZE));
            this.hasMore = this.currentPage < this.totalPages;
            this.logs = this.logs.filter(l => l.id !== p.old.id);
        }

        this.saveCache();
        this.render();
    }

    setupRealtime() {
        if (!dbClient || !navigator.onLine) return;
        if (this.channel) dbClient.removeChannel(this.channel);

        this.channel = dbClient
            .channel('logs')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'logs' }, p => {
                this.applyRealtimeChange(p);
            })
            .subscribe(syncStatus => {
                if (syncStatus === 'SUBSCRIBED') {
                    if (!this.pendingOps.length) status.online();
                } else if (syncStatus === 'CHANNEL_ERROR' || syncStatus === 'TIMED_OUT' || syncStatus === 'CLOSED') {
                    status.update('offline', '本地可用');
                }
            });
    }

    async edit(id) {
        const log = await this.ensureFullLog(id);
        if (!log) return;
        const div = document.getElementById('logContent');
        const btn = document.getElementById('submitBtn');
        const cancelBtn = document.getElementById('cancelBtn');

        // 需要兼容旧格式
        let content = log.content;
        if (content.includes('|||IMG|||')) {
            content = this.convertOldFormat(content);
        }

        if (div) div.innerHTML = content;

        if (btn) btn.textContent = '更新';
        if (cancelBtn) cancelBtn.classList.remove('hidden');
        this.editingId = id;
        if (div) div.focus();
    }

    resetForm() {
        const div = document.getElementById('logContent');
        const btn = document.getElementById('submitBtn');
        const cancelBtn = document.getElementById('cancelBtn');

        if (div) div.innerHTML = '';

        if (btn) btn.textContent = '保存';
        if (cancelBtn) cancelBtn.classList.add('hidden');
        this.editingId = null;
    }

    showModal(id) {
        this.deleteId = id;
        const modal = document.getElementById('deleteModal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    }

    hideModal() {
        const modal = document.getElementById('deleteModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
        this.deleteId = null;
    }

    async doDelete() {
        if (!this.deleteId || this.isDeleting) return;

        const id = this.deleteId;
        if (this.isLocalId(id)) this.deletedLocalIds.add(id);
        this.logs = this.logs.filter(l => l.id !== id);
        this.hideModal();
        this.saveCache();
        this.render();

        const op = this.makeOp('delete', { id });
        this.syncOp(op, false);
    }

    setDeleting(loading) {
        this.isDeleting = loading;
        const confirmBtn = document.getElementById('confirmDelete');
        const cancelBtn = document.getElementById('cancelDelete');

        if (confirmBtn) {
            confirmBtn.disabled = loading;
            if (loading) {
                confirmBtn.dataset.originalText = confirmBtn.textContent;
                confirmBtn.textContent = '删除中...';
                confirmBtn.classList.add('loading');
            } else {
                confirmBtn.textContent = confirmBtn.dataset.originalText || '删除';
                confirmBtn.classList.remove('loading');
            }
        }
        if (cancelBtn) cancelBtn.disabled = loading;
    }

    updateLoadMore() {
        this.updatePagination();
    }

    updatePagination() {
        const pagination = document.getElementById('pagination');
        const tabs = document.getElementById('pageTabs');
        const prev = document.getElementById('prevPageBtn');
        const next = document.getElementById('nextPageBtn');
        if (!pagination || !tabs || !prev || !next) return;

        const shouldShow = this.totalPages > 1;
        if (shouldShow) pagination.classList.remove('hidden');
        else pagination.classList.add('hidden');

        prev.disabled = this.isLoadingLogs || this.currentPage <= 1;
        next.disabled = this.isLoadingLogs || this.currentPage >= this.totalPages;
        tabs.innerHTML = this.buildPageTabs();
    }

    buildPageTabs() {
        const pages = this.visiblePages();
        return pages.map(page => {
            if (page === 'gap') return '<span class="page-gap">...</span>';
            const active = page === this.currentPage ? ' active' : '';
            const disabled = this.isLoadingLogs || page === this.currentPage ? ' disabled' : '';
            return `<button type="button" onclick="logManager.goToPage(${page})" class="page-tab${active}"${disabled}>${page}</button>`;
        }).join('');
    }

    visiblePages() {
        const total = this.totalPages || 1;
        const current = this.currentPage || 1;
        if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

        const pages = [1];
        const start = Math.max(2, current - 1);
        const end = Math.min(total - 1, current + 1);
        if (start > 2) pages.push('gap');
        for (let page = start; page <= end; page++) pages.push(page);
        if (end < total - 1) pages.push('gap');
        pages.push(total);
        return pages;
    }

    buildLogHtml(log) {
        const t = this.formatTime(log.created_at);
        const edited = log.updated_at && log.updated_at !== log.created_at;
        const tooltip = this.buildTooltip(log.created_at, log.updated_at);

        let contentHtml = log.isPreview ? this.renderPreviewContent(log) : (log.content || '');
        if (!log.isPreview && log.content && log.content.includes('|||IMG|||')) {
            contentHtml = this.convertOldFormat(log.content);
        }
        const expandBtn = log.isPreview ? `<button onclick="logManager.expand('${log.id}')" class="timeline-action">展开</button>` : '';

        return `
            <div class="timeline-item">
                <div class="timeline-dot" data-tooltip="${tooltip}"></div>
                <div class="timeline-content">
                    <div class="timeline-header">
                        <div style="flex:1" class="timeline-body">${contentHtml}</div>
                        <div class="timeline-actions">
                            ${expandBtn}
                            <button onclick="logManager.edit('${log.id}')" class="timeline-action">编辑</button>
                            <button onclick="logManager.showModal('${log.id}')" class="timeline-action">删除</button>
                        </div>
                    </div>
                    <div class="timeline-meta">${t}${edited ? ' · 已编辑' : ''}</div>
                </div>
            </div>`;
    }

    renderPreviewContent(log) {
        const text = this.cleanPreviewText(log.content || '');
        const size = log.contentSize ? Math.ceil(log.contentSize / 1024) + 'KB' : '较大';
        const body = text ? this.escape(text) : '内容较大';
        return `${body}<div class="preview-note">预览内容 · 完整日志约 ${size}</div>`;
    }

    cleanPreviewText(content) {
        return content
            .replace(/\|\|\|IMG\|\|\|[\s\S]*$/g, '\n[图片]')
            .replace(/<img\b[^>]*>/gi, '[图片]')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(div|p|li|h[1-6])>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/data:image\/[^\s"'<>]+/gi, '[图片数据]')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    normalizeFullRowForList(row) {
        const content = row.content || '';
        const size = content.length;
        if (size <= PREVIEW_CHARS) return row;
        return Object.assign({}, row, {
            content: content.slice(0, PREVIEW_CHARS),
            contentSize: size,
            isPreview: true,
            fullLoaded: false
        });
    }

    appendLogs(logs) {
        if (!logs.length) {
            this.updateLoadMore();
            return;
        }

        const timeline = document.getElementById('timeline');
        const empty = document.getElementById('emptyState');
        if (empty) empty.classList.add('hidden');
        if (timeline) {
            timeline.insertAdjacentHTML('beforeend', logs.map(log => this.buildLogHtml(log)).join(''));
        }
        this.updateLoadMore();
    }

    render() {
        const timeline = document.getElementById('timeline');
        const empty = document.getElementById('emptyState');

        if (!this.logs.length) {
            if (timeline) {
                const items = timeline.querySelectorAll('.timeline-item');
                items.forEach(item => item.remove());
            }
            if (empty) empty.classList.remove('hidden');
            this.updateLoadMore();
            return;
        }

        if (empty) empty.classList.add('hidden');
        if (timeline) {
            const html = this.logs.map(log => this.buildLogHtml(log)).join('');

            // 保留 loader，只更新日志内容
            const items = timeline.querySelectorAll('.timeline-item');
            items.forEach(item => item.remove());
            timeline.insertAdjacentHTML('beforeend', html);
        }
        this.updateLoadMore();
    }

    convertOldFormat(content) {
        const parts = content.split('|||IMG|||');
        const text = this.escape(parts[0]);
        let html = text ? `<p>${text}</p>` : '';

        if (parts.length > 1) {
            try {
                const images = JSON.parse(parts[1]);
                if (Array.isArray(images)) {
                    images.forEach(src => {
                        html += `<img src="${src}">`;
                    });
                }
            } catch (e) { }
        }
        return html;
    }

    buildTooltip(createdAt, updatedAt) {
        const created = this.formatFullDate(createdAt);
        const edited = updatedAt && updatedAt !== createdAt;
        if (edited) {
            const updated = this.formatFullDate(updatedAt);
            return '创建: ' + created + '&#10;修改: ' + updated;
        }
        return '创建: ' + created;
    }

    formatFullDate(ts) {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return '未知时间';
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hour = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return year + '-' + month + '-' + day + ' ' + hour + ':' + min;
    }

    formatTime(ts) {
        const t = new Date(ts);
        if (isNaN(t.getTime())) return '未知时间';
        const now = new Date();
        const diff = now - t;
        const m = Math.floor(diff / 60000);
        const h = Math.floor(diff / 3600000);
        const d = Math.floor(diff / 86400000);
        if (d > 0) return d + '天前';
        if (h > 0) return h + '小时前';
        if (m > 0) return m + '分钟前';
        return '刚刚';
    }

    escape(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }
}

// 先启动本地 UI，数据库连接由 CDN ready 事件后台接入
document.addEventListener('DOMContentLoaded', function () {
    startApp();
    if (window.supabase && window.supabase.createClient) initApp();
});

if (typeof document.readyState === 'string' && document.readyState !== 'loading') {
    startApp();
    if (window.supabase && window.supabase.createClient) initApp();
}

// 退出时清理
window.addEventListener('beforeunload', function () {
    if (window.logManager && window.logManager.channel && dbClient) {
        dbClient.removeChannel(window.logManager.channel);
    }
});
