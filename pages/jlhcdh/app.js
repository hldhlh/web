
// 初始化 Supabase
const SUPABASE_NODES = [
    'https://fmxddvjgkykuqwmasigo.supabase.co',
    // 'https://node2.example.com', // 预留备用节点
];
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteGRkdmpna3lrdXF3bWFzaWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwNDMzMjcsImV4cCI6MjA1OTYxOTMyN30.XCU4-03oajGh6M2-PNiBotCZSIDn_nJXkIC0Thjjfqo';

let supabaseClient = null;

// 智能线路选择 (竞速模式)
async function selectBestNode() {
    console.group('🚀 Supabase 智能线路优选 (竞速模式)');

    const races = SUPABASE_NODES.map(async node => {
        const start = performance.now();
        try {
            // 3s 超时控制
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            await fetch(`${node}/rest/v1/jlhcdh_products?select=id&limit=1`, {
                method: 'HEAD',
                headers: { 'apikey': SUPABASE_KEY },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const latency = Math.round(performance.now() - start);
            console.log(`📡 响应: ${node} - ${latency}ms`);
            return node; // Return node immediately on success
        } catch (e) {
            // console.warn(`❌ 排除: ${node}`); // Optional: reduce noise
            throw e; // Throw to let Promise.any skip this
        }
    });

    try {
        // Promise.any 返回第一个成功的 Promise，实现真正的"谁快用谁"
        const bestNode = await Promise.any(races);
        console.log(`🏆 胜出节点: ${bestNode}`);
        console.groupEnd();
        return bestNode;
    } catch (e) {
        console.warn('⚠️ 所有节点均不可用，使用默认');
        console.groupEnd();
        return SUPABASE_NODES[0];
    }
}

const state = {
    products: [],
    loading: true,
    currentCategory: '全部',
    onlyFavorites: false,
    searchQuery: '',
    orders: {},
    isLocked: false,
    cartLoading: false
};

const itemSyncStatus = {};

const els = {
    categoryList: document.getElementById('categoryList'),
    productList: document.getElementById('productList'),
    searchInput: document.getElementById('searchInput'),
    clearSearch: document.getElementById('clearSearch'),
    filterFavBtn: document.getElementById('filterFavBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    selectedCount: document.getElementById('selectedCount'),
    reviewBtn: document.getElementById('reviewBtn'),
    toast: document.getElementById('toast'),
    syncStatus: document.getElementById('syncStatus')
};

async function init() {
    try {
        if (typeof window.supabase === 'undefined') {
            throw new Error('Supabase SDK 未加载');
        }

        // 1. 优选节点
        const bestUrl = await selectBestNode();

        // 2. 初始化客户端
        supabaseClient = window.supabase.createClient(bestUrl, SUPABASE_KEY, {
            auth: { persistSession: false }
        });

        const [prodResult, cartResult] = await Promise.all([
            fetchProducts(),
            fetchCart()
        ]);
        // ... rest of init
        renderCategories();
        renderProducts();
        setupEventListeners();
        checkTodayLock();
        setupRealtime();
    } catch (e) {
        showError('初始化失败: ' + e.message);
    }
}

async function fetchCart() {
    const { data, error } = await supabaseClient
        .from('jlhcdh_cart')
        .select('*');

    if (error) {
        console.error('购物车加载失败', error);
        return;
    }

    state.orders = {};
    if (data) {
        data.forEach(item => {
            if (item.quantity > 0) {
                // Fix: Accumulate duplicates instead of overwriting
                const pid = item.product_id;
                state.orders[pid] = (state.orders[pid] || 0) + parseFloat(item.quantity);
            }
        });
    }
    updateFooter();
}

function setupRealtime() {
    supabaseClient
        .channel('cart_sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'jlhcdh_cart' }, payload => {
            handleCartUpdate(payload);
        })
        .subscribe();

    supabaseClient
        .channel('lock_sync')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jlhcdh_orders' }, () => {
            checkTodayLock();
        })
        .subscribe();
}

function handleCartUpdate(payload) {
    const { eventType, new: newRec, old: oldRec } = payload;
    let productId, qty;

    if (eventType === 'DELETE' && oldRec) {
        productId = oldRec.product_id;
        qty = 0;
    } else if (newRec) {
        productId = newRec.product_id;
        qty = parseFloat(newRec.quantity);
    }

    if (productId) {
        if (qty > 0) {
            state.orders[productId] = qty;
        } else {
            delete state.orders[productId];
        }

        updateUIProductQty(productId, qty || 0);
        updateFooter();
    }
}

function updateUIProductQty(id, qty) {
    const input = document.querySelector(`.product-card[data-id="${id}"] input`);
    if (input) {
        if (document.activeElement !== input) {
            input.value = qty > 0 ? qty : '';
        }
    }
}

window.updateQty = async (id, change) => {
    if (state.isLocked) {
        showToast('今日订单已锁定');
        return;
    }

    const currentQty = parseFloat(state.orders[id] || 0);
    let newQty = currentQty + change;
    if (newQty < 0) newQty = 0;
    newQty = parseFloat(newQty.toFixed(2));

    onQtyChangeLocal(id, newQty);
    await syncToSupabase(id, newQty);
};

