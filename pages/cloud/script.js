// Supabase Configuration
const supabaseUrl = 'https://fmxddvjgkykuqwmasigo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteGRkdmpna3lrdXF3bWFzaWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwNDMzMjcsImV4cCI6MjA1OTYxOTMyN30.XCU4-03oajGh6M2-PNiBotCZSIDn_nJXkIC0Thjjfqo';
const client = supabase.createClient(supabaseUrl, supabaseKey);

// State
let files = [];
let selectedFile = null; // Store currently selected file for context menu
let currentView = 'files'; // 'files', 'shared', 'trash'
let searchQuery = ''; // Current search query

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
const restoreAction = document.getElementById('restoreAction');
const sectionTitle = document.querySelector('.section-title');
const searchInput = document.querySelector('.search-bar input');

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
            ? '<svg viewBox="0 0 24 24"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>'
            : '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>';

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
                        <svg viewBox="0 0 24 24" class="pause-icon" style="display:none"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                        <svg viewBox="0 0 24 24" class="play-icon" style="display:none"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    </button>
                    <button class="task-action-btn cancel-btn" title="取消">
                        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
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
            playIcon.style.display = 'none';
        }
    }
}

const manager = new TaskManager();

// Initialize
async function init() {
    await fetchFiles();
    await updateStorageInfo();
    setupRealtimeSubscription();
    setupEventListeners();
}

// Fetch Initial Files
async function fetchFiles() {
    const { data, error } = await client
        .from('files')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching files:', error);
        return;
    }

    files = data;
    renderFiles();
}

// Fetch Storage Usage
async function updateStorageInfo() {
    const { data, error } = await client.rpc('get_storage_summary');
    
    if (error) {
        // Silently fail or log, as this RPC might not exist or work for anon
        console.warn('Error fetching storage usage:', error);
        return;
    }

    const usedBytes = data.used || 0;
    const totalBytes = data.limit || 1073741824; // Fallback to 1GB if missing
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
                console.log('Realtime update:', payload);
                if (payload.eventType === 'INSERT') {
                    files.unshift(payload.new);
                } else if (payload.eventType === 'DELETE') {
                    files = files.filter(f => f.id !== payload.old.id);
                } else if (payload.eventType === 'UPDATE') {
                    const index = files.findIndex(f => f.id === payload.new.id);
                    if (index !== -1) {
                        files[index] = payload.new;
                    }
                }
                renderFiles();
                if (payload.eventType === 'INSERT') updateStorageInfo(); 
            }
        )
        .subscribe();
}

