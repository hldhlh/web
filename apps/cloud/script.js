// Supabase Configuration - 智能连接管理
const SUPABASE_CONFIG = {
    // 主节点配置
    primaryUrl: 'https://fmxddvjgkykuqwmasigo.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteGRkdmpna3lrdXF3bWFzaWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwNDMzMjcsImV4cCI6MjA1OTYxOTMyN30.XCU4-03oajGh6M2-PNiBotCZSIDn_nJXkIC0Thjjfqo',

    // 如果有备用代理节点可以添加在这里
    // 例如: Cloudflare Worker 代理, Vercel Edge Function 代理等
    proxyUrls: [
        // 'https://your-cf-worker.workers.dev/supabase',
        // 'https://your-vercel-proxy.vercel.app/api/supabase',
    ],

    // 连接配置
    timeout: 15000,          // 请求超时 15秒
    retryCount: 3,           // 最大重试次数
    retryDelay: 1000,        // 重试延迟 1秒
    healthCheckInterval: 30000, // 健康检查间隔 30秒
};

// 当前使用的 URL
let currentSupabaseUrl = SUPABASE_CONFIG.primaryUrl;
const supabaseUrl = currentSupabaseUrl;
const supabaseKey = SUPABASE_CONFIG.key;

// 连接状态监测
const ConnectionMonitor = {
    isOnline: true,
    lastSuccessTime: Date.now(),
    failCount: 0,
    latencyHistory: [],

    // 记录成功请求
    recordSuccess(latency) {
        this.isOnline = true;
        this.lastSuccessTime = Date.now();
        this.failCount = 0;
        this.latencyHistory.push({ time: Date.now(), latency, success: true });
        if (this.latencyHistory.length > 50) this.latencyHistory.shift();
    },

    // 记录失败请求
    recordFailure(error) {
        this.failCount++;
        this.latencyHistory.push({ time: Date.now(), latency: null, success: false, error: error?.message });
        if (this.latencyHistory.length > 50) this.latencyHistory.shift();

        // 连续失败3次认为离线
        if (this.failCount >= 3) {
            this.isOnline = false;
            console.warn('[Supabase] 连接可能已中断');
        }
    },

    // 获取平均延迟
    getAvgLatency() {
        const successful = this.latencyHistory.filter(h => h.success && h.latency);
        if (successful.length === 0) return null;
        return Math.round(successful.reduce((a, b) => a + b.latency, 0) / successful.length);
    },

    // 获取连接状态报告
    getStatus() {
        return {
            isOnline: this.isOnline,
            failCount: this.failCount,
            avgLatency: this.getAvgLatency(),
            lastSuccess: this.lastSuccessTime ? new Date(this.lastSuccessTime).toLocaleTimeString() : 'Never'
        };
    }
};

