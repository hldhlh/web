
// 初始化 Supabase
const SUPABASE_URL = 'https://fmxddvjgkykuqwmasigo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZteGRkdmpna3lrdXF3bWFzaWdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwNDMzMjcsImV4cCI6MjA1OTYxOTMyN30.XCU4-03oajGh6M2-PNiBotCZSIDn_nJXkIC0Thjjfqo';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
});

const state = {
    products: [],
    loading: false,
    filterCategory: '全部',
    searchQuery: ''
};

const els = {
    tableBody: document.getElementById('productTableBody'),
    searchInput: document.getElementById('searchInput'),
    clearSearch: document.getElementById('clearSearch'),
    categoryFilter: document.getElementById('categoryFilter'),
    categoryOptions: document.getElementById('categoryOptions'),
    modal: document.getElementById('editModal'),
    modalTitle: document.getElementById('modalTitle'),
    form: document.getElementById('productForm'),
    toast: document.getElementById('toast'),
    addBtn: document.getElementById('addBtn'),
    cancelEdit: document.getElementById('cancelEdit'),
    refreshBtn: document.getElementById('refreshBtn'),
    saveStatus: document.getElementById('saveStatus')
};

async function init() {
    await fetchProducts();
    setupEventListeners();
}

async function fetchProducts() {
    state.loading = true;
    renderTable(); // Show loading or skeleton if implemented

    const { data, error } = await supabaseClient
        .from('jlhcdh_products')
        .select('*')
        .order('category')
        .order('id');

    if (error) {
        showToast('加载失败: ' + error.message);
    } else {
        state.products = data || [];
        updateCategoryOptions();
        renderTable();
    }
    state.loading = false;
}

function updateCategoryOptions() {
    const cats = [...new Set(state.products.map(p => p.category))];

    // Update Filter
    els.categoryFilter.innerHTML = '<option value="全部">全部品类</option>' +
        cats.map(c => `<option value="${c}">${c}</option>`).join('');
    els.categoryFilter.value = state.filterCategory;

    // Update Datalist
    els.categoryOptions.innerHTML = cats.map(c => `<option value="${c}">`).join('');
}

function renderTable() {
    let filtered = state.products;

    if (state.filterCategory !== '全部') {
        filtered = filtered.filter(p => p.category === state.filterCategory);
    }

    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        filtered = filtered.filter(p => p.name.toLowerCase().includes(q));
    }

    els.tableBody.innerHTML = filtered.map(p => `
        <tr data-id="${p.id}">
            <td style="color:#888;font-size:12px;">${p.id}</td>
            <td>
                <input type="text" class="edit-input" value="${p.category}" 
                    onchange="updateField(${p.id}, 'category', this.value)"
                    list="categoryOptions">
            </td>
            <td>
                <input type="text" class="edit-input" value="${p.name}" 
                    onchange="updateField(${p.id}, 'name', this.value)"
                    style="font-weight:500;">
            </td>
            <td>
                <input type="text" class="edit-input" value="${p.unit || '份'}" 
                    onchange="updateField(${p.id}, 'unit', this.value)"
                    list="unitOptions" style="width:60px;">
            </td>
            <td>
                 <!-- 仅展示，未实现排序逻辑 -->
                 <span style="color:#ccc;">-</span>
            </td>
            <td>
                <button class="action-btn btn-danger" onclick="deleteProduct(${p.id})">删除</button>
            </td>
        </tr>
    `).join('');
}

// 实时更新字段 (自动保存)
window.updateField = async (id, field, value) => {
    showStatus('正在保存...');

    // Optimistic update
    const product = state.products.find(p => p.id === id);
    if (product) product[field] = value;

    const { error } = await supabaseClient
        .from('jlhcdh_products')
        .update({ [field]: value })
        .eq('id', id);

    if (error) {
        showToast('保存失败: ' + error.message);
        showStatus('保存失败', true);
        // Revert? (Complex without deep clone, just warn for now)
    } else {
        showStatus('已保存');
        setTimeout(() => showStatus(''), 2000);
        // 如果改的是分类，需要更新下拉框
        if (field === 'category') updateCategoryOptions();
    }
};

window.deleteProduct = async (id) => {
    if (!confirm('确定要删除这个商品吗？')) return;

    const { error } = await supabaseClient
        .from('jlhcdh_products')
        .delete()
        .eq('id', id);

    if (error) {
        showToast('删除失败: ' + error.message);
    } else {
        state.products = state.products.filter(p => p.id !== id);
        renderTable();
        showToast('已删除');
    }
};

function setupEventListeners() {
    els.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim();
        els.clearSearch.classList.toggle('hidden', !state.searchQuery);
        renderTable();
    });

    els.clearSearch.addEventListener('click', () => {
        state.searchQuery = '';
        els.searchInput.value = '';
        renderTable();
    });

    els.categoryFilter.addEventListener('change', (e) => {
        state.filterCategory = e.target.value;
        renderTable();
    });

    els.refreshBtn.addEventListener('click', () => {
        fetchProducts();
        showToast('已刷新');
    });

    // Add Logic
    els.addBtn.addEventListener('click', () => {
        openModal();
    });

    els.cancelEdit.addEventListener('click', () => {
        closeModal();
    });

    els.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editId').value;
        const name = document.getElementById('editName').value;
        const category = document.getElementById('editCategory').value;
        const unit = document.getElementById('editUnit').value;

        els.form.querySelector('button[type="submit"]').textContent = '提交中...';

        if (id) {
            // Edit mode (Not used currently as we use inline edit, but simpler to keep for future)
        } else {
            // Add mode
            const { data, error } = await supabaseClient
                .from('jlhcdh_products')
                .insert([{ name, category, unit, is_favorite: false }])
                .select();

            if (error) {
                showToast('添加失败: ' + error.message);
            } else {
                if (data) state.products.push(data[0]);
                renderTable();
                showToast('添加成功');
                closeModal();
            }
        }

        els.form.querySelector('button[type="submit"]').textContent = '保存';
    });
}

function openModal(product = null) {
    els.modal.classList.add('visible'); // reuse CSS from main style
    els.modal.classList.remove('hidden');

    if (product) {
        // Edit
    } else {
        els.modalTitle.textContent = '添加新商品';
        document.getElementById('editId').value = '';
        document.getElementById('editName').value = '';
        // 默认保留上一次的分类，方便连续添加
        // document.getElementById('editCategory').value = ''; 
        document.getElementById('editUnit').value = '斤';
    }
}

function closeModal() {
    els.modal.classList.remove('visible');
    els.modal.classList.add('hidden');
}

function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    setTimeout(() => els.toast.classList.remove('show'), 2000);
}

function showStatus(msg, isError = false) {
    els.saveStatus.textContent = msg;
    els.saveStatus.style.color = isError ? '#ff3b30' : '#888';
}

init();
