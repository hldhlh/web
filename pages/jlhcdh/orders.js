// 初始化 Supabase
const SUPABASE_NODES = [
    'https://fmxddvjgkykuqwmasigo.supabase.co',
];
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteGRkdmpna3lrdXF3bWFzaWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwNDMzMjcsImV4cCI6MjA1OTYxOTMyN30.XCU4-03oajGh6M2-PNiBotCZSIDn_nJXkIC0Thjjfqo';

let supabaseClient = null;

// 智能线路选择 (竞速模式)
async function selectBestNode() {
    console.group('🚀 Supabase 智能线路优选 (Orders - 竞速模式)');

    const races = SUPABASE_NODES.map(async node => {
        const start = performance.now();
        try {
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
            return node;
        } catch (e) {
            throw e;
        }
    });

    try {
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
    orders: [],
    cartItems: [],
    products: [],
    currentDate: (function () {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    })(),
    isLocked: false,
    lockRecord: null
};

const els = {
    dateInput: document.getElementById('dateInput'),
    dateInput: document.getElementById('dateInput'),
    summaryList: document.getElementById('summaryList'),
    orderCount: document.getElementById('orderCount'),
    lockBtn: document.getElementById('lockBtn'),
    statusContainer: document.getElementById('statusContainer'),
    toast: document.getElementById('toast')
};

async function init() {
    // 1. Init Client
    const bestUrl = await selectBestNode();
    supabaseClient = window.supabase.createClient(bestUrl, SUPABASE_KEY, {
        auth: { persistSession: false }
    });

    els.dateInput.value = state.currentDate;
    await fetchDayData();

    // 日期切换事件
    els.dateInput.addEventListener('change', (e) => {
        state.currentDate = e.target.value;
        fetchDayData();
    });



    // 锁定按钮
    els.lockBtn.addEventListener('click', toggleLock);

    // 开启实时订阅
    setupRealtime();
}

// 实时订阅
function setupRealtime() {
    // 监听订单提交或锁定 (历史快照更新)
    supabaseClient
        .channel('orders_realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jlhcdh_orders' }, payload => {
            fetchDayData(false); // Snapshots still need full fetch or complex logic, keep as is for now
        })
        .subscribe();

    // 监听购物车实时的变化 (作为今日主数据) - Incrementally update state
    supabaseClient
        .channel('cart_monitor')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'jlhcdh_cart' }, payload => {
            handleCartRealtimeUpdate(payload);
        })
        .subscribe();
}

// 增量处理实时购物车数据
function handleCartRealtimeUpdate(payload) {
    const isToday = (state.currentDate === getLocalTodayDate());
    if (!isToday) return; // Only update live cart if viewing today

    const { eventType, new: newRec, old: oldRec } = payload;
    let productId = newRec ? newRec.product_id : (oldRec ? oldRec.product_id : null);

    if (!productId) return;

    // Fetch product details if missing (rare case if product loaded, but safe check)
    // We assume state.products is loaded. If not, we might miss name/unit until next refresh.
    const prod = state.products.find(p => p.id == productId);
    if (!prod) return; // Should generally exist

    // Remove existing item for this product (to handle update/delete/insert cleanly)
    state.cartItems = state.cartItems.filter(i => i.id !== productId);

    // If INSERT or UPDATE, add new record
    if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRec && newRec.quantity > 0) {
        state.cartItems.push({
            id: prod.id,
            name: prod.name,
            unit: prod.unit,
            category: prod.category,
            qty: parseFloat(newRec.quantity)
        });
    }

    // UPDATE UI efficiently
    renderSummary();
}

// ... existing code ...

// 核心同步函数 (带防抖)
async function syncToSupabase(productId, quantity) {
    if (syncTimeouts[productId]) clearTimeout(syncTimeouts[productId]);

    // Set Status: Syncing
    itemSyncStatus[productId] = 'syncing';
    updateItemStatusUI(productId);

    syncTimeouts[productId] = setTimeout(async () => {
        try {
            await supabaseClient.from('jlhcdh_cart').delete().eq('product_id', productId);
            if (quantity > 0) {
                await supabaseClient.from('jlhcdh_cart').insert({ product_id: productId, quantity });
            }
            // Set Status: Saved
            itemSyncStatus[productId] = 'saved';
            updateItemStatusUI(productId);

            // Clear status after delay
            setTimeout(() => {
                delete itemSyncStatus[productId];
                updateItemStatusUI(productId);
            }, 1000);

        } catch (e) {
            console.error('Sync error:', e);
            itemSyncStatus[productId] = 'error';
            updateItemStatusUI(productId);
            showToast('同步失败，请检查网络');
        }
    }, 50); // 50ms debounce
}