// 创建带有自定义 fetch 的 Supabase 客户端
const customFetch = async (url, options = {}) => {
    let lastError = null;

    // 重试逻辑
    for (let attempt = 0; attempt <= SUPABASE_CONFIG.retryCount; attempt++) {
        // 每次尝试创建新的 AbortController
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SUPABASE_CONFIG.timeout);
        const startTime = performance.now();

        try {
            // 合并 signal - 如果 options 中已有 signal，需要处理
            const fetchOptions = {
                ...options,
                signal: controller.signal
            };

            const response = await fetch(url, fetchOptions);

            clearTimeout(timeoutId);

            const latency = Math.round(performance.now() - startTime);
            ConnectionMonitor.recordSuccess(latency);

            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            lastError = error;

            // 如果是用户主动取消（不是超时），直接抛出
            if (error.name === 'AbortError' && !controller.signal.aborted) {
                throw error;
            }

            ConnectionMonitor.recordFailure(error);

            // 如果还有重试机会，等待后重试
            if (attempt < SUPABASE_CONFIG.retryCount) {
                const delay = SUPABASE_CONFIG.retryDelay * Math.pow(2, attempt); // 指数退避
                console.log(`[Supabase] 请求失败，${delay}ms 后重试 (${attempt + 1}/${SUPABASE_CONFIG.retryCount})`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    throw lastError;
};

// 创建 Supabase 客户端 - 优化配置
const client = supabase.createClient(supabaseUrl, supabaseKey, {
    db: {
        schema: 'public'
    },
    global: {
        headers: {
            'x-client-info': 'cloud-space/1.0'
        },
        fetch: customFetch  // 使用自定义 fetch
    },
    realtime: {
        params: {
            eventsPerSecond: 10
        }
    }
});

// 暴露连接状态监测器供调试
window.SupabaseConnectionMonitor = ConnectionMonitor;

// 定期健康检查
setInterval(async () => {
    if (document.hidden) return; // 页面不可见时跳过

    try {
        const startTime = performance.now();
        await client.from('files').select('id').limit(1);
        const latency = Math.round(performance.now() - startTime);
        ConnectionMonitor.recordSuccess(latency);
    } catch (error) {
        ConnectionMonitor.recordFailure(error);
    }
}, SUPABASE_CONFIG.healthCheckInterval);

// 数据库缓存管理器
const DBCache = {
    _cache: new Map(),
    _timestamps: new Map(),
    TTL: 30000, // 缓存有效期 30 秒

    set(key, data) {
        this._cache.set(key, data);
        this._timestamps.set(key, Date.now());
    },

    get(key) {
        const timestamp = this._timestamps.get(key);
        if (!timestamp || Date.now() - timestamp > this.TTL) {
            this._cache.delete(key);
            this._timestamps.delete(key);
            return null;
        }
        return this._cache.get(key);
    },

    invalidate(key) {
        if (key) {
            this._cache.delete(key);
            this._timestamps.delete(key);
        } else {
            this._cache.clear();
            this._timestamps.clear();
        }
    },

    // 预热缓存
    async warmup() {
        try {
            const { data, error } = await client
                .from('files')
                .select('*')
                .order('created_at', { ascending: false });

            if (!error && data) {
                this.set('files_all', data);
                return data;
            }
        } catch (e) {
            // 静默处理预热失败
        }
        return null;
    }
};

// 请求去重和批处理
const RequestBatcher = {
    _pending: new Map(),

    // 去重请求 - 相同请求只发送一次
    async dedupe(key, requestFn) {
        if (this._pending.has(key)) {
            return this._pending.get(key);
        }

        const promise = requestFn().finally(() => {
            this._pending.delete(key);
        });

        this._pending.set(key, promise);
        return promise;
    }
};

// State
let files = [];
let selectedFile = null; // Store currently selected file for context menu
let currentView = 'files'; // 'files', 'shared', 'trash'
let searchQuery = ''; // Current search query
let currentFolderId = null; // Current folder ID (null for root)

const fileIcons = {
    fig: '<svg viewBox="0 0 24 24"><path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z"/><path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z"/><path d="M12 12.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z"/><path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z"/><path d="M12 12.5V16h3.5a3.5 3.5 0 0 0 0-7H12z"/></svg>',
    pdf: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="#fbbf24" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
    zip: '<svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    doc: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    img: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    xls: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="17"/><line x1="16" y1="13" x2="8" y2="17"/></svg>',
    default: '<svg viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>'
};

// DOM Elements
const fileGrid = document.getElementById('fileGrid');
const sidebar = document.getElementById('sidebar');
const menuBtn = document.getElementById('menuBtn');
const overlay = document.getElementById('overlay');
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const toast = document.getElementById('toast');
const navItems = document.querySelectorAll('.nav-item');
const contextMenu = document.getElementById('contextMenu');
const newFolderAction = document.getElementById('newFolderAction');
const renameAction = document.getElementById('renameAction');
const downloadAction = document.getElementById('downloadAction');
const deleteAction = document.getElementById('deleteAction');
const shareAction = document.getElementById('shareAction');
const copyLinkAction = document.getElementById('copyLinkAction');
const restoreAction = document.getElementById('restoreAction');
const sectionTitle = document.querySelector('.section-title');
const searchInput = document.querySelector('.search-bar input');
const breadcrumbNav = document.getElementById('breadcrumbNav');

// View Elements
const fileView = document.getElementById('fileView');
const taskView = document.getElementById('taskView');
const taskListElement = document.getElementById('taskList');
const taskBadge = document.getElementById('taskBadge');
const emptyTaskState = document.getElementById('emptyTaskState');

// Task Manager Logic
class TaskManager {
    constructor() {
        this.tasks = new Map();
    }

    addTask(type, name, size, callbacks) {
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const task = {
            id,
            type, // 'upload' or 'download'
            name,
            size,
            progress: 0,
            speed: '0 KB/s',
            status: 'pending', // pending, running, paused, completed, error
            callbacks, // { start, pause, resume, cancel }
        };

        this.tasks.set(id, task);
        this.renderTask(task);
        this.updateBadge();
        this.updateEmptyState();

        // Start task immediately
        if (task.callbacks.start) {
            task.status = 'running';
            task.callbacks.start(id);
            this.updateTaskUI(id);
        }

        return id;
    }

    updateProgress(id, percentage, speedStr, loadedStr) {
        const task = this.tasks.get(id);
        if (!task) return;

        task.progress = percentage;
        if (speedStr) task.speed = speedStr;
        if (loadedStr) task.loadedStr = loadedStr;
        task.status = 'running';

        this.updateTaskUI(id);
    }

    completeTask(id) {
        const task = this.tasks.get(id);
        if (!task) return;

        task.progress = 100;
        task.status = 'completed';
        task.speed = '';
        this.updateTaskUI(id);
        this.updateBadge(); // Completed tasks might not count towards badge if we only count active ones
    }

    errorTask(id, message) {
        const task = this.tasks.get(id);
        if (!task) return;

        task.status = 'error';
        task.error = message;
        this.updateTaskUI(id);
    }

    pauseTask(id) {
        const task = this.tasks.get(id);
        if (!task || task.status !== 'running') return;

        if (task.callbacks.pause) {
            task.callbacks.pause();
            task.status = 'paused';
            this.updateTaskUI(id);
        }
    }

    resumeTask(id) {
        const task = this.tasks.get(id);
        if (!task || task.status !== 'paused') return;

        if (task.callbacks.resume) {
            task.callbacks.resume();
            task.status = 'running';
            this.updateTaskUI(id);
        }
    }

    cancelTask(id) {
        const task = this.tasks.get(id);
        if (!task) return;

        if (task.callbacks.cancel) {
            task.callbacks.cancel();
        }

        // Remove from UI with animation
        const el = document.getElementById(`task-${id}`);
        if (el) {
            el.style.opacity = '0';
            setTimeout(() => {
                this.tasks.delete(id);
                el.remove();
                this.updateBadge();
                this.updateEmptyState();
            }, 300);
        }
    }

    updateBadge() {
        // Count active tasks (running or paused)
        const activeCount = Array.from(this.tasks.values()).filter(t =>
            t.status === 'running' || t.status === 'paused' || t.status === 'pending'
        ).length;

        taskBadge.textContent = activeCount;
        taskBadge.style.display = activeCount > 0 ? 'inline-block' : 'none';
    }

    updateEmptyState() {
        if (this.tasks.size === 0) {
            emptyTaskState.style.display = 'block';
        } else {
            emptyTaskState.style.display = 'none';
        }
    }

    renderTask(task) {
        const el = document.createElement('div');
        el.className = 'task-item';
        el.id = `task-${task.id}`;

        const typeIcon = task.type === 'upload'
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

        el.innerHTML = `
            <div class="task-info-row">
                <div class="task-name-group">
                    <div class="task-type-icon">
                        ${typeIcon}
                    </div>
                    <div>
                        <div class="task-name" title="${task.name}">${task.name}</div>
                        <div class="task-meta">${task.size}</div>
                    </div>
                </div>
                <div class="task-actions">
                    <button class="task-action-btn pause-btn" title="暂停/继续">
                        <svg viewBox="0 0 24 24" class="pause-icon" style="display:none" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                        <svg viewBox="0 0 24 24" class="play-icon" style="display:none" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    </button>
                    <button class="task-action-btn cancel-btn" title="取消">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </div>
            <div class="task-progress-container">
                <div class="task-progress-bar" style="width: 0%"></div>
            </div>
            <div class="task-status-row">
                <span class="status-text">等待中...</span>
                <span class="speed-text"></span>
            </div>
        `;

        // Bind events
        const pauseBtn = el.querySelector('.pause-btn');
        pauseBtn.addEventListener('click', () => {
            if (task.status === 'running') this.pauseTask(task.id);
            else if (task.status === 'paused') this.resumeTask(task.id);
        });

        const cancelBtn = el.querySelector('.cancel-btn');
        cancelBtn.addEventListener('click', () => this.cancelTask(task.id));

        // Insert at top
        taskListElement.insertBefore(el, taskListElement.firstChild);
        this.updateTaskUI(task.id);
    }

    updateTaskUI(id) {
        const task = this.tasks.get(id);
        const el = document.getElementById(`task-${id}`);
        if (!task || !el) return;

        const progressBar = el.querySelector('.task-progress-bar');
        const statusText = el.querySelector('.status-text');
        const speedText = el.querySelector('.speed-text');
        const pauseBtn = el.querySelector('.pause-btn');
        const pauseIcon = el.querySelector('.pause-icon');
        const playIcon = el.querySelector('.play-icon');

        progressBar.style.width = `${task.progress}%`;

        // Remove classes
        el.classList.remove('completed', 'error', 'paused');

        if (task.status === 'completed') {
            el.classList.add('completed');
            statusText.textContent = '已完成';
            statusText.style.color = 'var(--success-color)';
            speedText.textContent = '';
            pauseBtn.style.display = 'none';
        } else if (task.status === 'error') {
            el.classList.add('error');
            statusText.textContent = task.error || '失败';
            statusText.style.color = 'var(--error-color)';
            pauseBtn.style.display = 'none';
        } else if (task.status === 'paused') {
            el.classList.add('paused');
            statusText.textContent = '已暂停';
            pauseBtn.style.display = 'flex';
            pauseIcon.style.display = 'none';
            playIcon.style.display = 'block';
        } else {
            // Running
            statusText.textContent = `${Math.round(task.progress)}%`;
            speedText.textContent = task.speed;
            pauseBtn.style.display = 'flex';
            pauseIcon.style.display = 'block';
            pauseIcon.style.display = 'block';
            playIcon.style.display = 'none';
        }
    }
}

const manager = new TaskManager();

// Initialize
async function init() {
    const start = performance.now();

    // 并行初始化 - 同时获取文件和存储信息
    await Promise.all([
        fetchFiles(),
        updateStorageInfo()
    ]);

    setupRealtimeSubscription();
    setupEventListeners();

    console.log(`[App] 就绪 (${(performance.now() - start).toFixed(0)}ms)`);
}

// Fetch Initial Files - 优化版本，使用缓存
async function fetchFiles(forceRefresh = false) {
    // 检查缓存
    if (!forceRefresh) {
        const cached = DBCache.get('files_all');
        if (cached) {
            files = cached;
            renderFiles();
            return cached;
        }
    }

    // 使用请求去重，避免重复请求
    return RequestBatcher.dedupe('fetchFiles', async () => {
        const { data, error } = await client
            .from('files')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[DB] 获取文件失败:', error.message);
            return null;
        }

        // 更新缓存
        DBCache.set('files_all', data);

        files = data;
        renderFiles();
        return data;
    });
}

// Fetch Storage Usage
async function updateStorageInfo(forceRefresh = false) {
    // 检查缓存
    if (!forceRefresh) {
        const cached = DBCache.get('storage_info');
        if (cached) {
            renderStorageUI(cached);
            return;
        }
    }

    const { data, error } = await client.rpc('get_storage_summary');

    if (error) {
        // 静默处理，不影响主功能
        return;
    }

    const storageData = {
        usedBytes: data.used || 0,
        totalBytes: data.limit || 1073741824 // Fallback to 1GB if missing
    };

    // 缓存存储信息
    DBCache.set('storage_info', storageData);

    renderStorageUI(storageData);
}

function renderStorageUI(storageData) {
    const { usedBytes, totalBytes } = storageData;
    const percentage = Math.min((usedBytes / totalBytes) * 100, 100);

    // Update UI
    const storageInfo = document.querySelector('.storage-info');
    if (storageInfo) {
        storageInfo.innerHTML = `
            <div style="font-size: 0.85rem; display: flex; justify-content: space-between;">
                <span>存储空间</span>
                <span>${Math.round(percentage)}%</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${percentage}%"></div>
            </div>
            <div style="font-size: 0.75rem; color: #888;">
                已用 ${formatSize(usedBytes)} / ${formatSize(totalBytes)}
            </div>
        `;
    }
}

// Realtime Subscription
function setupRealtimeSubscription() {
    client
        .channel('files-channel')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'files' },
            (payload) => {
                if (payload.eventType === 'INSERT') {
                    // Prevent duplicates
                    if (!files.some(f => f.id === payload.new.id)) {
                        files.unshift(payload.new);
                    }
                } else if (payload.eventType === 'DELETE') {
                    files = files.filter(f => f.id !== payload.old.id);
                } else if (payload.eventType === 'UPDATE') {
                    const index = files.findIndex(f => f.id === payload.new.id);
                    if (index !== -1) {
                        files[index] = payload.new;
                    }
                }

                // 同步更新缓存
                DBCache.set('files_all', files);

                renderFiles();
                if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
                    // 文件增删时强制刷新存储信息
                    DBCache.invalidate('storage_info');
                    updateStorageInfo(true);
                }
            }
        )
        .subscribe();
}

