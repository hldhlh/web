// Supabase配置
const SUPABASE_URL = 'https://fmxddvjgkykuqwmasigo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteGRkdmpna3lrdXF3bWFzaWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwNDMzMjcsImV4cCI6MjA1OTYxOTMyN30.XCU4-03oajGh6M2-PNiBotCZSIDn_nJXkIC0Thjjfqo';
const CACHE_KEY = 'logs_cache';

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
            status.online();
            if (window.logManager) window.logManager.setupRealtime();
        });
        window.addEventListener('offline', () => {
            this.online = false;
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
    if (isAppInitialized) return;

    dbClient = initSupabase();
    if (!dbClient) {
        status.update('offline', '数据库加载失败');
        const errEl = document.getElementById('errorState');
        const loadEl = document.getElementById('loadingLogs');
        if (errEl) errEl.classList.remove('hidden');
        if (loadEl) loadEl.classList.add('hidden');
        return;
    }

    if (typeof LogManager !== 'undefined') {
        window.logManager = new LogManager();
        isAppInitialized = true;
        status.online();
    }
}

// 监听 CDN 加载信号
window.addEventListener('cdnReady', function () {
    console.log('收到 cdnReady 信号');
    setTimeout(initApp, 50);
});

window.addEventListener('cdnError', function () {
    console.error('收到 cdnError 信号');
    status.update('offline', '服务加载失败');
    const errEl = document.getElementById('errorState');
    const loadEl = document.getElementById('loadingLogs');
    if (errEl) errEl.classList.remove('hidden');
    if (loadEl) loadEl.classList.add('hidden');
});

// 日志管理
class LogManager {
    constructor() {
        this.logs = [];
        this.editingId = null;
        this.channel = null;
        this.isSubmitting = false;
        this.isDeleting = false;
        this.init();
    }

    async init() {
        this.bindEvents();
        this.loadCache();
        this.render();

        try {
            await this.loadLogs();
            this.render();
        } catch (e) {
            console.error('Load logs error:', e);
            status.update('offline', '加载失败');
        }

        if (dbClient) this.setupRealtime();
    }

    loadCache() {
        try {
            const data = localStorage.getItem(CACHE_KEY);
            if (data) this.logs = JSON.parse(data);
        } catch (e) { }
    }

    saveCache() {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(this.logs)); } catch (e) { }
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

        const modal = document.getElementById('deleteModal');
        if (modal) modal.addEventListener('click', e => {
            if (e.target.id === 'deleteModal') this.hideModal();
        });
    }

    async submit(e) {
        e.preventDefault();
        const content = new FormData(e.target).get('content').toString().trim();
        if (!content || !dbClient || this.isSubmitting) return;

        this.setSubmitting(true);
        try {
            if (this.editingId) {
                await network.retry(() => dbClient.from('logs').update({ content: content, updated_at: new Date() }).eq('id', this.editingId));
            } else {
                await network.retry(() => dbClient.from('logs').insert([{ content: content }]));
            }
            this.resetForm();
            status.online();
        } catch (err) {
            console.error('Submit error:', err);
            status.update('offline', '保存失败');
        } finally {
            this.setSubmitting(false);
        }
    }

    setSubmitting(loading) {
        this.isSubmitting = loading;
        const btn = document.getElementById('submitBtn');
        const textarea = document.getElementById('logContent');
        const cancelBtn = document.getElementById('cancelBtn');

        if (btn) {
            btn.disabled = loading;
            if (loading) {
                btn.dataset.originalText = btn.textContent;
                btn.textContent = this.editingId ? '更新中...' : '保存中...';
                btn.classList.add('loading');
            } else {
                btn.textContent = btn.dataset.originalText || '保存';
                btn.classList.remove('loading');
            }
        }
        if (textarea) textarea.disabled = loading;
        if (cancelBtn) cancelBtn.disabled = loading;
    }

    async loadLogs() {
        if (!dbClient) return;
        const loadingEl = document.getElementById('loadingLogs');
        if (loadingEl) loadingEl.classList.remove('hidden');

        try {
            const result = await network.retry(() =>
                dbClient.from('logs').select('*').order('created_at', { ascending: false })
            );
            const data = result.data;
            if (data) {
                this.logs = data;
                this.saveCache();
            }
        } finally {
            if (loadingEl) loadingEl.classList.add('hidden');
        }
    }

    setupRealtime() {
        if (!dbClient) return;
        if (this.channel) dbClient.removeChannel(this.channel);

        const self = this;
        this.channel = dbClient
            .channel('logs')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'logs' }, p => {
                if (p.eventType === 'INSERT' && p.new) {
                    const exists = self.logs.some(l => l.id === p.new.id);
                    if (!exists) self.logs.unshift(p.new);
                } else if (p.eventType === 'UPDATE' && p.new) {
                    const i = self.logs.findIndex(l => l.id === p.new.id);
                    if (i !== -1) self.logs[i] = p.new;
                } else if (p.eventType === 'DELETE' && p.old) {
                    self.logs = self.logs.filter(l => l.id !== p.old.id);
                }
                self.saveCache();
                self.render();
            })
            .subscribe(function (status) {
                if (status === 'SUBSCRIBED') {
                    console.log('Realtime subscribed');
                }
            });
    }

    edit(id) {
        const log = this.logs.find(l => l.id === id);
        if (!log) return;
        const textarea = document.getElementById('logContent');
        const btn = document.getElementById('submitBtn');
        const cancelBtn = document.getElementById('cancelBtn');

        if (textarea) textarea.value = log.content;
        if (btn) btn.textContent = '更新';
        if (cancelBtn) cancelBtn.classList.remove('hidden');
        this.editingId = id;
        if (textarea) textarea.focus();
    }

    resetForm() {
        const form = document.getElementById('logForm');
        const btn = document.getElementById('submitBtn');
        const cancelBtn = document.getElementById('cancelBtn');

        if (form) form.reset();
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
        if (!this.deleteId || !dbClient || this.isDeleting) return;

        this.setDeleting(true);
        try {
            await network.retry(() => dbClient.from('logs').delete().eq('id', this.deleteId));
            this.hideModal();
            status.online();
        } catch (err) {
            console.error('Delete error:', err);
            status.update('offline', '删除失败');
        } finally {
            this.setDeleting(false);
        }
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

    render() {
        const timeline = document.getElementById('timeline');
        const empty = document.getElementById('emptyState');
        const loadingLogs = document.getElementById('loadingLogs');

        if (!this.logs.length) {
            const isLoading = loadingLogs && !loadingLogs.classList.contains('hidden');
            if (timeline) {
                const loader = timeline.querySelector('#loadingLogs');
                timeline.innerHTML = '';
                if (loader) timeline.appendChild(loader);
            }
            if (empty) {
                if (isLoading) empty.classList.add('hidden');
                else empty.classList.remove('hidden');
            }
            return;
        }

        if (empty) empty.classList.add('hidden');
        if (timeline) {
            const html = this.logs.map(log => {
                const t = this.formatTime(log.created_at);
                const edited = log.updated_at && log.updated_at !== log.created_at;
                const tooltip = this.buildTooltip(log.created_at, log.updated_at);
                return `
                    <div class="timeline-item">
                        <div class="timeline-dot" data-tooltip="${tooltip}"></div>
                        <div class="timeline-content">
                            <div class="timeline-header">
                                <p class="timeline-text">${this.escape(log.content)}</p>
                                <div class="timeline-actions">
                                    <button onclick="logManager.edit('${log.id}')" class="timeline-action">编辑</button>
                                    <button onclick="logManager.showModal('${log.id}')" class="timeline-action">删除</button>
                                </div>
                            </div>
                            <div class="timeline-meta">${t}${edited ? ' · 已编辑' : ''}</div>
                        </div>
                    </div>`;
            }).join('');

            const loader = timeline.querySelector('#loadingLogs');
            timeline.innerHTML = html;
            if (loader && !loader.classList.contains('hidden')) {
                timeline.prepend(loader);
            }
        }
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

// 自动检测与重试
document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
        if (!isAppInitialized) {
            console.log('尝试降级初始化...');
            if (window.supabase && window.supabase.createClient) {
                initApp();
            } else {
                setTimeout(function () {
                    if (!isAppInitialized && window.supabase && window.supabase.createClient) {
                        initApp();
                    }
                }, 2000);
            }
        }
    }, 800);
});

// 退出时清理
window.addEventListener('beforeunload', function () {
    if (window.logManager && window.logManager.channel && dbClient) {
        dbClient.removeChannel(window.logManager.channel);
    }
});