// 获取当前本地日期 (YYYY-MM-DD)
function getLocalTodayDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 获取某一天的所有数据
async function fetchDayData(showSkeleton = true) {
    if (showSkeleton) showLoading();

    const start = state.currentDate + 'T00:00:00';
    const end = state.currentDate + 'T23:59:59';

    // Check if viewing today
    const isToday = (state.currentDate === getLocalTodayDate());

    const promises = [
        supabaseClient
            .from('jlhcdh_orders')
            .select('*')
            .gte('created_at', start)
            .lte('created_at', end)
            .order('created_at', { ascending: false })
    ];

    if (isToday) {
        promises.push(supabaseClient.from('jlhcdh_cart').select('*'));
    }

    // Fetch both orders AND current active cart (if today)
    const results = await Promise.all(promises);
    const ordersResult = results[0];
    const cartResult = isToday ? results[1] : { data: [] };

    if (ordersResult.error) {
        showToast('订单加载失败: ' + ordersResult.error.message);
        return;
    }

    if (state.products.length === 0) {
        const { data: prods } = await supabaseClient.from('jlhcdh_products').select('id, name, unit, category');
        if (prods) state.products = prods;
    }

    processData(ordersResult.data || [], cartResult.data || []);
}

// 处理数据
function processData(orderRecords, cartRecords) {
    state.orders = [];
    state.cartItems = [];
    state.isLocked = false;
    state.lockRecord = null;
    let lastLockStatus = false;
    let statusFound = false;

    // 1. Process Historical Orders/Snapshots
    orderRecords.forEach(row => {
        const d = row.order_data;
        if (d && d.type === 'lock_status') {
            if (!statusFound) {
                lastLockStatus = d.locked;
                statusFound = true;
                state.lockRecord = row;
            }
        } else {
            state.orders.push(row);
        }
    });

    state.isLocked = lastLockStatus;

    // 2. Process Active Cart (Persistent State)
    if (cartRecords && cartRecords.length > 0) {
        cartRecords.forEach(c => {
            const p = state.products.find(x => x.id === c.product_id);
            if (p && c.quantity > 0) {
                state.cartItems.push({
                    id: p.id,
                    name: p.name,
                    unit: p.unit,
                    category: p.category,
                    qty: c.quantity
                });
            }
        });
    }

    renderStatus();
    renderSummary();
}

// 渲染状态条和按钮
function renderStatus() {
    if (state.isLocked) {
        els.statusContainer.innerHTML = `
            <div class="lock-status-bar locked">
                <i class="fas fa-check-circle"></i> 该日订货已确认锁定
            </div>
        `;
        // Only allow unlock if today
        if (state.currentDate === getLocalTodayDate()) {
            els.lockBtn.innerHTML = '<i class="fas fa-lock-open"></i> 解锁 (如需补单)';
            els.lockBtn.disabled = false;
            els.lockBtn.style.display = 'flex';
        } else {
            els.lockBtn.style.display = 'none'; // Cannot unlock past days
        }
        els.lockBtn.classList.remove('btn-lock');
        els.lockBtn.classList.add('btn-secondary');
        els.lockBtn.style.background = '#8e8e93';
    } else {
        const isToday = (state.currentDate === getLocalTodayDate());
        if (isToday) {
            els.statusContainer.innerHTML = `
                <div class="lock-status-bar">
                    <i class="fas fa-info-circle"></i> 正在核对中，确认无误后请锁定
                </div>
            `;
            els.lockBtn.innerHTML = '<i class="fas fa-lock"></i> 确认无误并锁定';
            els.lockBtn.disabled = false;
            els.lockBtn.style.display = 'flex';
        } else {
            els.statusContainer.innerHTML = `
                <div class="lock-status-bar" style="background:#f2f2f7;color:#666">
                    <i class="fas fa-history"></i> 查看历史记录 (只读)
                </div>
            `;
            els.lockBtn.style.display = 'none';
        }

        els.lockBtn.classList.add('btn-lock');
        els.lockBtn.classList.remove('btn-secondary');
        els.lockBtn.style.background = '#34c759';
    }
}