// Navigation Helper
function getBreadcrumbs() {
    if (!currentFolderId) return [{ id: null, name: '根目录' }];

    const path = [];
    let current = files.find(f => f.id === currentFolderId);

    while (current) {
        path.unshift({ id: current.id, name: current.name });
        current = files.find(f => f.id === current.parent_id);
    }

    path.unshift({ id: null, name: '根目录' });
    return path;
}

function navigateToFolder(folderId) {
    currentFolderId = folderId;
    renderFiles();
}

// Move File Logic
async function moveFile(fileId, targetFolderId) {
    if (fileId === targetFolderId) return; // Can't move folder into itself (simple check)

    // Check for circular dependency
    let parent = files.find(f => f.id === targetFolderId);
    while (parent) {
        if (parent.id === fileId) {
            showToast('无法将文件夹移动到其子文件夹中');
            return;
        }
        parent = files.find(f => f.id === parent.parent_id);
    }

    const { error } = await client
        .from('files')
        .update({ parent_id: targetFolderId })
        .eq('id', fileId);

    if (error) {
        showToast('移动失败: ' + error.message);
    } else {
        // Optimistic update
        const file = files.find(f => f.id === fileId);
        if (file) file.parent_id = targetFolderId;
        renderFiles();
        showToast('移动成功');
    }
}


