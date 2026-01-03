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

    async submit(e) {
        if (e && e.preventDefault) e.preventDefault();
        const div = document.getElementById('logContent');
        if (!div) return;

        let content = div.innerHTML.trim();
        // 简单清理空标签
        if (content === '<br>' || content === '') return;

        if (!dbClient || this.isSubmitting) return;

        this.setSubmitting(true);
        try {
            let data = null;
            if (this.editingId) {
                const res = await network.retry(() => dbClient.from('logs').update({ content: content, updated_at: new Date() }).eq('id', this.editingId).select());
                data = res.data;
                if (data && data[0]) {
                    const i = this.logs.findIndex(l => l.id === this.editingId);
                    if (i !== -1) this.logs[i] = data[0];
                }
            } else {
                const res = await network.retry(() => dbClient.from('logs').insert([{ content: content }]).select());
                data = res.data;
                // 不再手动 unshift，交由 setupRealtime 的 INSERT 监听处理，防止重复
            }

            if (data) {
                this.saveCache();
                this.render();
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

    async loadLogs() {
        if (!dbClient) return;

        const result = await network.retry(() =>
            dbClient.from('logs').select('*').order('created_at', { ascending: false })
        );
        const data = result.data;
        if (data) {
            this.logs = data;
            this.saveCache();
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

        if (!this.logs.length) {
            if (timeline) {
                const items = timeline.querySelectorAll('.timeline-item');
                items.forEach(item => item.remove());
            }
            if (empty) empty.classList.remove('hidden');
            return;
        }

        if (empty) empty.classList.add('hidden');
        if (timeline) {
            const html = this.logs.map(log => {
                const t = this.formatTime(log.created_at);
                const edited = log.updated_at && log.updated_at !== log.created_at;
                const tooltip = this.buildTooltip(log.created_at, log.updated_at);

                // 内容处理：兼容旧格式，或者直接显示新格式
                let contentHtml = log.content;
                if (log.content.includes('|||IMG|||')) {
                    contentHtml = this.convertOldFormat(log.content);
                }

                // 给图片添加点击放大功能
                // 由于 contentHtml 现在是字符串，我们可以用简单的正则或者DOM解析来做，
                // 或者在 click 事件委托里做图片放大（更优雅）。
                // 这里先只负责输出 HTML。

                return `
                    <div class="timeline-item">
                        <div class="timeline-dot" data-tooltip="${tooltip}"></div>
                        <div class="timeline-content">
                            <div class="timeline-header">
                                <div style="flex:1" class="timeline-body">
                                    ${contentHtml}
                                </div>
                                <div class="timeline-actions">
                                    <button onclick="logManager.edit('${log.id}')" class="timeline-action">编辑</button>
                                    <button onclick="logManager.showModal('${log.id}')" class="timeline-action">删除</button>
                                </div>
                            </div>
                            <div class="timeline-meta">${t}${edited ? ' · 已编辑' : ''}</div>
                        </div>
                    </div>`;
            }).join('');

            // 保留 loader，只更新日志内容
            const items = timeline.querySelectorAll('.timeline-item');
            items.forEach(item => item.remove());
            timeline.insertAdjacentHTML('beforeend', html);
        }
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