window.onQtyChange = async (id, value) => {
    if (state.isLocked) return;

    let val = parseFloat(value);
    if (!val || val < 0) val = 0;
    val = parseFloat(val.toFixed(2));

    state.orders[id] = val;
    if (val === 0) delete state.orders[id];

    updateFooter();
    await syncToSupabase(id, val);
};

function onQtyChangeLocal(id, qty) {
    if (qty > 0) {
        state.orders[id] = qty;
    } else {
        delete state.orders[id];
    }
    updateUIProductQty(id, qty);
    updateFooter();
}

// 核心同步函数
// 同步防抖计时器映射
const syncTimeouts = {};

// 核心同步函数 (带防抖)
async function syncToSupabase(productId, quantity) {
    // 1. 清除该商品之前的待发送请求
    if (syncTimeouts[productId]) {
        clearTimeout(syncTimeouts[productId]);
    }

    setSyncStatus('syncing');

    // UI Feedback: Syncing
    itemSyncStatus[productId] = 'syncing';
    updateItemStatusUI(productId);

    // 2. 设置新的延迟发送 (500ms)
    syncTimeouts[productId] = setTimeout(async () => {
        try {
            // 发送最终值
            // 使用 Delete + Insert 策略保证唯一性 (虽然略慢但最稳)
            await supabaseClient.from('jlhcdh_cart').delete().eq('product_id', productId);

            if (quantity > 0) {
                await supabaseClient.from('jlhcdh_cart').insert({ product_id: productId, quantity });
            }

            setSyncStatus('online'); // 成功后恢复绿色
            delete syncTimeouts[productId];

            // UI Feedback: Saved
            itemSyncStatus[productId] = 'saved';
            updateItemStatusUI(productId);

            setTimeout(() => {
                delete itemSyncStatus[productId];
                updateItemStatusUI(productId);
            }, 1000);

        } catch (e) {
            console.error('Sync error:', e);
            setSyncStatus('offline'); // 失败变灰/红

            // UI Feedback: Error
            itemSyncStatus[productId] = 'error';
            updateItemStatusUI(productId);
        }
    }, 50); // 50ms防抖：响应更快
}

function setSyncStatus(status) {
    if (!els.syncStatus) return;
    els.syncStatus.className = `sync-status ${status}`;
    // 更新 Title
    if (status === 'syncing') els.syncStatus.title = '正在同步...';
    else if (status === 'online') els.syncStatus.title = '实时同步正常';
    else els.syncStatus.title = '同步异常';
}

function showError(msg) {
    els.productList.innerHTML = `<div style="text-align:center;padding:20px;color:#ff3b30"><i class="fas fa-exclamation-triangle"></i><p>${msg}</p><button onclick="location.reload()" style="margin-top:10px;padding:8px 16px;background:#007aff;color:white;border:none;border-radius:6px">刷新</button></div>`;
}

async function fetchProducts() {
    toggleLoading(true);
    try {
        const { data, error } = await supabaseClient.from('jlhcdh_products').select('*').order('category').order('id');
        if (error) throw error;

        const rawData = data || [];
        try {
            const { pinyin } = window.pinyinPro;
            state.products = rawData.map(p => ({
                ...p,
                pinyin: pinyin(p.name, { toneType: 'none', type: 'array' }).join(''),
                initials: pinyin(p.name, { pattern: 'first', toneType: 'none', type: 'array' }).join('')
            }));
        } catch (e) {
            state.products = rawData;
        }
    } catch (e) {
        showError(e.message);
    } finally {
        toggleLoading(false);
    }
}

function toggleLoading(isLoading) {
    if (isLoading) {
        els.productList.innerHTML = '<div class="skeleton-loader"><div class="skeleton-item"></div><div class="skeleton-item"></div></div>';
    }
}

function renderCategories() {
    const categories = ['全部', ...new Set(state.products.map(p => p.category))];
    els.categoryList.innerHTML = categories.map(cat =>
        `<button class="cat-btn ${cat === state.currentCategory ? 'active' : ''}" data-cat="${cat}">${cat}</button>`
    ).join('');
}