// Render Files
function renderFiles() {
    // Handle View Switching
    if (currentView === 'tasks') {
        fileView.style.display = 'none';
        taskView.style.display = 'block';
        uploadBtn.style.display = 'none';
        if (sectionTitle) sectionTitle.textContent = '传输列表';
        manager.updateEmptyState();
        return;
    } else {
        fileView.style.display = 'block';
        taskView.style.display = 'none';
        uploadBtn.style.display = currentView === 'files' ? 'flex' : 'none';
    }

    let filteredFiles = [];
    let title = '最近上传';

    switch (currentView) {
        case 'files':
            // Filter by parent_id
            filteredFiles = files.filter(f => !f.is_deleted && f.parent_id === currentFolderId);
            title = '我的文件';
            break;
        case 'shared':
            filteredFiles = files.filter(f => !f.is_deleted && f.is_shared);
            title = '我的收藏';
            break;
        case 'trash':
            filteredFiles = files.filter(f => f.is_deleted);
            title = '回收站';
            break;
        default:
            filteredFiles = files.filter(f => !f.is_deleted);
    }

    // Apply Search Filter
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filteredFiles = files.filter(f => !f.is_deleted && f.name.toLowerCase().includes(query)); // Search across all non-deleted files
        title = `搜索: "${searchQuery}"`;
        // Hide breadcrumbs during search
        if (breadcrumbNav) breadcrumbNav.style.display = 'none';
    } else {
        // Show Breadcrumbs in 'files' view
        if (currentView === 'files' && breadcrumbNav) {
            breadcrumbNav.style.display = 'flex';
            const breadcrumbs = getBreadcrumbs();
            breadcrumbNav.innerHTML = breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return `
                    <div class="breadcrumb-item" onclick="navigateToFolder(${crumb.id === null ? 'null' : `'${crumb.id}'`})" style="${isLast ? 'font-weight:bold; cursor:default; color:var(--text-color); text-decoration:none;' : ''}">
                        ${crumb.name}
                    </div>
                    ${!isLast ? '<div class="breadcrumb-separator">/</div>' : ''}
                `;
            }).join('');
        } else if (breadcrumbNav) {
            breadcrumbNav.style.display = 'none';
        }
    }

    if (sectionTitle) sectionTitle.textContent = title;

    // Sort folders first
    filteredFiles.sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        return 0;
    });

    if (filteredFiles.length === 0) {
        fileGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; color: #888; padding: 40px;">
                <svg viewBox="0 0 24 24" style="width: 48px; height: 48px; margin-bottom: 10px; opacity: 0.5;">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                    <polyline points="13 2 13 9 20 9"></polyline>
                </svg>
                <p>暂无文件</p>
            </div>
        `;
        return;
    }

    fileGrid.innerHTML = filteredFiles.map(file => {
        const timeString = new Date(file.created_at).toLocaleDateString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });

        let displayName = file.name;
        if (searchQuery) {
            const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escapedQuery})`, 'gi');
            displayName = displayName.replace(regex, '<span class="search-highlight">$1</span>');
        }

        let displaySize = file.size;
        if (file.type === 'folder') {
            displaySize = formatSize(calculateFolderSize(file.id));
        }

        const draggable = !file.is_deleted ? 'draggable="true"' : '';
        const droppable = (file.type === 'folder' && !file.is_deleted) ? 'data-droppable="true"' : '';

        return `
        <div class="file-card" 
             data-id="${file.id}" 
             data-url="${file.url}" 
             data-name="${file.name}" 
             data-type="${file.type}"
             data-shared="${file.is_shared}"
             ${draggable}
             ${droppable}>
            <div class="file-icon">
                ${fileIcons[file.type] || fileIcons.default}
            </div>
            <div class="file-info">
                <h3>${displayName}</h3>
                <p>${displaySize} • ${timeString}</p>
                ${file.is_shared ? '<span style="font-size: 10px; background: #fef3c7; color: #d97706; padding: 2px 6px; border-radius: 4px;">已收藏</span>' : ''}
            </div>
        </div>
    `}).join('');

    // Attach Drag and Drop Events
    const cards = fileGrid.querySelectorAll('.file-card');
    cards.forEach(card => {
        // Click to Select (already handled by context menu logic, but let's improve UX)
        // Double Click to enter folder
        if (card.dataset.type === 'folder') {
            card.addEventListener('dblclick', () => {
                navigateToFolder(card.dataset.id);
            });
        }

        // Drag Events
        if (card.getAttribute('draggable') === 'true') {
            card.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', card.dataset.id);
                e.dataTransfer.effectAllowed = 'move';
                card.style.opacity = '0.5';
            });

            card.addEventListener('dragend', (e) => {
                card.style.opacity = '1';
            });
        }

        // Drop Events (only folders)
        if (card.dataset.droppable === 'true') {
            card.addEventListener('dragover', (e) => {
                e.preventDefault(); // Allow drop
                e.dataTransfer.dropEffect = 'move';
                card.classList.add('drag-over');
            });

            card.addEventListener('dragleave', (e) => {
                card.classList.remove('drag-over');
            });

            card.addEventListener('drop', (e) => {
                e.preventDefault();
                card.classList.remove('drag-over');
                const fileId = e.dataTransfer.getData('text/plain');
                if (fileId && fileId !== card.dataset.id) {
                    moveFile(fileId, card.dataset.id);
                }
            });
        }
    });
}

// Utils
function parseSize(sizeStr) {
    if (!sizeStr || sizeStr === '-' || sizeStr === '0 B') return 0;
    const parts = sizeStr.split(' ');
    if (parts.length < 2) return 0;
    const num = parseFloat(parts[0]);
    const unit = parts[1];
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = sizes.indexOf(unit);
    if (i < 0) return 0;
    return num * Math.pow(k, i);
}

function calculateFolderSize(folderId) {
    const children = files.filter(f => f.parent_id === folderId && !f.is_deleted);
    let total = 0;
    for (const child of children) {
        if (child.type === 'folder') {
            total += calculateFolderSize(child.id);
        } else {
            total += parseSize(child.size);
        }
    }
    return total;
}

function formatSize(bytes) {
    if (bytes === 0 || bytes === '-' || isNaN(bytes)) return bytes === '-' ? '-' : '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext)) return 'img';
    if (['doc', 'docx'].includes(ext)) return 'doc';
    if (['xls', 'xlsx'].includes(ext)) return 'xls';
    if (['zip', 'rar', 'tar'].includes(ext)) return 'zip';
    if (ext === 'pdf') return 'pdf';
    if (ext === 'fig') return 'fig';
    return 'default';
}

// Upload Handling
async function uploadFile(file) {
    await window.ensureCloudOptionalLibraries?.();
    // Capture current folder ID at the START of the upload to ensure consistency
    const targetFolderId = currentFolderId;
    console.log('Starting upload for file:', file.name, 'to folder:', targetFolderId);

    // Create Task
    let lastLoaded = 0;
    let lastTime = Date.now();
    let taskId;

    // Generate a URL-safe filename
    const lastDotIndex = file.name.lastIndexOf('.');
    let ext = 'bin';
    if (lastDotIndex !== -1 && lastDotIndex < file.name.length - 1) {
        const rawExt = file.name.substring(lastDotIndex + 1);
        const cleanExt = rawExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (cleanExt) ext = cleanExt;
    }

    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;

    // Configure TUS Upload
    const projectId = supabaseUrl.split('//')[1].split('.')[0];
    const bucketName = 'cloud-files';

    const upload = new tus.Upload(file, {
        endpoint: `https://${projectId}.supabase.co/storage/v1/upload/resumable`,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
            authorization: `Bearer ${supabaseKey}`,
            'x-upsert': 'true',
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
            bucketName: bucketName,
            objectName: fileName,
            contentType: file.type,
            cacheControl: 3600,
        },
        chunkSize: 6 * 1024 * 1024,
        onError: function (error) {
            console.error('Failed because: ' + error);
            manager.errorTask(taskId, '上传失败: ' + error.message);
        },
        onProgress: function (bytesUploaded, bytesTotal) {
            const percentage = (bytesUploaded / bytesTotal * 100).toFixed(2);

            // Calculate speed
            const now = Date.now();
            const timeDiff = (now - lastTime) / 1000;
            if (timeDiff >= 1) {
                const loadedDiff = bytesUploaded - lastLoaded;
                const speed = formatSize(loadedDiff) + '/s';
                const loadedStr = formatSize(bytesUploaded) + ' / ' + formatSize(bytesTotal);

                manager.updateProgress(taskId, percentage, speed, loadedStr);

                lastLoaded = bytesUploaded;
                lastTime = now;
            } else {
                manager.updateProgress(taskId, percentage, null, null);
            }
        },
        onSuccess: async function () {
            manager.completeTask(taskId);

            // Get public URL
            const { data: { publicUrl } } = client.storage
                .from(bucketName)
                .getPublicUrl(fileName);

            console.log('Upload finished, inserting into DB with parent_id:', targetFolderId);

            // Insert into Database
            const { data: insertedData, error: dbError } = await client
                .from('files')
                .insert({
                    name: file.name,
                    type: getFileType(file.name),
                    size: formatSize(file.size),
                    url: publicUrl,
                    is_deleted: false,
                    is_shared: false,
                    parent_id: targetFolderId // Use captured folder ID
                })
                .select();

            if (dbError) {
                console.error('DB Insert Error', dbError);
                showToast('上传成功但保存记录失败');
            } else {
                showToast('文件上传完成');
                // Manually add to list to ensure immediate update
                if (insertedData && insertedData.length > 0) {
                    const newFile = insertedData[0];
                    if (!files.some(f => f.id === newFile.id)) {
                        files.unshift(newFile);
                        // 同步更新缓存
                        DBCache.set('files_all', files);
                        DBCache.invalidate('storage_info');
                        renderFiles();
                        updateStorageInfo(true);
                    }
                }
            }
        }
    });

    taskId = manager.addTask(
        'upload',
        file.name,
        formatSize(file.size),
        {
            start: () => upload.start(),
            pause: () => upload.abort(),
            resume: () => upload.start(),
            cancel: () => upload.abort()
        }
    );

    showToast('已添加到传输列表');
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    await uploadFile(file);

    // Reset input
    event.target.value = '';
}

