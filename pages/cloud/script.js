const SUPABASE_URL = 'https://fmxddvjgkykuqwmasigo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteGRkdmpna3lrdXF3bWFzaWdvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDA0MzMyNywiZXhwIjoyMDU5NjE5MzI3fQ.03Je2x-ixNl0SUzjSHmGy_fmybYbkxyg6prdv7TumI8';
const BUCKET_NAME = 'cloud-storage';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
function showToast(message, duration = 3000) {
    if (!toast || !toastMessage) return;
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
        toast.classList.add('hidden');
    }, duration);
}
let currentCategory = 'all';
let currentView = 'grid';
let currentFiles = [];
let selectedFile = null;
let searchQuery = '';
const imageCache = {
    storage: {},
    localStorageKey: 'cloud_image_cache',
    cacheLifetime: 24 * 60 * 60 * 1000,
    init() {
        try {
            const storedCache = localStorage.getItem(this.localStorageKey);
            if (storedCache) {
                const parsedCache = JSON.parse(storedCache);
                this.cleanExpiredCache(parsedCache);
                this.storage = parsedCache;
            }
        } catch (error) {
            console.warn('鍒濆鍖栧浘鐗囩紦瀛樺け璐?', error);
            this.storage = {};
        }
    },
    async getImageUrl(fileName) {
        try {
            // 妫€鏌ュ唴瀛樼紦瀛?
            const cachedItem = this.storage[fileName];
            if (cachedItem && cachedItem.expires > Date.now()) {
                // 濡傛灉缂撳瓨鐨勬槸鍏叡 URL锛岀洿鎺ヨ繑鍥?
                if (!cachedItem.url.includes('/sign/')) { // 绠€鍗曞垽鏂槸鍚︿负绛惧悕 URL
                    return cachedItem.url;
                }
                // 濡傛灉缂撳瓨鐨勬槸绛惧悕 URL锛屽垯蹇界暐缂撳瓨锛岀户缁線涓嬭幏鍙栨柊鐨?URL
            }

            // 缂撳瓨鏃犳晥鎴栦负绛惧悕 URL锛屽皾璇曡幏鍙栨柊鐨勭鍚?URL
            try {
                const { data, error } = await supabase.storage
                    .from(BUCKET_NAME)
                    .createSignedUrl(fileName, 5 * 60); // 缂╃煭鏈夋晥鏈熻嚦5鍒嗛挓锛屽噺灏戣繃鏈熼闄?

                if (!error && data.signedUrl) {
                    // 鑾峰彇鎴愬姛锛屾洿鏂扮紦瀛橈紙浣嗕笅娆′粛浼氶噸鏂拌幏鍙栨柊鐨勭鍚峌RL锛?
                    this.storage[fileName] = {
                        url: data.signedUrl,
                        expires: Date.now() + this.cacheLifetime // 浠嶇劧浣跨敤闀跨紦瀛樻椂闂存爣璁帮紝浣嗛€昏緫涓婁細蹇界暐
                    };
                    this.saveToLocalStorage();
                    return data.signedUrl;
                }
                // 濡傛灉鑾峰彇绛惧悕 URL 鍑洪敊锛岀户缁皾璇曞叕鍏?URL
                if(error) console.warn(`鑾峰彇绛惧悕URL澶辫触 (${fileName}):`, error.message);

            } catch (signError) {
                 console.warn(`鑾峰彇绛惧悕URL寮傚父 (${fileName}):`, signError);
            }

            // 鑾峰彇绛惧悕 URL 澶辫触鎴栧嚭閿欙紝灏濊瘯浣跨敤鍏叡 URL
            const publicUrl = supabase.storage
                .from(BUCKET_NAME)
                .getPublicUrl(fileName).data.publicUrl;

            // 鏇存柊缂撳瓨涓哄叕鍏?URL
            this.storage[fileName] = {
                url: publicUrl,
                expires: Date.now() + this.cacheLifetime
            };
            this.saveToLocalStorage();
            return publicUrl;

        } catch (error) {
            console.error(`鑾峰彇鍥剧墖URL澶辫触 (${fileName}):`, error);
             // 灏濊瘯鍐嶆鑾峰彇鍏叡URL浣滀负鏈€缁堝閫?
            try {
                const publicUrl = supabase.storage
                    .from(BUCKET_NAME)
                    .getPublicUrl(fileName).data.publicUrl;
                return publicUrl;
            } catch (e) {
                console.error(`鑾峰彇鍏叡URL涔熷け璐?(${fileName}):`, e);
                return null;
            }
        }
    },
    saveToLocalStorage() {
        try {
            localStorage.setItem(this.localStorageKey, JSON.stringify(this.storage));
        } catch (error) {
            console.warn('淇濆瓨缂撳瓨鍒發ocalStorage澶辫触:', error);
            if (error instanceof DOMException && error.name === 'QuotaExceededError') {
                this.cleanOldestHalf();
                try {
                    localStorage.setItem(this.localStorageKey, JSON.stringify(this.storage));
                } catch (innerError) {
                    console.error('娓呯悊鍚庝粛鏃犳硶淇濆瓨缂撳瓨:', innerError);
                }
            }
        }
    },
    cleanExpiredCache(cacheObj) {
        const now = Date.now();
        for (const key in cacheObj) {
            if (cacheObj[key].expires < now) {
                delete cacheObj[key];
            }
        }
    },
    cleanOldestHalf() {
        const entries = Object.entries(this.storage);
        if (entries.length === 0) return;
        entries.sort((a, b) => a[1].expires - b[1].expires);
        const halfLength = Math.floor(entries.length / 2);
        for (let i = 0; i < halfLength; i++) {
            delete this.storage[entries[i][0]];
        }
    },
    clear() {
        this.storage = {};
        localStorage.removeItem(this.localStorageKey);
    }
};
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_FILE_TYPES = {
    images: ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'tiff', 'ico'],
    documents: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'rtf'],
    videos: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'm4v'],
    audios: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma'],
    archives: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'],
    code: ['html', 'css', 'js', 'json', 'xml', 'php', 'py', 'java', 'cpp', 'c', 'cs', 'rb', 'pl', 'sh', 'ts', 'jsx', 'tsx']
};
const uploadInput = document.getElementById('file-upload');
const fileList = document.getElementById('file-list');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const viewButtons = document.querySelectorAll('.view-btn');
const categoryButtons = document.querySelectorAll('.category');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalContent = modal.querySelector('.modal-content');
const closeModal = document.querySelector('.close-modal');
const uploadProgressContainer = document.getElementById('upload-progress-container');
const closeProgressBtn = document.getElementById('close-progress');
const uploadProgressItems = document.getElementById('upload-progress-items');
const storageProgress = document.getElementById('storage-progress');
const usedStorage = document.getElementById('used-storage');
const totalStorage = document.getElementById('total-storage');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');
const dropArea = document.getElementById('drop-area');
const dropOverlay = document.getElementById('drop-overlay');
let simpleContextMenu = null;
document.addEventListener('DOMContentLoaded', initialize);
function on(selectorOrEl, evt, handler) {
    const els = typeof selectorOrEl === 'string'
        ? document.querySelectorAll(selectorOrEl)
        : [selectorOrEl];
    els.forEach(el => el.addEventListener(evt, handler));
}
function setupEventHandlers() {
    on(uploadInput, 'change', e => handleFiles(e.target.files));
    on(closeProgressBtn, 'click', () => uploadProgressContainer.classList.add('hidden'));
    on('#search-btn', 'click', () => { searchQuery = searchInput.value.trim().toLowerCase(); filterFiles(); });
    on('#search-input', 'keyup', e => { if (e.key === 'Enter') { searchQuery = searchInput.value.trim().toLowerCase(); filterFiles(); }});
    on('.view-btn', 'click', e => changeView(e.currentTarget.dataset.view));
    on('.category', 'click', e => changeCategory(e.currentTarget.dataset.category));
    on(window, 'click', e => {
        if (e.target === modal) {
            modal.style.display = 'none';
            if (modalContent) {
                modalContent.style.width = '';
                modalContent.style.height = '';
            }
        }
    });
    on(document, 'click', hideContextMenu);
    on(window, 'keydown', e => { if (e.key === 'Escape') hideContextMenu(); });
    initDragAndDrop();
}
async function initialize() {
    imageCache.init();
    await createBucketIfNotExists();
    fileList.className = `file-list ${currentView}-view`;
    await loadFiles();
    await updateStorageUsage();
    setupEventHandlers();
}
async function createBucketIfNotExists() {
    try {
        const { data: buckets } = await supabase.storage.listBuckets();
        const bucketExists = buckets.some(bucket => bucket.name === BUCKET_NAME);
        if (!bucketExists) {
            await supabase.storage.createBucket(BUCKET_NAME, {
                public: true
            });
            console.log(`鍒涘缓瀛樺偍妗?${BUCKET_NAME} 鎴愬姛`);
        }
    } catch (error) {
        console.error('鍒涘缓瀛樺偍妗跺け璐?', error);
        showToast('鍒涘缓瀛樺偍妗跺け璐ワ紝璇锋鏌ョ綉缁滆繛鎺?);
    }
}
function initDragAndDrop() {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });
    function highlight() {
        dropOverlay.classList.add('active');
    }
    function unhighlight() {
        dropOverlay.classList.remove('active');
    }
    dropArea.addEventListener('drop', handleDrop, false);
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }
    dropOverlay.querySelector('.drop-message').addEventListener('click', () => {
        uploadInput.click();
    });
    const dropMessage = dropOverlay.querySelector('.drop-message');
    if (dropMessage) {
        dropMessage.innerHTML = `
            <div class="drop-icon">
                <i class="fas fa-cloud-upload-alt"></i>
            </div>
            <p>灏嗘枃浠舵嫋鏀惧埌姝ゅ鎴栫偣鍑讳笂浼?/p>
            <div class="supported-formats">
                <p>鏀寔鐨勬牸寮?</p>
                <div class="format-tags">
                    <span class="format-tag">鍥剧墖</span>
                    <span class="format-tag">鏂囨。</span>
                    <span class="format-tag">瑙嗛</span>
                    <span class="format-tag">闊抽</span>
                    <span class="format-tag">鍘嬬缉鍖?/span>
                    <span class="format-tag">浠ｇ爜</span>
                </div>
            </div>
        `;
    }
}
async function loadFiles() {
    showLoading(true);
    try {
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .list('', {
                sortBy: { column: 'name', order: 'asc' }
            });
        if (error) throw error;
        currentFiles = data || [];
        filterFiles();
    } catch (error) {
        console.error('鍔犺浇鏂囦欢澶辫触:', error);
        showToast('鍔犺浇鏂囦欢澶辫触锛岃妫€鏌ョ綉缁滆繛鎺?);
        fileList.innerHTML = '<div class="error-message">鍔犺浇鏂囦欢澶辫触锛岃閲嶈瘯</div>';
    } finally {
        showLoading(false);
    }
}
function filterFiles() {
    let filteredFiles = [...currentFiles];
    if (currentCategory !== 'all') {
        filteredFiles = filteredFiles.filter(file => {
            const fileType = getFileType(file.name).toLowerCase();
            switch (currentCategory) {
                case 'images':
                    return ALLOWED_FILE_TYPES.images.includes(fileType);
                case 'documents':
                    return ALLOWED_FILE_TYPES.documents.includes(fileType);
                case 'others':
                    return !Object.values(ALLOWED_FILE_TYPES).flat().includes(fileType);
                default:
                    return true;
            }
        });
    }
    if (searchQuery) {
        filteredFiles = filteredFiles.filter(file =>
            file.name.toLowerCase().includes(searchQuery)
        );
    }
    renderFiles(filteredFiles);
}
function handleFiles(files) {
    if (!files || files.length === 0) return;
    uploadProgressContainer.classList.remove('hidden');
    uploadProgressItems.innerHTML = '';
    Array.from(files).forEach((file, index) => {
        const fileId = `file-${Date.now()}-${index}`;
        addFileToUploadQueue(file, fileId);
        processFileUpload(file, fileId);
    });
}
function addFileToUploadQueue(file, fileId) {
    const progressItem = document.createElement('div');
    progressItem.className = 'upload-progress-item';
    progressItem.innerHTML = `
        <span class="upload-file-name">${file.name}</span>
        <div class="upload-progress-bar">
            <div id="${fileId}" class="upload-progress" style="width: 0%;"></div>
        </div>
        <div class="upload-status">
            <span id="${fileId}-status">鍑嗗涓婁紶...</span>
            <span id="${fileId}-percent">0%</span>
        </div>
    `;
    uploadProgressItems.appendChild(progressItem);
    uploadProgressContainer.classList.remove('hidden');
}
function sanitizeFileName(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
async function processFileUpload(file, fileId) {
    if (file.size > MAX_FILE_SIZE) {
        document.getElementById(fileId).classList.add('error');
        document.getElementById(`${fileId}-status`).textContent = '鏂囦欢杩囧ぇ';
        document.getElementById(`${fileId}-percent`).textContent = '閿欒';
        showToast(`鏂囦欢 ${file.name} 瓒呰繃鏈€澶т笂浼犻檺鍒讹紙100MB锛塦);
        return;
    }
    const fileType = getFileType(file.name).toLowerCase();
    const isAllowedType = Object.values(ALLOWED_FILE_TYPES).some(types => types.includes(fileType));
    if (!isAllowedType) {
        showToast(`璀﹀憡锛氭枃浠剁被鍨?${fileType} 鍙兘涓嶅彈鏀寔`);
    }
    const safeName = sanitizeFileName(file.name);
    const fileExists = currentFiles.some(existingFile =>
        existingFile.name.toLowerCase() === safeName.toLowerCase());
    if (fileExists) {
        document.getElementById(`${fileId}-status`).textContent = '鏂囦欢宸插瓨鍦?;
        document.getElementById(`${fileId}-percent`).textContent = '绛夊緟纭';
        if (!confirm(`鏂囦欢 "${file.name}" 宸插瓨鍦紝鏄惁瑕嗙洊锛焋)) {
            document.getElementById(fileId).classList.add('error');
            document.getElementById(`${fileId}-status`).textContent = '宸插彇娑?;
            return;
        }
    }
    try {
        const progressEl = document.getElementById(fileId);
        const percentEl = document.getElementById(`${fileId}-percent`);
        const statusEl = document.getElementById(`${fileId}-status`);
        if (statusEl) {
            statusEl.textContent = '涓婁紶涓?..';
        }
        if (progressEl) {
            progressEl.classList.add('uploading');
        }
        let simulatedPercent = 0;
        let isUploading = true;
        let lastRealPercent = 0;
        const progressSimulator = setInterval(() => {
            if (!isUploading) {
                clearInterval(progressSimulator);
                return;
            }
            const increment = Math.max(0.5, (95 - simulatedPercent) / 20);
            simulatedPercent = Math.min(95, simulatedPercent + increment);
            const displayPercent = Math.max(lastRealPercent, Math.floor(simulatedPercent));
            if (progressEl) {
                progressEl.style.width = `${displayPercent}%`;
            }
            if (percentEl) {
                percentEl.textContent = `${displayPercent}%`;
            }
        }, 200);
        const updateProgress = (progress) => {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            lastRealPercent = percent;
            if (percent >= 100) {
                isUploading = false;
                if (progressEl) {
                    progressEl.classList.remove('uploading');
                    progressEl.style.width = '100%';
                }
                if (percentEl) {
                    percentEl.textContent = '100%';
                }
            }
        };
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(safeName, file, {
                cacheControl: '3600',
                upsert: true,
                contentType: file.type || 'application/octet-stream',
                onUploadProgress: updateProgress
            });
        isUploading = false;
        clearInterval(progressSimulator);
        if (error) throw error;
        if (progressEl) {
            progressEl.classList.remove('uploading');
            progressEl.classList.add('complete');
            progressEl.style.width = '100%';
            progressEl.classList.add('complete-animation');
        }
        if (statusEl) {
            statusEl.textContent = '涓婁紶瀹屾垚';
        }
        if (percentEl) {
            percentEl.textContent = '100%';
        }
        await loadFiles();
        await updateStorageUsage();
    } catch (error) {
        console.error(`涓婁紶鏂囦欢 ${file.name} 澶辫触:`, error);
        const progressEl = document.getElementById(fileId);
        const statusEl = document.getElementById(`${fileId}-status`);
        const percentEl = document.getElementById(`${fileId}-percent`);
        if (progressEl) {
            progressEl.classList.remove('uploading');
            progressEl.classList.add('error');
            progressEl.classList.add('error-animation');
        }
        if (statusEl) {
            statusEl.textContent = '涓婁紶澶辫触';
        }
        if (percentEl) {
            percentEl.textContent = '閿欒';
        }
        showToast(`涓婁紶鏂囦欢 ${file.name} 澶辫触: ${error.message}`);
    }
}
function changeView(view) {
    viewButtons.forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.view-btn[data-view="${view}"]`).classList.add('active');
    currentView = view;
    fileList.className = `file-list ${view}-view`;
    filterFiles();
}
function changeCategory(category) {
    categoryButtons.forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.category[data-category="${category}"]`).classList.add('active');
    currentCategory = category;
    filterFiles();
}
async function downloadSelectedFile() {
    if (!selectedFile) return;
    try {
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .download(selectedFile.name);
        if (error) throw error;
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = selectedFile.name;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
        showToast('鏂囦欢涓嬭浇寮€濮?);
    } catch (error) {
        console.error('涓嬭浇鏂囦欢澶辫触:', error);
        showToast('涓嬭浇鏂囦欢澶辫触: ' + error.message);
    }
}
async function shareSelectedFile() {
    if (!selectedFile) return;
    try {
        const { data } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(selectedFile.name);
        modalTitle.textContent = '鍒嗕韩鏂囦欢';
        modalBody.innerHTML = `
            <div class="form-group">
                <label>鍒嗕韩閾炬帴</label>
                <div style="display: flex; margin-bottom: 10px;">
                    <input type="text" id="share-link" class="form-control" value="${data.publicUrl}" readonly>
                    <button id="copy-link" class="btn" style="margin-left: 10px; border-radius: 4px;">澶嶅埗</button>
                </div>
            </div>
            <button id="close-share" class="form-btn">鍏抽棴</button>
        `;
        document.getElementById('copy-link').addEventListener('click', () => {
            const shareLink = document.getElementById('share-link');
            shareLink.select();
            document.execCommand('copy');
            showToast('閾炬帴宸插鍒跺埌鍓创鏉?);
        });
        document.getElementById('close-share').addEventListener('click', () => {
            modal.style.display = 'none';
        });
        modal.style.display = 'block';
    } catch (error) {
        console.error('鍒涘缓鍒嗕韩閾炬帴澶辫触:', error);
        showToast('鍒涘缓鍒嗕韩閾炬帴澶辫触: ' + error.message);
    }
}
function showRenameForm() {
    if (!selectedFile) return;
    modalTitle.textContent = '閲嶅懡鍚嶆枃浠?;
    modalBody.innerHTML = `
        <div class="form-group">
            <label for="new-name">鏂版枃浠跺悕</label>
            <input type="text" id="new-name" class="form-control" value="${selectedFile.name}">
        </div>
        <button id="rename-submit" class="form-btn">纭</button>
    `;
    document.getElementById('rename-submit').addEventListener('click', handleRename);
    modal.style.display = 'block';
}
async function handleRename() {
    const newName = document.getElementById('new-name').value.trim();
    if (!newName) {
        showToast('璇疯緭鍏ユ湁鏁堢殑鏂囦欢鍚?);
        return;
    }
    if (newName === selectedFile.name) {
        modal.style.display = 'none';
        return;
    }
    try {
        modalBody.innerHTML = `
            <div style="text-align: center;">
                <div class="spinner" style="margin: 20px auto;"></div>
                <p>姝ｅ湪閲嶅懡鍚嶆枃浠讹紝璇风◢鍊?..</p>
            </div>
        `;
        const { data: fileData, error: downloadError } = await supabase.storage
            .from(BUCKET_NAME)
            .download(selectedFile.name);
        if (downloadError) throw downloadError;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(newName, fileData, {
                upsert: false
            });
        if (uploadError) throw uploadError;
        const { error: deleteError } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([selectedFile.name]);
        if (deleteError) throw deleteError;
        modal.style.display = 'none';
        showToast('鏂囦欢閲嶅懡鍚嶆垚鍔?);
        await loadFiles();
    } catch (error) {
        console.error('閲嶅懡鍚嶆枃浠跺け璐?', error);
        showToast('閲嶅懡鍚嶆枃浠跺け璐? ' + error.message);
        modalBody.innerHTML = `
            <div style="text-align: center;" class="error-message">
                <p>閲嶅懡鍚嶅け璐? ${error.message}</p>
                <button id="retry-rename" class="form-btn" style="margin-top: 15px;">閲嶈瘯</button>
            </div>
        `;
        document.getElementById('retry-rename').addEventListener('click', handleRename);
    }
}
function confirmDeleteFile() {
    if (!selectedFile) return;
    modalTitle.textContent = '鍒犻櫎鏂囦欢';
    modalBody.innerHTML = `
        <p>纭畾瑕佸垹闄ゆ枃浠?"${selectedFile.name}" 鍚楋紵姝ゆ搷浣滀笉鍙挙閿€銆?/p>
        <div style="display: flex; justify-content: space-between; margin-top: 20px;">
            <button id="delete-cancel" class="btn" style="background-color: var(--text-light);">鍙栨秷</button>
            <button id="delete-confirm" class="btn" style="background-color: var(--danger-color);">鍒犻櫎</button>
        </div>
    `;
    document.getElementById('delete-cancel').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    document.getElementById('delete-confirm').addEventListener('click', handleDelete);
    modal.style.display = 'block';
}
async function handleDelete() {
    try {
        modalBody.innerHTML = `
            <div style="text-align: center;">
                <div class="spinner" style="margin: 20px auto;"></div>
                <p>姝ｅ湪鍒犻櫎鏂囦欢锛岃绋嶅€?..</p>
            </div>
        `;
        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .remove([selectedFile.name]);
        if (error) throw error;
        modal.style.display = 'none';
        showToast('鏂囦欢鍒犻櫎鎴愬姛');
        currentFiles = currentFiles.filter(file => file.name !== selectedFile.name);
        filterFiles();
        await updateStorageUsage();
    } catch (error) {
        console.error('鍒犻櫎鏂囦欢澶辫触:', error);
        modalBody.innerHTML = `
            <div style="text-align: center;" class="error-message">
                <p>鍒犻櫎澶辫触: ${error.message}</p>
                <div style="display: flex; justify-content: center; gap: 10px; margin-top: 15px;">
                    <button id="retry-delete" class="btn" style="background-color: var(--danger-color);">閲嶈瘯</button>
                    <button id="cancel-delete" class="btn" style="background-color: var(--text-light);">鍙栨秷</button>
                </div>
            </div>
        `;
        document.getElementById('retry-delete').addEventListener('click', handleDelete);
        document.getElementById('cancel-delete').addEventListener('click', () => {
            modal.style.display = 'none';
        });
        showToast('鍒犻櫎鏂囦欢澶辫触: ' + error.message);
    }
}
function getFileType(fileName) {
    if (!fileName) return '';
    const parts = fileName.split('.');
    if (parts.length <= 1) return '';
    return parts[parts.length - 1].toLowerCase();
}
function getFileTypeDisplay(fileName) {
    if (!fileName) return '';
    return fileName.split('.').pop().toUpperCase();
}
function isFileOfType(fileName, typeCategory) {
    if (!fileName || !typeCategory) return false;
    const type = getFileType(fileName);
    if (typeCategory === 'images') {
        if (fileName.toLowerCase().includes('_ios')) {
            return true;
        }
        if (fileName.includes('_')) {
            const commonImageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
            return commonImageExtensions.some(ext => fileName.toLowerCase().endsWith(`.${ext}`));
        }
    }
    return ALLOWED_FILE_TYPES[typeCategory] && ALLOWED_FILE_TYPES[typeCategory].includes(type);
}
function showLoading(isLoading) {
    const loadingEl = document.getElementById('loading-indicator');
    if (loadingEl) {
        loadingEl.style.display = isLoading ? 'flex' : 'none';
    }
    if (isLoading) {
        fileList.innerHTML = '<div class="loading-message">姝ｅ湪鍔犺浇鏂囦欢...</div>';
    }
}
function renderFiles(files) {
    if (files.length === 0) {
        fileList.innerHTML = '<div class="empty-message">娌℃湁鎵惧埌鏂囦欢</div>';
        return;
    }
    fileList.className = `file-list ${currentView}-view`;
    fileList.innerHTML = '';
    if (currentView === 'list') {
        const header = document.createElement('div');
        header.className = 'file-list-header';
        header.innerHTML = `
            <div></div>
            <div>鏂囦欢鍚?/div>
            <div>绫诲瀷</div>
            <div>澶у皬</div>
            <div>鏃ユ湡</div>
            <div>鎿嶄綔</div>
        `;
        fileList.appendChild(header);
    }
    files.forEach(file => {
        if (file.name === '.emptyFolderPlaceholder') return;
        const fileType = getFileType(file.name);
        const fileTypeDisplay = getFileTypeDisplay(file.name);
        const fileTypeClass = getFileTypeClass(fileType);
        const fileIcon = getFileIcon(fileType);
        const fileSize = formatBytes(file.metadata?.size || 0);
        const fileDate = formatDate(new Date(file.metadata?.lastModified || Date.now()));
        const isImage = isFileOfType(file.name, 'images');
        const fileEl = document.createElement('div');
        fileEl.className = 'file-item';
        fileEl.setAttribute('data-name', file.name);
        fileEl.setAttribute('data-type', fileTypeDisplay);
        if (currentView === 'grid') {
            fileEl.innerHTML = `
                <div class="file-icon ${fileTypeClass}">
                    ${isImage ? '' : fileIcon}
                    <span class="file-type-badge">${fileTypeDisplay}</span>
                </div>
                <div class="file-name" title="${file.name}">${file.name}</div>
                <div class="file-meta">
                    <span>${fileSize}</span>
                    <span>${fileDate.split(' ')[0]}</span>
                </div>
            `;
            if (isImage) {
                generateThumbnail(file.name, fileEl);
            }
        } else {
            fileEl.innerHTML = `
                <div class="file-icon ${fileTypeClass}">${fileIcon}</div>
                <div class="file-name" title="${file.name}">${file.name}</div>
                <div class="file-type">${fileTypeDisplay}</div>
                <div class="file-size">${fileSize}</div>
                <div class="file-date">${fileDate}</div>
                <div class="file-actions">
                    <button class="action-btn download-btn" title="涓嬭浇">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="action-btn share-btn" title="鍒嗕韩">
                        <i class="fas fa-share-alt"></i>
                    </button>
                    <button class="action-btn delete-btn" title="鍒犻櫎">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        }
        fileEl.addEventListener('click', (e) => {
            if (!e.target.closest('.action-btn')) {
                handleFileClick(file);
            }
        });
        fileEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            selectedFile = file;
            showSimpleContextMenu(e, file);
        });
        fileList.appendChild(fileEl);
        if (currentView === 'list') {
            fileEl.querySelector('.download-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                selectedFile = file;
                downloadSelectedFile();
            });
            fileEl.querySelector('.share-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                selectedFile = file;
                shareSelectedFile();
            });
            fileEl.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                selectedFile = file;
                confirmDeleteFile();
            });
        }
    });
}
function formatDate(date) {
    if (!(date instanceof Date) || isNaN(date)) return '鏈煡';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}/${month}/${day} ${hours}:${minutes}`;
}
async function generateThumbnail(fileName, fileEl) {
    try {
        const iconDiv = fileEl.querySelector('.file-icon');
        if (!iconDiv) return;
        iconDiv.innerHTML = '<div class="thumbnail-loading"><div class="spinner"></div></div>';

        // 浣跨敤 imageCache.getImageUrl 鐩存帴鑾峰彇 URL
        const imageUrl = await imageCache.getImageUrl(fileName);

        if (!imageUrl) {
            // 濡傛灉 getImageUrl 杩斿洖 null锛岃鏄庤幏鍙栧け璐ワ紝鐩存帴鏄剧ず榛樿鍥炬爣
            console.error(`鏃犳硶鑾峰彇鏂囦欢URL: ${fileName}`);
            iconDiv.style.backgroundImage = '';
            iconDiv.innerHTML = getFileIcon(getFileType(fileName));
            const typeTag = document.createElement('span');
            typeTag.className = 'file-type-badge';
            typeTag.textContent = getFileTypeDisplay(fileName);
            iconDiv.appendChild(typeTag);
            return;
        }

        const img = new Image();

        img.onload = () => {
            iconDiv.style.backgroundImage = `url('${imageUrl}')`;
            iconDiv.innerHTML = '';
            if (!isPreviewableImage(fileName)) {
                const typeTag = document.createElement('span');
                typeTag.className = 'file-type-badge';
                typeTag.textContent = getFileTypeDisplay(fileName);
                iconDiv.appendChild(typeTag);
            }
        };

        img.onerror = (errorEvent) => {
            // 澧炲己閿欒鏃ュ織
            console.error(`缂╃暐鍥惧姞杞藉け璐? ${fileName}`, `URL: ${imageUrl}`, errorEvent);

            // 鍔犺浇澶辫触锛屾樉绀洪粯璁ゅ浘鏍?
            iconDiv.style.backgroundImage = '';
            iconDiv.innerHTML = getFileIcon(getFileType(fileName));
            const typeTag = document.createElement('span');
            typeTag.className = 'file-type-badge';
            typeTag.textContent = getFileTypeDisplay(fileName);
            iconDiv.appendChild(typeTag);
        };

        img.src = imageUrl;
    } catch (error) {
        console.error(`鐢熸垚缂╃暐鍥炬椂鍙戠敓寮傚父: ${fileName}`, error);
        const iconDiv = fileEl.querySelector('.file-icon');
        if (iconDiv) {
            iconDiv.innerHTML = getFileIcon(getFileType(fileName));
            const typeTag = document.createElement('span');
            typeTag.className = 'file-type-badge';
            typeTag.textContent = getFileTypeDisplay(fileName);
            iconDiv.appendChild(typeTag);
        }
    }
}
function isPreviewableImage(fileName) {
    const type = getFileType(fileName);
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(type);
}
function getFileTypeClass(fileType) {
    const type = (fileType || '').toLowerCase();
    if (ALLOWED_FILE_TYPES.images.includes(type)) return 'file-image';
    if (ALLOWED_FILE_TYPES.documents.includes(type)) return 'file-document';
    if (ALLOWED_FILE_TYPES.videos.includes(type)) return 'file-video';
    if (ALLOWED_FILE_TYPES.audios.includes(type)) return 'file-audio';
    if (ALLOWED_FILE_TYPES.archives.includes(type)) return 'file-archive';
    if (ALLOWED_FILE_TYPES.code.includes(type)) return 'file-code';
    return 'file-other';
}
function getFileIcon(fileType) {
    const type = (fileType || '').toLowerCase();
    if (ALLOWED_FILE_TYPES.images.includes(type))
        return '<i class="fas fa-file-image"></i>';
    if (ALLOWED_FILE_TYPES.documents.includes(type))
        return '<i class="fas fa-file-alt"></i>';
    if (ALLOWED_FILE_TYPES.videos.includes(type))
        return '<i class="fas fa-file-video"></i>';
    if (ALLOWED_FILE_TYPES.audios.includes(type))
        return '<i class="fas fa-file-audio"></i>';
    if (ALLOWED_FILE_TYPES.archives.includes(type))
        return '<i class="fas fa-file-archive"></i>';
    if (ALLOWED_FILE_TYPES.code.includes(type))
        return '<i class="fas fa-file-code"></i>';
    return '<i class="fas fa-file"></i>';
}
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
async function updateStorageUsage() {
    try {
        const { data: files, error } = await supabase.storage
            .from(BUCKET_NAME)
            .list('');
        if (error) throw error;
        let totalSize = 0;
        files.forEach(file => {
            totalSize += file.metadata?.size || 0;
        });
        const usedSizeFormatted = formatBytes(totalSize);
        const totalSizeFormatted = formatBytes(500 * 1024 * 1024);
        usedStorage.textContent = usedSizeFormatted;
        totalStorage.textContent = totalSizeFormatted;
        const percentUsed = Math.min(100, (totalSize / (500 * 1024 * 1024)) * 100);
        storageProgress.style.width = `${percentUsed}%`;
        if (percentUsed > 90) {
            storageProgress.className = 'progress-bar danger';
        } else if (percentUsed > 70) {
            storageProgress.className = 'progress-bar warning';
        } else {
            storageProgress.className = 'progress-bar success';
        }
    } catch (error) {
        console.error('鏇存柊瀛樺偍浣跨敤鎯呭喌澶辫触:', error);
    }
}
async function previewFile(file) {
    const type = getFileType(file.name);
    // 浣跨敤 imageCache.getImageUrl 鐩存帴鑾峰彇 URL
    const url = await imageCache.getImageUrl(file.name);
    if (!url) return;

    let previewContentHtml;
    const isDirectPreview = ALLOWED_FILE_TYPES.images.includes(type) || ALLOWED_FILE_TYPES.videos.includes(type) || ALLOWED_FILE_TYPES.audios.includes(type);

    if (ALLOWED_FILE_TYPES.images.includes(type)) {
        previewContentHtml = `<img id="preview-media-element" src="${url}" alt="${file.name}" class="preview-media preview-image">`;
    } else if (ALLOWED_FILE_TYPES.videos.includes(type)) {
        previewContentHtml = `<video id="preview-media-element" controls class="preview-media preview-video" src="${url}">娴忚鍣ㄤ笉鏀寔瑙嗛棰勮</video>`;
    } else if (ALLOWED_FILE_TYPES.audios.includes(type)) {
        // 闊抽棰勮鏀惧湪瀹瑰櫒涓棿
        previewContentHtml = `<div class="audio-container"><audio id="preview-media-element" controls class="preview-media preview-audio" src="${url}">娴忚鍣ㄤ笉鏀寔闊抽棰勮</audio></div>`;
    } else {
        const size = formatBytes(file.metadata?.size || 0);
        const date = file.metadata?.lastModified ? formatDate(new Date(file.metadata.lastModified)) : '鏈煡';
        // 浼樺寲鏂囦欢淇℃伅灞曠ず
        previewContentHtml = `
            <div class="preview-details-minimal">
                <div class="file-icon large ${getFileTypeClass(type)}">${getFileIcon(type)}</div>
                <div class="details-text-minimal">
                    <p><strong class="detail-label">绫诲瀷:</strong> <span class="detail-value">${type || '鏈煡'} 鏂囦欢</span></p>
                    <p><strong class="detail-label">澶у皬:</strong> <span class="detail-value">${size}</span></p>
                    <p><strong class="detail-label">淇敼鏃ユ湡:</strong> <span class="detail-value">${date}</span></p>
                </div>
            </div>`;
    }

    modalTitle.textContent = file.name;
    // 浣跨敤鏂扮殑HTML缁撴瀯鍜孋SS绫?
    modalBody.innerHTML = `
        <div class="preview-modal-wrapper">
            <div class="preview-area ${isDirectPreview ? 'direct-preview' : 'info-preview'}" id="preview-content-container">
                ${previewContentHtml}
            </div>
            <!-- <div class="preview-actions-bar"> -->
                 <!-- <button id="modal-fullscreen" class="btn action-btn minimal-btn" title="鍏ㄥ睆"><i class="fas fa-expand"></i> <span class="btn-text">鍏ㄥ睆</span></button> -->
                 <!-- <button id="modal-download" class="btn action-btn minimal-btn" title="涓嬭浇"><i class="fas fa-download"></i> <span class="btn-text">涓嬭浇</span></button> -->
                 <!-- <button id="modal-share" class="btn action-btn minimal-btn" title="鍒嗕韩"><i class="fas fa-share-alt"></i> <span class="btn-text">鍒嗕韩</span></button> -->
                 <!-- <button id="modal-rename" class="btn action-btn minimal-btn" title="閲嶅懡鍚?><i class="fas fa-edit"></i> <span class="btn-text">閲嶅懡鍚?/span></button> -->
                 <!-- <button id="modal-delete" class="btn action-btn minimal-btn danger-btn" title="鍒犻櫎"><i class="fas fa-trash"></i> <span class="btn-text">鍒犻櫎</span></button> -->
            <!-- </div> -->
        </div>`;

    // modal.style.display = 'block'; // 杩欒琚Щ鍒?adjustModalSize 鍐呴儴浜?

    // 纭繚鎵€鏈変簨浠剁洃鍚櫒閮芥纭粦瀹?(绉婚櫎涓?action bar 鐩稿叧鐨?
    // on('#modal-download','click', downloadSelectedFile);
    // on('#modal-share','click', shareSelectedFile);
    // on('#modal-rename','click', showRenameForm);
    // on('#modal-delete','click', confirmDeleteFile);
    // on('#modal-fullscreen', 'click', handleFullscreen);

    // --- 鏂板锛氬姩鎬佽皟鏁存ā鎬佹灏哄 --- 
    const previewMediaElement = document.getElementById('preview-media-element');
    const adjustModalSize = (naturalWidth, naturalHeight) => {
        if (!modalContent) return;

        const maxWidth = window.innerWidth * 0.85;  // 涓?CSS max-width: 85vw 瀵瑰簲
        const maxHeight = window.innerHeight * 0.85; // 涓?CSS max-height: 85vh 瀵瑰簲

        const contentRatio = naturalWidth / naturalHeight;
        const containerMaxRatio = maxWidth / maxHeight;

        let targetWidth = maxWidth;
        let targetHeight = maxHeight;

        if (contentRatio > containerMaxRatio) {
            // 鍐呭姣斿鍣ㄦ洿瀹斤紝浠ュ搴︿负鍩哄噯缂╂斁楂樺害
            targetWidth = maxWidth;
            targetHeight = maxWidth / contentRatio;
        } else {
            // 鍐呭姣斿鍣ㄦ洿楂橈紙鎴栨瘮渚嬬浉鍚岋級锛屼互楂樺害涓哄熀鍑嗙缉鏀惧搴?
            targetHeight = maxHeight;
            targetWidth = maxHeight * contentRatio;
        }
        
        // 纭繚涓嶈秴杩囨渶澶у€硷紙鐞嗚涓婂墠闈㈢殑璁＄畻宸茬粡淇濊瘉锛屼絾鍔犱竴灞備繚闄╋級
        targetWidth = Math.min(targetWidth, maxWidth);
        targetHeight = Math.min(targetHeight, maxHeight);

        // 搴旂敤灏哄 - 鐩存帴璁剧疆 style 浼氳鐩?CSS锛岀‘淇?CSS 涓Щ闄ゅ浐瀹?width/height
        // 鎴戜滑宸茬粡鍦?CSS 涓娇鐢?max-width/max-height 鍜?width/height: auto锛?
        // 杩欓噷鏀逛负璁剧疆 modal-body 鎴?preview-area 鐨勫昂瀵稿彲鑳芥洿濂斤紝
        // 浣嗘渶绠€鍗曠殑鏄洿鎺ヤ慨鏀?modalContent 鐨?width/height 鏉ュ己鍒跺昂瀵搞€?
        modalContent.style.width = `${targetWidth}px`;
        modalContent.style.height = `${targetHeight}px`;

        // 閲嶆柊灞呬腑锛堝洜涓哄昂瀵稿彉浜嗭級
        // transform: translate(-50%, -50%) 搴旇鑳借嚜鍔ㄥ鐞嗗眳涓?
        
        // 鏄剧ず妯℃€佹
        modal.style.display = 'block';

        // --- 鏂板锛氭帶鍒舵帶浠舵樉闅愮殑浜嬩欢鐩戝惉 --- 
        const modalHeader = modal.querySelector('.modal-header');
        const previewArea = modal.querySelector('.preview-area');

        const showControls = () => {
            if (modalHeader) {
                modalHeader.style.opacity = '1';
                modalHeader.style.visibility = 'visible';
            }
            /* if (previewActionsBar) {
                previewActionsBar.style.opacity = '1';
                previewActionsBar.style.visibility = 'visible';
            } */
        };

        const hideControls = () => {
             if (modalHeader) {
                modalHeader.style.opacity = '0';
                modalHeader.style.visibility = 'hidden';
            }
            /* if (previewActionsBar) {
                previewActionsBar.style.opacity = '0';
                previewActionsBar.style.visibility = 'hidden';
            } */
        };

        if (previewArea) {
            // 绉婚櫎鏃х洃鍚櫒 (濡傛灉瀛樺湪)
            previewArea.removeEventListener('mouseenter', showControls);
            previewArea.removeEventListener('mouseleave', hideControls);

            // 娣诲姞鏂扮洃鍚櫒
            previewArea.addEventListener('mouseenter', showControls);
            previewArea.addEventListener('mouseleave', hideControls);
        }
        // --- 缁撴潫锛氭帶鍒舵帶浠舵樉闅愮殑浜嬩欢鐩戝惉 --- 
    };

    if (previewMediaElement && (previewMediaElement.tagName === 'IMG' || previewMediaElement.tagName === 'VIDEO')) {
        if (previewMediaElement.tagName === 'IMG') {
            if (previewMediaElement.complete) {
                // 鍥剧墖宸插姞杞藉畬鎴?(鍙兘鏉ヨ嚜缂撳瓨)
                adjustModalSize(previewMediaElement.naturalWidth, previewMediaElement.naturalHeight);
            } else {
                previewMediaElement.onload = () => {
                    adjustModalSize(previewMediaElement.naturalWidth, previewMediaElement.naturalHeight);
                };
                 previewMediaElement.onerror = () => {
                     // 鍔犺浇澶辫触锛屼娇鐢ㄩ粯璁ゆ渶澶у昂瀵告樉绀轰俊鎭?
                     modalContent.style.width = ''; // 娓呴櫎鍐呰仈鏍峰紡锛屾仮澶?CSS 鎺у埗
                     modalContent.style.height = '';
                     modal.style.display = 'block'; 
                 }
            }
        } else if (previewMediaElement.tagName === 'VIDEO') {
            if (previewMediaElement.readyState >= 1) { // HAVE_METADATA
                 // 瑙嗛鍏冩暟鎹凡鍔犺浇
                 adjustModalSize(previewMediaElement.videoWidth, previewMediaElement.videoHeight);
            } else {
                previewMediaElement.onloadedmetadata = () => {
                     adjustModalSize(previewMediaElement.videoWidth, previewMediaElement.videoHeight);
                };
                 previewMediaElement.onerror = () => {
                     // 鍔犺浇澶辫触锛屼娇鐢ㄩ粯璁ゆ渶澶у昂瀵告樉绀轰俊鎭?
                     modalContent.style.width = '';
                     modalContent.style.height = '';
                     modal.style.display = 'block'; 
                 }
            }
        }
    } else {
         // 闈炲浘鐗?瑙嗛锛屾垨鍏冪礌鏈壘鍒帮紝浣跨敤榛樿鏈€澶у昂瀵?
         modalContent.style.width = ''; // 娓呴櫎鍐呰仈鏍峰紡锛屾仮澶?CSS 鎺у埗
         modalContent.style.height = '';
         modal.style.display = 'block';
         // 瀵逛簬闈炲獟浣撴枃浠讹紝鍙兘闇€瑕佷竴鐩存樉绀烘帶浠讹紝鎴栬€呮牴鎹渶瑕佸鐞?
         // 鏆傛椂淇濇寔榛樿闅愯棌锛屽鏋滈渶瑕佷慨鏀瑰彲浠ュ彇娑堜笅闈㈢殑娉ㄩ噴
         // const modalHeader = modal.querySelector('.modal-header');
         // const previewActionsBar = modal.querySelector('.preview-actions-bar');
         // if(modalHeader) modalHeader.style.opacity = '1'; // 鎬绘槸鏄剧ず锛?
         // if(previewActionsBar) previewActionsBar.style.opacity = '1'; // 鎬绘槸鏄剧ず锛?
    }
    // --- 缁撴潫锛氬姩鎬佽皟鏁存ā鎬佹灏哄 --- 
}
function handleFileClick(file) {
    selectedFile = file;
    previewFile(file);
}
function createSimpleContextMenu() {
    if (simpleContextMenu) {
        document.body.removeChild(simpleContextMenu);
        simpleContextMenu = null;
    }
}
function showSimpleContextMenu(e, file) {
    e.preventDefault();
    if (simpleContextMenu) {
        document.body.removeChild(simpleContextMenu);
        simpleContextMenu = null;
    }
    simpleContextMenu = document.createElement('div');
    simpleContextMenu.className = 'simple-context-menu';
    simpleContextMenu.innerHTML = `
        <div class="menu-item download-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            涓嬭浇
        </div>
        <div class="menu-item share-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="18" cy="5" r="3"></circle>
                <circle cx="6" cy="12" r="3"></circle>
                <circle cx="18" cy="19" r="3"></circle>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
            鍒嗕韩閾炬帴
        </div>
        <div class="menu-divider"></div>
        <div class="menu-item rename-item">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"></path>
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
            閲嶅懡鍚?
        </div>
        <div class="menu-item delete-item delete">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            鍒犻櫎
        </div>
    `;
    document.body.appendChild(simpleContextMenu);
    simpleContextMenu.style.left = `${e.pageX}px`;
    simpleContextMenu.style.top = `${e.pageY}px`;
    const menuRect = simpleContextMenu.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    if (menuRect.right > windowWidth) {
        simpleContextMenu.style.left = `${windowWidth - menuRect.width}px`;
    }
    if (menuRect.bottom > windowHeight) {
        simpleContextMenu.style.top = `${windowHeight - menuRect.height}px`;
    }
    simpleContextMenu.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    const downloadItem = simpleContextMenu.querySelector('.download-item');
    const shareItem = simpleContextMenu.querySelector('.share-item');
    const renameItem = simpleContextMenu.querySelector('.rename-item');
    const deleteItem = simpleContextMenu.querySelector('.delete-item');
    downloadItem.addEventListener('click', () => {
        selectedFile = file;
        downloadSelectedFile();
        hideContextMenu();
    });
    shareItem.addEventListener('click', () => {
        selectedFile = file;
        shareSelectedFile();
        hideContextMenu();
    });
    renameItem.addEventListener('click', () => {
        selectedFile = file;
        showRenameForm();
        hideContextMenu();
    });
    deleteItem.addEventListener('click', () => {
        selectedFile = file;
        confirmDeleteFile();
        hideContextMenu();
    });
}
function hideContextMenu() {
    if (simpleContextMenu) {
        document.body.removeChild(simpleContextMenu);
        simpleContextMenu = null;
    }
}
function handleFullscreen() {
    const mediaElement = document.getElementById('preview-media-element');
    const containerElement = document.getElementById('preview-content-container');
    const elementToFullscreen = mediaElement || containerElement; // 浼樺厛鍏ㄥ睆濯掍綋锛屽惁鍒欏叏灞忓鍣?

    if (!elementToFullscreen) return;

    if (document.fullscreenElement) {
        // 濡傛灉宸叉槸鍏ㄥ睆锛屽垯閫€鍑哄叏灞?
        document.exitFullscreen().catch(err => console.error("閫€鍑哄叏灞忓け璐?", err));
    } else {
        // 璇锋眰鍏ㄥ睆
        if (elementToFullscreen.requestFullscreen) {
            elementToFullscreen.requestFullscreen().catch(err => console.error("璇锋眰鍏ㄥ睆澶辫触:", err));
        } else if (elementToFullscreen.webkitRequestFullscreen) { /* Safari */
            elementToFullscreen.webkitRequestFullscreen().catch(err => console.error("璇锋眰鍏ㄥ睆澶辫触 (webkit):", err));
        } else if (elementToFullscreen.msRequestFullscreen) { /* IE11 */
            elementToFullscreen.msRequestFullscreen().catch(err => console.error("璇锋眰鍏ㄥ睆澶辫触 (ms):", err));
        }
    }
}