// Render Files
function renderFiles() {
    // Handle View Switching
    if (currentView === 'tasks') {
        fileView.style.display = 'none';
        taskView.style.display = 'block';
        uploadBtn.style.display = 'none'; // Hide FAB in task view
        if (sectionTitle) sectionTitle.textContent = '传输列表';
        manager.updateEmptyState();
        return;
    } else {
        fileView.style.display = 'block';
        taskView.style.display = 'none';
        uploadBtn.style.display = 'flex'; // Show FAB
    }

    let filteredFiles = [];
    let title = '最近上传';

    switch (currentView) {
        case 'files':
            filteredFiles = files.filter(f => !f.is_deleted);
            title = '我的文件';
            break;
        case 'shared':
            filteredFiles = files.filter(f => !f.is_deleted && f.is_shared);
            title = '已共享文件';
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
        filteredFiles = filteredFiles.filter(f => f.name.toLowerCase().includes(query));
        title = `搜索: "${searchQuery}"`;
    }

    if (sectionTitle) sectionTitle.textContent = title;

    // Sort folders first
    filteredFiles.sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        // If same type, keep original order (created_at desc)
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
        // Apply highlighting if searching
        if (searchQuery) {
            // Escape special regex characters
            const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escapedQuery})`, 'gi');
            displayName = displayName.replace(regex, '<span class="search-highlight">$1</span>');
        }

        return `
        <div class="file-card" data-id="${file.id}" data-url="${file.url}" data-name="${file.name}" data-shared="${file.is_shared}">
            <div class="file-icon">
                ${fileIcons[file.type] || fileIcons.default}
            </div>
            <div class="file-info">
                <h3>${displayName}</h3>
                <p>${file.size} • ${timeString}</p>
                ${file.is_shared ? '<span style="font-size: 10px; background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 4px;">已共享</span>' : ''}
            </div>
        </div>
    `}).join('');
}

// Utils
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
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
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Reset input immediately
    const input = event.target;
    
    // Create Task
    let lastLoaded = 0;
    let lastTime = Date.now();
    let taskId;

    const fileName = `${Date.now()}_${file.name}`;
    
    // Configure TUS Upload
    const projectId = 'fmxddvjgkykuqwmasigo'; 
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
        onError: function(error) {
            console.error('Failed because: ' + error);
            manager.errorTask(taskId, '上传失败: ' + error.message);
        },
        onProgress: function(bytesUploaded, bytesTotal) {
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
        onSuccess: async function() {
            manager.completeTask(taskId);
            
            // Get public URL
            const { data: { publicUrl } } = client.storage
                .from(bucketName)
                .getPublicUrl(fileName);

            // Insert into Database
            const { error: dbError } = await client
                .from('files')
                .insert({
                    name: file.name,
                    type: getFileType(file.name),
                    size: formatSize(file.size),
                    url: publicUrl,
                    is_deleted: false,
                    is_shared: false
                });

            if (dbError) {
                console.error('DB Insert Error', dbError);
                showToast('上传成功但保存记录失败');
            } else {
                showToast('文件上传完成');
                // If not in task view, maybe switch or just notify
                if (currentView !== 'tasks') {
                    // Refresh current list if needed (realtime sub handles this mostly)
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
    
    input.value = '';
    
    showToast('已添加到传输列表');
}

// Download Handling
async function handleDownload() {
    if (!selectedFile) return;

    showToast('已添加到传输列表');
    contextMenu.style.display = 'none';

    const fileUrl = selectedFile.url;
    const fileName = selectedFile.name;
    const fileSizeStr = selectedFile.size; 
    
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
        showToast(newStatus ? '文件已共享' : '已取消共享');
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
            is_shared: false
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
        
        // 1. Delete from Storage (Optional, getting path from URL is tricky without storing it)
        // For simplicity, we just delete the record for now, or try to parse path
        // Assuming filename is last part of URL path
        try {
            const path = selectedFile.url.split('/').pop();
            await client.storage.from('cloud-files').remove([path]);
        } catch (e) {
            console.error('Storage delete error', e);
        }

        const { error } = await client
            .from('files')
            .delete()
            .eq('id', selectedFile.id);

        if (error) {
            showToast('删除失败: ' + error.message);
        } else {
            showToast('文件已永久删除');
        }

    } else {
        // Soft Delete (Move to Trash)
        const { error } = await client
            .from('files')
            .update({ is_deleted: true })
            .eq('id', selectedFile.id);

        if (error) {
            showToast('操作失败: ' + error.message);
        } else {
            showToast('文件已移至回收站');
        }
    }
}

// Event Listeners
function setupEventListeners() {
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
                renderFiles(); // This will now handle switching views
            }

            if (window.innerWidth <= 768) {
                toggleSidebar();
            }
        });
    });

    // Handle view switching explicitly in renderFiles

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
            const file = files.find(f => f.id === id);
            
            if (file) {
                selectedFile = file;
                
                // Show file options, hide New Folder
                newFolderAction.style.display = 'none';
                renameAction.style.display = 'flex';
                
                if (currentView === 'trash') {
                    renameAction.style.display = 'none'; // Can't rename in trash
                    shareAction.style.display = 'none';
                    restoreAction.style.display = 'flex';
                    deleteAction.style.display = 'flex';
                    document.getElementById('deleteText').textContent = '永久删除';
                } else {
                    shareAction.style.display = 'flex';
                    restoreAction.style.display = 'none';
                    deleteAction.style.display = 'flex';
                    document.getElementById('shareText').textContent = file.is_shared ? '取消共享' : '共享';
                    document.getElementById('deleteText').textContent = '删除';
                }

                // If folder, hide download/share if not supported, but for now keep simple
                if (file.type === 'folder') {
                    downloadAction.style.display = 'none'; // Can't download folder as zip yet
                } else {
                    downloadAction.style.display = 'flex';
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