// Download Handling
async function handleDownload() {
    if (!selectedFile) return;
    contextMenu.style.display = 'none';

    // 判断是文件还是文件夹
    if (selectedFile.type === 'folder') {
        await handleFolderDownload(selectedFile);
    } else {
        await handleFileDownload(selectedFile);
    }
}

// 单文件下载
async function handleFileDownload(file) {
    showToast('已添加到传输列表');

    const fileUrl = file.url;
    const fileName = file.name;
    const fileSizeStr = file.size;

    // Start Download Task
    let taskId;
    let abortController = new AbortController();
    let downloadedChunks = [];
    let receivedLength = 0;
    let totalLength = 0;
    let isPaused = false;

    // Speed calc
    let lastLoaded = 0;
    let lastTime = Date.now();

    const startDownload = async (resume = false) => {
        try {
            abortController = new AbortController();
            const headers = {};
            if (resume && receivedLength > 0) {
                headers['Range'] = `bytes=${receivedLength}-`;
            }

            const response = await fetch(fileUrl, {
                signal: abortController.signal,
                headers
            });

            if (!response.ok) throw new Error('Network response was not ok');

            if (!resume) {
                const contentLength = response.headers.get('Content-Length');
                totalLength = contentLength ? parseInt(contentLength, 10) : 0;
            }

            const reader = response.body.getReader();

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    break;
                }

                downloadedChunks.push(value);
                receivedLength += value.length;

                // Progress Update
                const now = Date.now();
                const timeDiff = (now - lastTime) / 1000;

                let speedStr = null;
                if (timeDiff >= 1) {
                    const loadedDiff = receivedLength - lastLoaded;
                    speedStr = formatSize(loadedDiff) + '/s';
                    lastLoaded = receivedLength;
                    lastTime = now;
                }

                if (totalLength > 0) {
                    const percentage = (receivedLength / totalLength * 100).toFixed(2);
                    manager.updateProgress(taskId, percentage, speedStr);
                }
            }

            // Completed
            const blob = new Blob(downloadedChunks);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            manager.completeTask(taskId);

        } catch (error) {
            if (error.name === 'AbortError') {
                if (isPaused) {
                    // Just paused
                } else {
                    // Cancelled
                }
            } else {
                console.error('Download error:', error);
                manager.errorTask(taskId, '下载失败');
            }
        }
    };

    taskId = manager.addTask(
        'download',
        fileName,
        fileSizeStr,
        {
            start: () => startDownload(false),
            pause: () => {
                isPaused = true;
                abortController.abort();
            },
            resume: () => {
                isPaused = false;
                startDownload(true);
            },
            cancel: () => {
                isPaused = false;
                abortController.abort();
                downloadedChunks = [];
            }
        }
    );
}

// 文件夹下载 - 优先保存到目录，不支持则回退到 ZIP
async function handleFolderDownload(folder) {
    // 递归获取文件夹内所有文件和子文件夹结构
    const collectFilesInFolder = (folderId, basePath = '') => {
        const result = { files: [], folders: [] };
        const children = files.filter(f => f.parent_id === folderId && !f.is_deleted);

        for (const child of children) {
            const childPath = basePath ? `${basePath}/${child.name}` : child.name;

            if (child.type === 'folder') {
                result.folders.push(childPath);
                const subResult = collectFilesInFolder(child.id, childPath);
                result.files.push(...subResult.files);
                result.folders.push(...subResult.folders);
            } else if (child.url) {
                result.files.push({
                    path: childPath,
                    url: child.url,
                    name: child.name,
                    size: child.size
                });
            }
        }
        return result;
    };

    const { files: filesToDownload, folders: foldersToCreate } = collectFilesInFolder(folder.id);

    if (filesToDownload.length === 0) {
        showToast('文件夹为空，无法下载');
        return;
    }

    // 检查是否支持 File System Access API
    if ('showDirectoryPicker' in window) {
        await handleFolderDownloadToDirectory(folder, filesToDownload, foldersToCreate);
    } else {
        // 不支持，回退到 ZIP 下载
        showToast('浏览器不支持直接保存到目录，将下载为 ZIP');
        await handleFolderDownloadAsZip(folder, filesToDownload);
    }
}

