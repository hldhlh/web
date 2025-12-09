// Supabase配置
const SUPABASE_URL = 'https://fmxddvjgkykuqwmasigo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteGRkdmpna3lrdXF3bWFzaWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwNDMzMjcsImV4cCI6MjA1OTYxOTMyN30.XCU4-03oajGh6M2-PNiBotCZSIDn_nJXkIC0Thjjfqo';
const CACHE_KEY = 'logs_cache';

let supabase = null;
let isAppInitialized = false;

// 网络状态
const network = {
    online: navigator.onLine,
    maxRetries: 3,
    init() {
        window.addEventListener('online', () => {
            this.online = true;
            window.logManager?.setupRealtime();
        });
        window.addEventListener('offline', () => this.online = false);
    },
    async retry(fn) {
        for (let i = 1; i <= this.maxRetries; i++) {
            try {
                if (!this.online) throw new Error('离线');
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
    if (!window.supabase) return null;
    try {
        return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch { return null; }
}

function initApp() {
    if (isAppInitialized) return;
    supabase = initSupabase();
    if (typeof LogManager !== 'undefined') {
        window.logManager = new LogManager();
        isAppInitialized = true;
    }
}

window.addEventListener('cdnReady', () => setTimeout(initApp, 50));
window.addEventListener('cdnError', () => setTimeout(() => window.supabase && initApp(), 500));

// 日志管理
class LogManager {
    constructor() {
        this.logs = [];
        this.editingId = null;
        this.channel = null;
        this.isSubmitting = false;  // 提交状态锁
        this.isDeleting = false;    // 删除状态锁
        this.init();
    }

    async init() {
        this.bindEvents();
        this.loadCache();
        this.render();
        this.loadLogs().then(() => this.render());
        if (supabase) this.setupRealtime();
    }

    loadCache() {
        try {
            const data = localStorage.getItem(CACHE_KEY);
            if (data) this.logs = JSON.parse(data);
        } catch { }
    }

    saveCache() {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(this.logs)); } catch { }
    }

    bindEvents() {
        document.getElementById('logForm').addEventListener('submit', e => this.submit(e));
        document.getElementById('cancelBtn').addEventListener('click', () => this.resetForm());
        document.getElementById('cancelDelete').addEventListener('click', () => this.hideModal());
        document.getElementById('confirmDelete').addEventListener('click', () => this.doDelete());
        document.getElementById('deleteModal').addEventListener('click', e => {
            if (e.target.id === 'deleteModal') this.hideModal();
        });
    }

    async submit(e) {
        e.preventDefault();
        const content = new FormData(e.target).get('content').trim();
        if (!content || !supabase || this.isSubmitting) return;

        this.setSubmitting(true);
        try {
            if (this.editingId) {
                await network.retry(() => supabase.from('logs').update({ content }).eq('id', this.editingId));
            } else {
                await network.retry(() => supabase.from('logs').insert([{ content }]));
            }
            this.resetForm();
        } catch (err) {
            // 失败时恢复状态
        } finally {
            this.setSubmitting(false);
        }
    }

    // 设置提交状态
    setSubmitting(loading) {
        this.isSubmitting = loading;
        const btn = document.getElementById('submitBtn');
        const textarea = document.getElementById('logContent');
        const cancelBtn = document.getElementById('cancelBtn');

        btn.disabled = loading;
        textarea.disabled = loading;
        cancelBtn.disabled = loading;

        if (loading) {
            btn.dataset.originalText = btn.textContent;
            btn.textContent = this.editingId ? '更新中...' : '保存中...';
            btn.classList.add('loading');
        } else {
            btn.textContent = btn.dataset.originalText || '保存';
            btn.classList.remove('loading');
        }
    }

    async loadLogs() {
        if (!supabase) return;
        try {
            const { data } = await network.retry(() =>
                supabase.from('logs').select('*').order('created_at', { ascending: false })
            );
            if (data) {
                this.logs = data;
                this.saveCache();
            }
        } catch { }
    }

    setupRealtime() {
        if (!supabase) return;
        if (this.channel) supabase.removeChannel(this.channel);

        this.channel = supabase
            .channel('logs')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'logs' }, p => {
                if (p.eventType === 'INSERT' && p.new && !this.logs.find(l => l.id === p.new.id)) {
                    this.logs.unshift(p.new);
                } else if (p.eventType === 'UPDATE' && p.new) {
                    const i = this.logs.findIndex(l => l.id === p.new.id);
                    if (i !== -1) this.logs[i] = p.new;
                } else if (p.eventType === 'DELETE' && p.old) {
                    this.logs = this.logs.filter(l => l.id !== p.old.id);
                }
                this.saveCache();
                this.render();
            })
            .subscribe();
    }

    edit(id) {
        const log = this.logs.find(l => l.id === id);
        if (!log) return;
        document.getElementById('logContent').value = log.content;
        document.getElementById('submitBtn').textContent = '更新';
        document.getElementById('cancelBtn').classList.remove('hidden');
        this.editingId = id;
        document.getElementById('logContent').focus();
    }

    resetForm() {
        document.getElementById('logForm').reset();
        document.getElementById('submitBtn').textContent = '保存';
        document.getElementById('cancelBtn').classList.add('hidden');
        this.editingId = null;
    }

    showModal(id) {
        this.deleteId = id;
        document.getElementById('deleteModal').classList.remove('hidden');
        document.getElementById('deleteModal').classList.add('flex');
    }

    hideModal() {
        document.getElementById('deleteModal').classList.add('hidden');
        document.getElementById('deleteModal').classList.remove('flex');
        this.deleteId = null;
    }

    async doDelete() {
        if (!this.deleteId || !supabase || this.isDeleting) return;

        this.setDeleting(true);
        try {
            await network.retry(() => supabase.from('logs').delete().eq('id', this.deleteId));
            this.hideModal();
        } catch (err) {
            // 失败时恢复状态
        } finally {
            this.setDeleting(false);
        }
    }

    // 设置删除状态
    setDeleting(loading) {
        this.isDeleting = loading;
        const confirmBtn = document.getElementById('confirmDelete');
        const cancelBtn = document.getElementById('cancelDelete');

        confirmBtn.disabled = loading;
        cancelBtn.disabled = loading;

        if (loading) {
            confirmBtn.dataset.originalText = confirmBtn.textContent;
            confirmBtn.textContent = '删除中...';
            confirmBtn.classList.add('loading');
        } else {
            confirmBtn.textContent = confirmBtn.dataset.originalText || '删除';
            confirmBtn.classList.remove('loading');
        }
    }

    render() {
        const timeline = document.getElementById('timeline');
        const empty = document.getElementById('emptyState');

        if (!this.logs.length) {
            timeline.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }

        empty.classList.add('hidden');
        timeline.innerHTML = this.logs.map(log => {
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
    }

    // 构建 tooltip 内容
    buildTooltip(createdAt, updatedAt) {
        const created = this.formatFullDate(createdAt);
        const edited = updatedAt && updatedAt !== createdAt;
        if (edited) {
            const updated = this.formatFullDate(updatedAt);
            return `创建: ${created}&#10;修改: ${updated}`;
        }
        return `创建: ${created}`;
    }

    // 格式化完整日期时间
    formatFullDate(ts) {
        const d = new Date(ts);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hour = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hour}:${min}`;
    }

    formatTime(ts) {
        const t = new Date(ts), now = new Date();
        const diff = now - t;
        const m = Math.floor(diff / 60000);
        const h = Math.floor(diff / 3600000);
        const d = Math.floor(diff / 86400000);
        if (d > 0) return `${d}天前`;
        if (h > 0) return `${h}小时前`;
        if (m > 0) return `${m}分钟前`;
        return '刚刚';
    }

    escape(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }
}

window.addEventListener('beforeunload', () => {
    if (window.logManager?.channel && supabase) supabase.removeChannel(window.logManager.channel);
});

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => !isAppInitialized && window.supabase && initApp(), 300);
});