// 渲染汇总
function renderSummary() {
    const isToday = (state.currentDate === getLocalTodayDate());
    let itemsToAggregate = [];
    let sourceLabel = '';

    if (isToday) {
        itemsToAggregate = state.cartItems || []; // Use active cart for today
        sourceLabel = '(当前实时)';
    } else {
        // Historical: Use the latest valid snapshot
        const latestSnapshot = state.orders.find(r => {
            const d = r.order_data;
            // Check if it looks like item list or object with order_data
            return Array.isArray(d) || (d && d.order_data && Array.isArray(d.order_data));
        });

        if (latestSnapshot) {
            itemsToAggregate = Array.isArray(latestSnapshot.order_data) ?
                latestSnapshot.order_data : latestSnapshot.order_data.order_data;
            sourceLabel = '(历史快照)';
        }
    }

    // 如果没有任何数据
    if (!itemsToAggregate || itemsToAggregate.length === 0) {
        els.orderCount.innerText = "0 项";
        els.summaryList.innerHTML = '<div class="empty-state">该日无有效订货记录</div>';
        return;
    }

    els.orderCount.innerText = `${itemsToAggregate.length} 项商品 ${sourceLabel}`;

    // Aggregation
    const agg = {};

    itemsToAggregate.forEach(item => {
        if (!agg[item.id]) {
            agg[item.id] = { ...item, qty: 0 };
        }
        agg[item.id].qty += parseFloat(item.qty || 0);
    });

    // Group by Category
    const byCat = {};
    Object.values(agg).forEach(item => {
        const cat = item.category || '未分类';
        if (!byCat[cat]) byCat[cat] = [];
        byCat[cat].push(item);
    });

    let html = '';
    const sortedCats = Object.keys(byCat).sort();

    // Check if editable: Today AND Not Locked
    const canEdit = isToday && !state.isLocked;

    sortedCats.forEach(cat => {
        html += `<div class="category-group">
            <span class="category-title">${cat}</span>
            <ul class="agg-list">`;

        byCat[cat].forEach(item => {
            const qty = parseFloat(item.qty.toFixed(2));

            let qtyControl = '';
            if (canEdit) {
                // Interactive Control
                const status = itemSyncStatus[item.id] ? `status-${itemSyncStatus[item.id]}` : '';
                qtyControl = `
                    <div id="wrapper-${item.id}" class="${status}" style="display:flex;align-items:center;background:#f2f2f7;border-radius:8px;transition:all 0.3s;">
                        <button style="width:32px;height:32px;color:#007aff;font-weight:bold;font-size:16px;cursor:pointer;" 
                            onclick="updateQuantity(${item.id}, -1, true)">−</button>
                        <input type="number" 
                            style="width:40px;text-align:center;border:none;background:transparent;font-weight:600;font-size:16px;outline:none;" 
                            value="${qty}" 
                            onchange="updateQuantity(${item.id}, this.value, false)">
                        <button style="width:32px;height:32px;color:#007aff;font-weight:bold;font-size:16px;cursor:pointer;" 
                            onclick="updateQuantity(${item.id}, 1, true)">+</button>
                    </div>
                `;
            } else {
                // Read-only Text
                qtyControl = `<span class="item-qty">${qty}</span>`;
            }

            html += `
                <li class="agg-item">
                    <span class="item-name">${item.name}</span>
                    <div style="display:flex;align-items:center;">
                        ${qtyControl}
                        <span class="item-unit">${item.unit}</span>
                    </div>
                </li>
            `;
        });

        html += `</ul></div>`;
    });

    els.summaryList.innerHTML = html;
    // After rendering, update status for all items
    Object.keys(itemSyncStatus).forEach(productId => updateItemStatusUI(productId));
}

// Status Tracker
const itemSyncStatus = {}; // { [id]: 'syncing' | 'saved' | 'error' }

// Update Quantity Logic (Copied from app.js)
const syncTimeouts = {};