// 直接保存到用户选择的目录
async function handleFolderDownloadToDirectory(folder, filesToDownload, foldersToCreate) {
    try {
        // 让用户选择保存目录
        showToast('请选择保存位置...');
        const dirHandle = await window.showDirectoryPicker({
            mode: 'readwrite',
            startIn: 'downloads'
        });

        // 在选择的目录中创建文件夹
        const folderHandle = await dirHandle.getDirectoryHandle(folder.name, { create: true });

        // 创建下载任务
        let taskId;
        let isCancelled = false;
        let downloadedCount = 0;

        const startDirectoryDownload = async () => {
            try {
                // 预先创建所有子文件夹
                const folderHandles = new Map();
                folderHandles.set('', folderHandle);

                for (const folderPath of foldersToCreate) {
                    if (isCancelled) throw new Error('用户取消');

                    const parts = folderPath.split('/');
                    let currentHandle = folderHandle;
                    let currentPath = '';

                    for (const part of parts) {
                        currentPath = currentPath ? `${currentPath}/${part}` : part;
                        if (!folderHandles.has(currentPath)) {
                            currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
                            folderHandles.set(currentPath, currentHandle);
                        } else {
                            currentHandle = folderHandles.get(currentPath);
                        }
                    }
                }

                // 下载并保存所有文件
                for (let i = 0; i < filesToDownload.length; i++) {
                    if (isCancelled) throw new Error('用户取消');

                    const file = filesToDownload[i];
                    const shortName = file.name.length > 15 ? file.name.substring(0, 15) + '...' : file.name;

                    const percentage = ((i / filesToDownload.length) * 100).toFixed(0);
                    manager.updateProgress(taskId, percentage, `保存: ${shortName}`);

                    try {
                        // 下载文件
                        const response = await fetch(file.url);
                        if (!response.ok) {
                            console.warn(`跳过文件 ${file.name}: 下载失败`);
                            continue;
                        }

                        const blob = await response.blob();

                        // 获取父目录 handle
                        const pathParts = file.path.split('/');
                        const fileName = pathParts.pop();
                        const parentPath = pathParts.join('/');
                        const parentHandle = folderHandles.get(parentPath) || folderHandle;

                        // 创建并写入文件
                        const fileHandle = await parentHandle.getFileHandle(fileName, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(blob);
                        await writable.close();

                        downloadedCount++;
                        const newPercentage = ((downloadedCount / filesToDownload.length) * 100).toFixed(0);
                        manager.updateProgress(taskId, newPercentage, `已保存 ${downloadedCount}/${filesToDownload.length}`);

                    } catch (err) {
                        console.warn(`跳过文件 ${file.name}:`, err.message);
                    }
                }

                manager.completeTask(taskId);
                showToast(`${folder.name} 已保存到目录`);

            } catch (error) {
                if (error.message === '用户取消') {
                    // 已取消
                } else if (error.name === 'AbortError') {
                    // 用户取消选择目录
                    showToast('已取消');
                } else {
                    console.error('保存失败:', error);
                    manager.errorTask(taskId, '保存失败');
                }
            }
        };

        taskId = manager.addTask(
            'download',
            `📁 ${folder.name}`,
            `${filesToDownload.length} 个文件`,
            {
                start: () => startDirectoryDownload(),
                pause: null,
                resume: null,
                cancel: () => { isCancelled = true; }
            }
        );

    } catch (error) {
        if (error.name === 'AbortError') {
            showToast('已取消选择');
        } else {
            console.error('无法访问目录:', error);
            showToast('无法访问目录，将下载为 ZIP');
            await handleFolderDownloadAsZip(folder, filesToDownload);
        }
    }
}

// ZIP 下载（作为备用方案）
async function handleFolderDownloadAsZip(folder, filesToDownload) {
    await window.ensureCloudOptionalLibraries?.();
    const folderName = folder.name;
    const zipFileName = `${folderName}.zip`;

    let taskId;
    let isCancelled = false;
    let downloadedCount = 0;

    const startZipDownload = async () => {
        try {
            const zip = new JSZip();

            for (let i = 0; i < filesToDownload.length; i++) {
                if (isCancelled) throw new Error('用户取消');

                const file = filesToDownload[i];
                const shortName = file.name.length > 12 ? file.name.substring(0, 12) + '...' : file.name;

                const basePercent = (i / filesToDownload.length) * 70;
                manager.updateProgress(taskId, basePercent.toFixed(0), `下载: ${shortName}`);

                try {
                    const response = await fetch(file.url);
                    if (!response.ok) continue;

                    const blob = await response.blob();
                    zip.file(file.path, blob);

                    downloadedCount++;
                    const percentage = ((downloadedCount / filesToDownload.length) * 70).toFixed(0);
                    manager.updateProgress(taskId, percentage, `已获取 ${downloadedCount}/${filesToDownload.length}`);

                } catch (err) {
                    console.warn(`跳过文件 ${file.name}:`, err.message);
                }
            }

            if (isCancelled) throw new Error('用户取消');

            manager.updateProgress(taskId, 70, '压缩中...');

            const zipBlob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            }, (metadata) => {
                if (metadata.percent !== undefined) {
                    const overallPercent = 70 + (metadata.percent * 0.3);
                    manager.updateProgress(taskId, overallPercent.toFixed(0), `压缩 ${Math.round(metadata.percent)}%`);
                }
            });

            const url = window.URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = zipFileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            manager.completeTask(taskId);
            showToast(`${folderName}.zip 下载完成`);

        } catch (error) {
            if (error.message !== '用户取消') {
                console.error('ZIP 下载失败:', error);
                manager.errorTask(taskId, '下载失败');
            }
        }
    };

    taskId = manager.addTask(
        'download',
        `📁 ${folderName}.zip`,
        `${filesToDownload.length} 个文件`,
        {
            start: () => startZipDownload(),
            pause: null,
            resume: null,
            cancel: () => { isCancelled = true; }
        }
    );
}

// Copy Link Handling
async function handleCopyLink() {
    if (!selectedFile || !selectedFile.url) return;
    contextMenu.style.display = 'none';

    try {
        await navigator.clipboard.writeText(selectedFile.url);
        showToast('链接已复制到剪贴板');
    } catch (err) {
        console.error('Copy failed', err);
        showToast('复制失败，请重试');
    }
}

// Toggle Share
async function handleShare() {
    if (!selectedFile) return;
    contextMenu.style.display = 'none';

    const newStatus = !selectedFile.is_shared;
    const { error } = await client
        .from('files')
        .update({ is_shared: newStatus })
        .eq('id', selectedFile.id);

    if (error) {
        showToast('操作失败: ' + error.message);
    } else {
        const file = files.find(f => f.id == selectedFile.id);
        if (file) file.is_shared = newStatus;
        renderFiles();

        if (newStatus) {
            showToast('已添加到收藏');
        } else {
            showToast('已取消收藏');
        }
    }
}

// Restore File
async function handleRestore() {
    if (!selectedFile) return;
    contextMenu.style.display = 'none';

    const { error } = await client
        .from('files')
        .update({ is_deleted: false })
        .eq('id', selectedFile.id);

    if (error) {
        showToast('恢复失败: ' + error.message);
    } else {
        const file = files.find(f => f.id == selectedFile.id);
        if (file) file.is_deleted = false;
        renderFiles();
        showToast('文件已恢复');
    }
}

// Create New Folder
async function handleNewFolder() {
    contextMenu.style.display = 'none';
    const folderName = prompt('请输入文件夹名称', '新建文件夹');

    if (!folderName || folderName.trim() === '') return;

    showToast('正在创建文件夹...');

    const { error } = await client
        .from('files')
        .insert({
            name: folderName.trim(),
            type: 'folder',
            size: '-',
            url: null,
            is_deleted: false,
            is_shared: false,
            parent_id: currentFolderId // Use currentFolderId
        });

    if (error) {
        showToast('创建失败: ' + error.message);
        console.error(error);
    } else {
        showToast('文件夹创建成功');
    }
}

// Rename File/Folder
async function handleRename() {
    if (!selectedFile) return;
    contextMenu.style.display = 'none';

    const newName = prompt('请输入新名称', selectedFile.name);

    if (!newName || newName.trim() === '' || newName === selectedFile.name) return;

    showToast('正在重命名...');

    const { error } = await client
        .from('files')
        .update({ name: newName.trim() })
        .eq('id', selectedFile.id);

    if (error) {
        showToast('重命名失败: ' + error.message);
        console.error(error);
    } else {
        const file = files.find(f => f.id == selectedFile.id);
        if (file) file.name = newName.trim();
        renderFiles();
        showToast('重命名成功');
    }
}