function renderProducts() {
    let filtered = state.products;
    if (state.currentCategory !== '全部') filtered = filtered.filter(p => p.category === state.currentCategory);
    if (state.onlyFavorites) filtered = filtered.filter(p => p.is_favorite);
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || (p.pinyin && p.pinyin.includes(q)) || (p.initials && p.initials.includes(q)));
    }

    if (filtered.length === 0) {
        els.productList.innerHTML = '<div style="text-align:center;padding:40px;color:#999"><i class="fas fa-carrot" style="font-size:48px;opacity:0.5;margin-bottom:10px"></i><p>无相关食材</p></div>';
        return;
    }

    // Status Tracker
    // const itemSyncStatus = {}; // Managed globally now

    els.productList.innerHTML = filtered.map(product => {
        const qty = state.orders[product.id] || '';
        const status = itemSyncStatus[product.id] ? `status-${itemSyncStatus[product.id]}` : '';

        return `
        <div class="product-card" data-id="${product.id}">
            <div class="fav-icon ${product.is_favorite ? 'active' : ''}" onclick="toggleFavorite(${product.id})">
                <i class="${product.is_favorite ? 'fas' : 'far'} fa-star"></i>
            </div>
            <div class="product-info">
                <div class="product-name">${product.name}</div>
                <div class="product-meta"><span class="tag">${product.category}</span></div>
            </div>
            <div id="wrapper-${product.id}" class="order-input-wrapper ${status}" style="transition:all 0.3s;">
                <button class="qty-btn minus" onclick="updateQty(${product.id}, -1)">−</button>
                <input type="number" class="qty-input" value="${qty}" placeholder="0" onchange="onQtyChange(${product.id}, this.value)" onfocus="this.select()">
                <button class="qty-btn plus" onclick="updateQty(${product.id}, 1)">+</button>
                <span class="unit-label">${product.unit || '份'}</span>
            </div>
        </div>`;
    }).join('');
}

function updateItemStatusUI(productId) {
    const wrapper = document.getElementById(`wrapper-${productId}`);
    if (wrapper) {
        const status = itemSyncStatus[productId];
        wrapper.classList.remove('status-syncing', 'status-saved', 'status-error');
        if (status) wrapper.classList.add(`status-${status}`);
    }
}

function setupEventListeners() {
    els.categoryList.addEventListener('click', e => {
        if (e.target.classList.contains('cat-btn')) {
            state.currentCategory = e.target.dataset.cat;
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderProducts();
        }
    });

    els.searchInput.addEventListener('input', e => {
        state.searchQuery = e.target.value.trim();
        els.clearSearch.classList.toggle('hidden', !state.searchQuery);
        renderProducts();
    });

    els.clearSearch.addEventListener('click', () => {
        state.searchQuery = '';
        els.searchInput.value = '';
        els.clearSearch.classList.add('hidden');
        renderProducts();
    });

    els.filterFavBtn.addEventListener('click', () => {
        state.onlyFavorites = !state.onlyFavorites;
        els.filterFavBtn.classList.toggle('active', state.onlyFavorites);
        renderProducts();
    });

    els.refreshBtn.addEventListener('click', () => {
        window.location.reload();
    });

    // 以前的提交逻辑改为跳转到核对页面
    els.reviewBtn.addEventListener('click', () => {
        window.location.href = 'orders.html';
    });
}

window.toggleFavorite = async (id) => {
    const p = state.products.find(x => x.id === id);
    if (!p) return;
    p.is_favorite = !p.is_favorite;

    const icon = document.querySelector(`.product-card[data-id="${id}"] .fav-icon i`);
    if (icon) icon.className = `${p.is_favorite ? 'fas' : 'far'} fa-star`;
    const btn = document.querySelector(`.product-card[data-id="${id}"] .fav-icon`);
    if (btn) btn.classList.toggle('active', p.is_favorite);

    await supabaseClient.from('jlhcdh_products').update({ is_favorite: p.is_favorite }).eq('id', id);
};

function updateFooter() {
    const count = Object.keys(state.orders).length;
    els.selectedCount.innerText = count;

    if (state.isLocked) {
        els.reviewBtn.disabled = true;
        els.reviewBtn.innerText = '今日已锁定';
        els.reviewBtn.style.background = '#8e8e93';
    } else {
        els.reviewBtn.disabled = false;
        els.reviewBtn.innerText = `去核对 (${count})`;
        els.reviewBtn.style.background = '';
    }
}

function showToast(msg) {
    els.toast.innerText = msg;
    els.toast.classList.add('show');
    setTimeout(() => els.toast.classList.remove('show'), 2000);
}
// Removed unused modal and order submission logic since we now rely on realtime persistence.

async function checkTodayLock() {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabaseClient
        .from('jlhcdh_orders')
        .select('order_data')
        .gte('created_at', today + 'T00:00:00')
        .lte('created_at', today + 'T23:59:59')
        .order('created_at', { ascending: false });

    state.isLocked = false;

    // Remove old banner logic
    const banner = document.getElementById('lock-banner');
    if (banner) banner.remove();

    if (data) {
        const statusRecord = data.find(r => r.order_data && r.order_data.type === 'lock_status');
        if (statusRecord && statusRecord.order_data.locked) {
            state.isLocked = true;
        }
    }

    // Update Status Dot
    if (els.syncStatus) {
        if (state.isLocked) {
            els.syncStatus.className = 'sync-status';
            els.syncStatus.style.backgroundColor = '#ff3b30'; // Red
            els.syncStatus.title = '今日已锁定';
        } else {
            els.syncStatus.style.backgroundColor = '';
            els.syncStatus.className = 'sync-status online';
            els.syncStatus.title = '实时同步中';
        }
    }

    updateFooter();
}

init();