async function updateQuantity(productId, value, isDelta) {
    // Find current item in state
    // Note: state.cartItems might display duplicates in theory, but agg logic sums them up.
    // For editing, we assume we update the "aggregate" and sync back.
    // However, syncToSupabase wipes previous records and inserts ONE new record.
    // So we just need to calculate the NEW TOTAL for this product.

    // Calculate current total from aggregation to be safe
    let currentQty = 0;
    state.cartItems.forEach(i => {
        if (i.id === productId) currentQty += parseFloat(i.qty || 0);
    });

    let newQty = 0;
    if (isDelta) {
        newQty = currentQty + parseFloat(value);
    } else {
        newQty = parseFloat(value);
    }

    if (newQty < 0) newQty = 0;

    // Update Local State immediately for UI responsiveness
    // Force reset all entries for this ID in local state to single entry
    // This simplifies the local view
    // Remove all old entries for this ID
    state.cartItems = state.cartItems.filter(i => i.id !== productId);

    if (newQty > 0) {
        // Find product info (we have it in state.products usually, or just use what we had)
        // We can just find the item name/unit from DOM or state.products cache
        const prod = state.products.find(p => p.id == productId);
        // Note: products need to be fetched if not available. `fetchDayData` fetches products if empty.

        if (prod) {
            state.cartItems.push({
                id: prod.id,
                name: prod.name,
                unit: prod.unit,
                category: prod.category,
                qty: newQty
            });
        }
    }

    // Re-render immediately to show input update
    renderSummary();

    // Sync to Cloud
    syncToSupabase(productId, newQty);
}

// 核心同步函数 (带防抖)
async function syncToSupabase(productId, quantity) {
    if (syncTimeouts[productId]) clearTimeout(syncTimeouts[productId]);

    // Set Status: Syncing
    itemSyncStatus[productId] = 'syncing';
    updateItemStatusUI(productId);

    syncTimeouts[productId] = setTimeout(async () => {
        try {
            await supabaseClient.from('jlhcdh_cart').delete().eq('product_id', productId);
            if (quantity > 0) {
                await supabaseClient.from('jlhcdh_cart').insert({ product_id: productId, quantity });
            }
            // Set Status: Saved
            itemSyncStatus[productId] = 'saved';
            updateItemStatusUI(productId);

            // Clear status after delay
            setTimeout(() => {
                delete itemSyncStatus[productId];
                updateItemStatusUI(productId);
            }, 1000);

        } catch (e) {
            console.error('Sync error:', e);
            itemSyncStatus[productId] = 'error';
            updateItemStatusUI(productId);
            showToast('同步失败，请检查网络');
        }
    }, 500);
}

function updateItemStatusUI(productId) {
    const wrapper = document.getElementById(`wrapper-${productId}`);
    if (wrapper) {
        const status = itemSyncStatus[productId];
        wrapper.classList.remove('status-syncing', 'status-saved', 'status-error');
        if (status) wrapper.classList.add(`status-${status}`);
    }
}


// 锁定/解锁
async function toggleLock() {
    if (state.isLocked) {
        if (!confirm('确定要解锁吗？解锁后可以继续提交新订单。')) return;

        const unlockData = {
            order_data: { type: 'lock_status', locked: false },
            created_at: new Date().toISOString()
        };

        const { error } = await supabaseClient.from('jlhcdh_orders').insert([unlockData]);
        if (error) {
            showToast('解锁失败: ' + error.message);
        } else {
            showToast('已解锁');
            fetchDayData(false); // Silent refresh
        }

    } else {
        if (!state.cartItems || state.cartItems.length === 0) {
            showToast('今日无订单，无需锁定');
            return;
        }
        if (!confirm('确认今日订货单已全部核对无误？')) return;

        const lockData = {
            order_data: { type: 'lock_status', locked: true },
            created_at: new Date().toISOString()
        };

        const { error } = await supabaseClient.from('jlhcdh_orders').insert([lockData]);
        if (error) {
            showToast('锁定失败: ' + error.message);
        } else {
            showToast('订货单已锁定');
            fetchDayData(false); // Silent refresh
        }
    }
}

function showLoading() {
    els.summaryList.innerHTML = `
        <div class="skeleton-loader">
            <div class="skeleton-item"></div>
            <div class="skeleton-item"></div>
        </div>
    `;
}

function showToast(msg) {
    els.toast.innerText = msg;
    els.toast.classList.add('show');
    setTimeout(() => els.toast.classList.remove('show'), 2000);
}

init();