// Delete File
async function handleDelete() {
    if (!selectedFile) return;
    contextMenu.style.display = 'none';

    if (currentView === 'trash') {
        // Permanent Delete
        if (!confirm('确定要永久删除此文件吗？此操作无法撤销。')) return;

        showToast('正在删除...');

        // Helper to recursively collect all descendant file paths
        const collectStoragePaths = (file) => {
            let paths = [];
            if (file.url) {
                try {
                    const path = file.url.split('/').pop();
                    if (path) paths.push(path);
                } catch (e) { }
            }

            // Find children
            const children = files.filter(f => f.parent_id === file.id);
            for (const child of children) {
                paths = paths.concat(collectStoragePaths(child));
            }
            return paths;
        };

        const pathsToDelete = collectStoragePaths(selectedFile);

        if (pathsToDelete.length > 0) {
            try {
                // Delete in chunks if needed, but for now single call
                await client.storage.from('cloud-files').remove(pathsToDelete);
            } catch (e) {
                console.error('Storage delete error', e);
            }
        }

        const { error } = await client
            .from('files')
            .delete()
            .eq('id', selectedFile.id);

        if (error) {
            showToast('删除失败: ' + error.message);
        } else {
            // Optimistic update logic
            // Since we have ON DELETE CASCADE, DB will delete children.
            // But we need to update our local 'files' array to reflect this.

            // Helper to recursively find all IDs to remove from local state
            const collectIdsToRemove = (fileId) => {
                let ids = [fileId];
                const children = files.filter(f => f.parent_id === fileId);
                for (const child of children) {
                    ids = ids.concat(collectIdsToRemove(child.id));
                }
                return ids;
            };

            const idsToRemove = collectIdsToRemove(selectedFile.id);
            files = files.filter(f => !idsToRemove.includes(f.id));

            // 同步更新缓存
            DBCache.set('files_all', files);
            DBCache.invalidate('storage_info');

            renderFiles();
            updateStorageInfo(true);
            showToast('文件已永久删除');
        }

    } else {
        // Soft Delete (Move to Trash)
        // We should recursively mark children as deleted too? 
        // Or does moving a folder to trash imply moving all contents?
        // Usually yes. But if we restore, do we restore all?
        // Let's implement soft delete cascading logic here for consistency

        // Actually, Windows logic: if you move folder to trash, you just move the folder.
        // The contents are "inside" it.
        // Since my view filters by parent_id, if the folder is in trash (is_deleted=true),
        // we can't navigate into it (dblclick won't show it in file list).
        // So effectively contents are hidden/trashed.
        // However, 'trash' view shows a flat list currently?
        // Let's check renderFiles logic for trash:
        // filteredFiles = files.filter(f => f.is_deleted);

        // If I soft-delete ONLY the folder, its children still have is_deleted=false.
        // But since their parent is deleted, they are effectively orphaned in the UI if navigation depends on parent.
        // BUT, the Trash view currently shows ALL files where is_deleted=true.
        // If I delete a folder, the children won't show up in Trash view unless I mark them is_deleted=true.
        // BUT, if I mark them is_deleted=true, they will show up as individual items in Trash?
        // Windows Trash shows the FOLDER. It doesn't show the children separately.
        // My current logic:
        // case 'trash': filteredFiles = files.filter(f => f.is_deleted);

        // If I only mark parent as deleted:
        // 1. Parent shows in Trash.
        // 2. Children (is_deleted=false) - where do they show?
        //    They have parent_id = deleted_folder_id.
        //    They won't show in root or other folders.
        //    They won't show in Trash.
        //    So they are hidden. This is actually correct behavior for "Folder in Trash".
        //    When we Restore the folder, children become visible again because we can navigate into the folder.

        // So for Soft Delete, we ONLY update the target folder.

        const { error } = await client
            .from('files')
            .update({ is_deleted: true })
            .eq('id', selectedFile.id);

        if (error) {
            showToast('操作失败: ' + error.message);
        } else {
            const file = files.find(f => f.id == selectedFile.id);
            if (file) file.is_deleted = true;
            // 同步更新缓存
            DBCache.set('files_all', files);
            renderFiles();
            showToast('文件已移至回收站');
        }
    }
}

// Event Listeners
function setupEventListeners() {
    // Drag and Drop Upload (Desktop to Browser)
    const contentArea = document.querySelector('.content-area');
    if (contentArea) {
        contentArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Check if it's a file drag from OS
            if (e.dataTransfer.types.includes('Files')) {
                contentArea.classList.add('drag-over-upload');
            }
        });

        contentArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Only remove if we are leaving the content area boundary
            if (!contentArea.contains(e.relatedTarget)) {
                contentArea.classList.remove('drag-over-upload');
            }
        });

        contentArea.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            contentArea.classList.remove('drag-over-upload');

            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                Array.from(files).forEach(file => {
                    uploadFile(file);
                });
            }
        });
    }

    // Mobile Menu
    menuBtn.addEventListener('click', toggleSidebar);
    overlay.addEventListener('click', toggleSidebar);

    // Navigation
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Update active state
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Set current view
            const view = item.dataset.view;
            if (view) {
                currentView = view;
                if (view !== 'files') {
                    currentFolderId = null; // Reset folder nav when switching views
                }
                renderFiles();
            }

            if (window.innerWidth <= 768) {
                toggleSidebar();
            }
        });
    });

    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', handleFileUpload);

    // Search Input Listener
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim();
            renderFiles();
        });
    }

    // Context Menu (Right Click)
    fileGrid.addEventListener('contextmenu', (e) => {
        e.preventDefault();

        // Positioning
        const { clientX: mouseX, clientY: mouseY } = e;
        contextMenu.style.left = `${mouseX}px`;
        contextMenu.style.top = `${mouseY}px`;
        contextMenu.style.display = 'block';

        const card = e.target.closest('.file-card');

        if (card) {
            // Clicked on a file/folder
            const id = card.dataset.id;
            const file = files.find(f => f.id == id);

            if (file) {
                selectedFile = file;

                // Show file options, hide New Folder
                newFolderAction.style.display = 'none';
                renameAction.style.display = 'flex';

                if (currentView === 'trash') {
                    renameAction.style.display = 'none';
                    shareAction.style.display = 'none';
                    copyLinkAction.style.display = 'none';
                    restoreAction.style.display = 'flex';
                    deleteAction.style.display = 'flex';
                    document.getElementById('deleteText').textContent = '永久删除';
                } else {
                    shareAction.style.display = 'flex';
                    if (file.url) {
                        copyLinkAction.style.display = 'flex';
                    } else {
                        copyLinkAction.style.display = 'none';
                    }

                    restoreAction.style.display = 'none';
                    deleteAction.style.display = 'flex';
                    document.getElementById('shareText').textContent = file.is_shared ? '取消收藏' : '收藏';
                    document.getElementById('deleteText').textContent = '删除';
                }

                // 文件夹和文件都可以下载
                downloadAction.style.display = 'flex';

                if (file.type === 'folder') {
                    copyLinkAction.style.display = 'none';
                    // 支持 File System Access API 的浏览器显示"下载"，否则显示"打包下载"
                    document.getElementById('downloadText').textContent =
                        ('showDirectoryPicker' in window) ? '下载' : '打包下载';
                } else {
                    document.getElementById('downloadText').textContent = '下载';
                }
            }
        } else {
            // Clicked on background
            selectedFile = null;

            // Show New Folder, Hide others
            newFolderAction.style.display = 'flex';
            renameAction.style.display = 'none';
            downloadAction.style.display = 'none';
            shareAction.style.display = 'none';
            copyLinkAction.style.display = 'none';
            restoreAction.style.display = 'none';
            deleteAction.style.display = 'none';
        }
    });

    // Hide Context Menu on outside click
    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
        }
    });

    // Menu Actions
    newFolderAction.addEventListener('click', handleNewFolder);
    renameAction.addEventListener('click', handleRename);
    downloadAction.addEventListener('click', handleDownload);
    shareAction.addEventListener('click', handleShare);
    copyLinkAction.addEventListener('click', handleCopyLink);
    restoreAction.addEventListener('click', handleRestore);
    deleteAction.addEventListener('click', handleDelete);
}

function toggleSidebar() {
    sidebar.classList.toggle('open');
    if (sidebar.classList.contains('open')) {
        overlay.style.display = 'block';
    } else {
        overlay.style.display = 'none';
    }
}

function showToast(message, duration = 3000) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// Start
init();

// ==================== 图片预览功能 ====================

// 图片预览状态
const imagePreview = {
    modal: document.getElementById('imagePreviewModal'),
    image: document.getElementById('previewImage'),
    fileName: document.getElementById('previewFileName'),
    fileSize: document.getElementById('previewFileSize'),
    imageIndex: document.getElementById('previewImageIndex'),
    closeBtn: document.getElementById('closePreview'),
    prevBtn: document.getElementById('prevImage'),
    nextBtn: document.getElementById('nextImage'),
    zoomInBtn: document.getElementById('zoomIn'),
    zoomOutBtn: document.getElementById('zoomOut'),
    rotateLeftBtn: document.getElementById('rotateLeft'),
    rotateRightBtn: document.getElementById('rotateRight'),
    resetBtn: document.getElementById('resetImage'),
    downloadBtn: document.getElementById('downloadImage'),

    currentIndex: 0,
    imageFiles: [],
    scale: 1,
    rotation: 0,
    isDragging: false,
    startX: 0,
    startY: 0,
    translateX: 0,
    translateY: 0
};

// 获取所有图片文件
function getImageFiles() {
    return files.filter(f => {
        if (f.is_deleted || f.type !== 'img') return false;

        // 根据当前视图过滤
        if (currentView === 'files') {
            return f.parent_id === currentFolderId;
        } else if (currentView === 'shared') {
            return f.is_shared;
        }
        return true;
    });
}

// 打开图片预览
function openImagePreview(fileId) {
    imagePreview.imageFiles = getImageFiles();
    imagePreview.currentIndex = imagePreview.imageFiles.findIndex(f => f.id === fileId);

    if (imagePreview.currentIndex === -1) return;

    imagePreview.modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    loadPreviewImage();
}

// 加载预览图片
function loadPreviewImage() {
    const file = imagePreview.imageFiles[imagePreview.currentIndex];
    if (!file) return;

    // 重置变换
    imagePreview.scale = 1;
    imagePreview.rotation = 0;
    imagePreview.translateX = 0;
    imagePreview.translateY = 0;

    // 加载图片
    imagePreview.image.src = file.url;
    imagePreview.fileName.textContent = file.name;
    imagePreview.fileSize.textContent = file.size;
    imagePreview.imageIndex.textContent = `${imagePreview.currentIndex + 1} / ${imagePreview.imageFiles.length}`;

    // 更新导航按钮状态
    imagePreview.prevBtn.disabled = imagePreview.currentIndex === 0;
    imagePreview.nextBtn.disabled = imagePreview.currentIndex === imagePreview.imageFiles.length - 1;

    updateImageTransform();
}

// 更新图片变换
function updateImageTransform() {
    imagePreview.image.style.transform = `
        translate(${imagePreview.translateX}px, ${imagePreview.translateY}px)
        scale(${imagePreview.scale})
        rotate(${imagePreview.rotation}deg)
    `;
}

// 关闭预览
function closeImagePreview() {
    imagePreview.modal.classList.remove('active');
    document.body.style.overflow = '';
    imagePreview.image.src = '';
}

// 上一张图片
function showPrevImage() {
    if (imagePreview.currentIndex > 0) {
        imagePreview.currentIndex--;
        loadPreviewImage();
    }
}

// 下一张图片
function showNextImage() {
    if (imagePreview.currentIndex < imagePreview.imageFiles.length - 1) {
        imagePreview.currentIndex++;
        loadPreviewImage();
    }
}

// 放大
function zoomIn() {
    imagePreview.scale = Math.min(imagePreview.scale + 0.25, 5);
    updateImageTransform();
}

// 缩小
function zoomOut() {
    imagePreview.scale = Math.max(imagePreview.scale - 0.25, 0.25);
    updateImageTransform();
}

// 向左旋转
function rotateLeft() {
    imagePreview.rotation -= 90;
    updateImageTransform();
}

// 向右旋转
function rotateRight() {
    imagePreview.rotation += 90;
    updateImageTransform();
}

// 重置图片
function resetImage() {
    imagePreview.scale = 1;
    imagePreview.rotation = 0;
    imagePreview.translateX = 0;
    imagePreview.translateY = 0;
    updateImageTransform();
}

// 下载当前图片
async function downloadCurrentImage() {
    const file = imagePreview.imageFiles[imagePreview.currentIndex];
    if (!file) return;

    try {
        const response = await fetch(file.url);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        showToast('图片下载成功');
    } catch (error) {
        console.error('下载失败:', error);
        showToast('下载失败，请重试');
    }
}

// 图片拖拽移动
imagePreview.image.addEventListener('mousedown', (e) => {
    if (imagePreview.scale <= 1) return;

    imagePreview.isDragging = true;
    imagePreview.startX = e.clientX - imagePreview.translateX;
    imagePreview.startY = e.clientY - imagePreview.translateY;
    imagePreview.image.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', (e) => {
    if (!imagePreview.isDragging) return;

    imagePreview.translateX = e.clientX - imagePreview.startX;
    imagePreview.translateY = e.clientY - imagePreview.startY;
    updateImageTransform();
});

document.addEventListener('mouseup', () => {
    if (imagePreview.isDragging) {
        imagePreview.isDragging = false;
        imagePreview.image.style.cursor = 'grab';
    }
});

// 鼠标滚轮缩放
imagePreview.image.addEventListener('wheel', (e) => {
    e.preventDefault();

    if (e.deltaY < 0) {
        zoomIn();
    } else {
        zoomOut();
    }
});

// 绑定按钮事件
imagePreview.closeBtn.addEventListener('click', closeImagePreview);
imagePreview.prevBtn.addEventListener('click', showPrevImage);
imagePreview.nextBtn.addEventListener('click', showNextImage);
imagePreview.zoomInBtn.addEventListener('click', zoomIn);
imagePreview.zoomOutBtn.addEventListener('click', zoomOut);
imagePreview.rotateLeftBtn.addEventListener('click', rotateLeft);
imagePreview.rotateRightBtn.addEventListener('click', rotateRight);
imagePreview.resetBtn.addEventListener('click', resetImage);
imagePreview.downloadBtn.addEventListener('click', downloadCurrentImage);

// 点击遮罩关闭
document.querySelector('.image-preview-overlay').addEventListener('click', closeImagePreview);

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    if (!imagePreview.modal.classList.contains('active')) return;

    switch (e.key) {
        case 'Escape':
            closeImagePreview();
            break;
        case 'ArrowLeft':
            showPrevImage();
            break;
        case 'ArrowRight':
            showNextImage();
            break;
        case '+':
        case '=':
            zoomIn();
            break;
        case '-':
            zoomOut();
            break;
        case '0':
            resetImage();
            break;
    }
});

// 修改文件卡片的双击事件，图片文件双击打开预览
document.addEventListener('dblclick', (e) => {
    const card = e.target.closest('.file-card');
    if (!card) return;

    const fileType = card.dataset.type;
    const fileId = card.dataset.id;

    if (fileType === 'img') {
        e.preventDefault();
        openImagePreview(fileId);
    }
});

// 暴露到全局供调试使用
window.openImagePreview = openImagePreview;
