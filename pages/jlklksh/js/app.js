/**
 * 火锅店采购成本分析驾驶舱
 * 版本: 2.0 - 增强健壮性
 */
document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    // ========== 配置常量 ==========
    const COL_MAP = {
        branch: 0,       // 门店
        orderId: 1,      // 订单号
        date: 2,         // 日期
        source: 4,       // 来源渠道
        majorCategory: 5, // 大分类
        item: 7,         // 商品名称
        qty: 10,         // 数量
        cost: 14         // 应付金额
    };

    // 必需的列（用于验证）
    const REQUIRED_COLS = ['date', 'item', 'cost'];
    const COL_NAMES = {
        branch: '门店',
        orderId: '订单号',
        date: '日期',
        source: '来源渠道',
        majorCategory: '大分类',
        item: '商品名称',
        qty: '数量',
        cost: '应付金额'
    };

    // ========== 状态管理 ==========
    const state = {
        globalData: [],      // 原始数据
        filteredData: [],    // 过滤后的数据
        isLoading: false,
        hasError: false,
        errorMessage: '',
        // 时间过滤状态
        timeFilter: {
            type: 'all',     // 'today' | 'week' | 'month' | 'all' | 'custom'
            startDate: null,
            endDate: null
        }
    };

    // ========== DOM 元素 ==========
    const fileInput = document.getElementById('fileInput');

    // ========== 图表实例 ==========
    let charts = {
        trend: null,
        dailyUsage: null,
        category: null,
        product: null,
        weekly: null,
        source: null,
        priceTrend: null,
        priceVolatility: null,
        treemap: null
    };

    // ========== 工具函数 ==========

    /**
     * 安全地解析数值
     * @param {any} value - 输入值
     * @param {number} defaultValue - 默认值
     * @returns {number}
     */
    function safeParseNumber(value, defaultValue = 0) {
        if (value === null || value === undefined || value === '') {
            return defaultValue;
        }
        const num = parseFloat(value);
        return isNaN(num) ? defaultValue : num;
    }

    /**
     * 安全地解析字符串
     * @param {any} value - 输入值
     * @param {string} defaultValue - 默认值
     * @returns {string}
     */
    function safeParseString(value, defaultValue = '') {
        if (value === null || value === undefined) {
            return defaultValue;
        }
        return String(value).trim() || defaultValue;
    }

    /**
     * 解析 Excel 日期（支持多种格式）
     * @param {any} dateValue - 日期值
     * @returns {Date|null}
     */
    function parseExcelDate(dateValue) {
        if (!dateValue) return null;

        let dateObj;

        // Excel 序列号格式
        if (typeof dateValue === 'number') {
            // Excel 日期序列号（从 1900-01-01 开始）
            dateObj = new Date((dateValue - 25569) * 86400 * 1000);
        }
        // 字符串格式
        else if (typeof dateValue === 'string') {
            // 尝试多种日期格式
            const dateStr = dateValue.trim();

            // 常见格式: yyyy-MM-dd, yyyy/MM/dd, MM/dd/yyyy 等
            const patterns = [
                /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/,  // yyyy-MM-dd or yyyy/MM/dd
                /^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/,  // MM/dd/yyyy or dd/MM/yyyy
            ];

            for (const pattern of patterns) {
                const match = dateStr.match(pattern);
                if (match) {
                    if (match[1].length === 4) {
                        // yyyy-MM-dd
                        dateObj = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
                    } else {
                        // MM/dd/yyyy (假设月在前)
                        dateObj = new Date(parseInt(match[3]), parseInt(match[1]) - 1, parseInt(match[2]));
                    }
                    break;
                }
            }

            // 如果上面的模式都不匹配，尝试直接解析
            if (!dateObj) {
                dateObj = new Date(dateStr);
            }
        }
        // Date 对象
        else if (dateValue instanceof Date) {
            dateObj = dateValue;
        }

        // 验证日期有效性
        if (!dateObj || isNaN(dateObj.getTime())) {
            return null;
        }

        // 合理性检查（日期应在 2000-2100 年间）
        const year = dateObj.getFullYear();
        if (year < 2000 || year > 2100) {
            return null;
        }

        return dateObj;
    }

    /**
     * 格式化日期为标准字符串
     * @param {Date} date - 日期对象
     * @param {string} granularity - 粒度 ('day' | 'month')
     * @returns {string}
     */
    function formatDate(date, granularity = 'day') {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');

        return granularity === 'month' ? `${y}-${m}` : `${y}-${m}-${d}`;
    }

    /**
     * 显示提示消息
     * @param {string} message - 消息内容
     * @param {string} type - 类型 ('success' | 'error' | 'warning' | 'info')
     */
    function showToast(message, type = 'info') {
        // 移除已存在的 toast
        const existingToast = document.querySelector('.toast-message');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = `toast-message toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${getToastIcon(type)}</span>
            <span class="toast-text">${message}</span>
        `;

        document.body.appendChild(toast);

        // 动画显示
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // 自动隐藏
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, type === 'error' ? 5000 : 3000);
    }

    function getToastIcon(type) {
        const icons = {
            success: '✓',
            error: '✗',
            warning: '⚠',
            info: 'ℹ'
        };
        return icons[type] || icons.info;
    }

    /**
     * 显示/隐藏加载状态
     * @param {boolean} show - 是否显示
     */
    function setLoading(show) {
        state.isLoading = show;
        let loader = document.querySelector('.loading-overlay');

        if (show) {
            if (!loader) {
                loader = document.createElement('div');
                loader.className = 'loading-overlay';
                loader.innerHTML = `
                    <div class="loading-spinner"></div>
                    <div class="loading-text">正在分析数据...</div>
                `;
                document.body.appendChild(loader);
            }
            requestAnimationFrame(() => loader.classList.add('show'));
        } else if (loader) {
            loader.classList.remove('show');
            setTimeout(() => loader.remove(), 300);
        }
    }

    /**
     * 在图表容器中显示空数据提示
     * @param {echarts.ECharts} chart - 图表实例
     * @param {string} message - 提示消息
     */
    function showChartEmpty(chart, message = '暂无数据') {
        if (!chart) return;

        chart.clear();
        chart.setOption({
            title: {
                text: message,
                left: 'center',
                top: 'center',
                textStyle: {
                    color: '#999',
                    fontSize: 14,
                    fontWeight: 'normal'
                }
            }
        });
    }

    // ========== 数据验证 ==========

    /**
     * 验证 Excel 文件结构
     * @param {Array} rows - 数据行
     * @returns {{valid: boolean, errors: string[]}}
     */
    function validateExcelStructure(rows) {
        const errors = [];

        // 检查是否有数据
        if (!rows || rows.length === 0) {
            errors.push('文件为空，请检查Excel文件');
            return { valid: false, errors };
        }

        // 检查是否有表头
        if (rows.length < 2) {
            errors.push('文件只有表头，没有数据行');
            return { valid: false, errors };
        }

        // 检查必需列的索引是否在范围内
        const headerRow = rows[0];
        const maxColIndex = Math.max(...Object.values(COL_MAP));

        if (headerRow.length <= maxColIndex) {
            errors.push(`文件列数不足，期望至少 ${maxColIndex + 1} 列，实际 ${headerRow.length} 列`);
        }

        // 检查必需列是否有有效数据
        const sampleRows = rows.slice(1, Math.min(6, rows.length));
        for (const colKey of REQUIRED_COLS) {
            const colIndex = COL_MAP[colKey];
            const hasValidData = sampleRows.some(row => row[colIndex] !== null && row[colIndex] !== undefined && row[colIndex] !== '');

            if (!hasValidData) {
                errors.push(`必需列 "${COL_NAMES[colKey]}" (列 ${colIndex + 1}) 数据无效`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * 解析并清洗数据
     * @param {Array} rows - 原始数据行
     * @returns {{data: Array, warnings: string[], stats: Object}}
     */
    function parseAndCleanData(rows) {
        const data = [];
        const warnings = [];
        let skippedCount = 0;
        let invalidDateCount = 0;
        let invalidCostCount = 0;

        // 跳过表头
        const dataRows = rows.slice(1);

        dataRows.forEach((row, index) => {
            // 跳过空行
            if (!row || row.length === 0 || row.every(cell => cell === null || cell === undefined || cell === '')) {
                skippedCount++;
                return;
            }

            // 解析日期
            const dateValue = row[COL_MAP.date];
            const parsedDate = parseExcelDate(dateValue);

            if (!parsedDate) {
                invalidDateCount++;
                return;
            }

            // 解析金额
            const cost = safeParseNumber(row[COL_MAP.cost], 0);
            if (cost === 0 && row[COL_MAP.cost] !== 0 && row[COL_MAP.cost] !== '0') {
                // 金额字段不为0但解析为0，可能是格式问题
                invalidCostCount++;
            }

            data.push({
                branch: safeParseString(row[COL_MAP.branch], '未知门店'),
                orderId: row[COL_MAP.orderId],
                date: parsedDate,
                dateRaw: dateValue,
                source: safeParseString(row[COL_MAP.source], '其他'),
                category: safeParseString(row[COL_MAP.majorCategory], '未分类'),
                item: safeParseString(row[COL_MAP.item], '未知商品'),
                qty: safeParseNumber(row[COL_MAP.qty], 0),
                cost: cost
            });
        });

        // 生成警告信息
        if (skippedCount > 0) {
            warnings.push(`跳过 ${skippedCount} 行空数据`);
        }
        if (invalidDateCount > 0) {
            warnings.push(`${invalidDateCount} 行日期格式无效已忽略`);
        }
        if (invalidCostCount > 0) {
            warnings.push(`${invalidCostCount} 行金额数据可能有误`);
        }

        return {
            data,
            warnings,
            stats: {
                totalRows: dataRows.length,
                validRows: data.length,
                skippedRows: skippedCount,
                invalidDateRows: invalidDateCount
            }
        };
    }

    // ========== 核心逻辑 ==========

    /**
     * 检查依赖库是否加载
     * @returns {boolean}
     */
    function checkDependencies() {
        const missing = [];

        if (typeof XLSX === 'undefined') {
            missing.push('XLSX (Excel解析库)');
        }
        if (typeof echarts === 'undefined') {
            missing.push('ECharts (图表库)');
        }

        if (missing.length > 0) {
            showToast(`依赖库加载失败: ${missing.join(', ')}，请刷新页面重试`, 'error');
            return false;
        }
        return true;
    }

    /**
     * 处理文件上传
     * @param {Event} e - 事件对象
     */
    function handleFile(e) {
        const file = e.target.files[0];
        if (!file) return;

        // 检查依赖
        if (!checkDependencies()) return;

        // 验证文件类型
        const validTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ];
        const validExtensions = ['.xlsx', '.xls'];

        const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
        if (!validExtensions.includes(fileExtension)) {
            showToast('请选择有效的 Excel 文件 (.xlsx 或 .xls)', 'error');
            fileInput.value = '';
            return;
        }

        // 验证文件大小（最大 50MB）
        const maxSize = 50 * 1024 * 1024;
        if (file.size > maxSize) {
            showToast('文件过大，请选择小于 50MB 的文件', 'error');
            fileInput.value = '';
            return;
        }

        setLoading(true);

        const reader = new FileReader();

        reader.onerror = () => {
            setLoading(false);
            showToast('文件读取失败，请检查文件是否损坏', 'error');
            fileInput.value = '';
        };

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {
                    type: 'array',
                    cellDates: true,  // 自动解析日期
                    cellNF: false,
                    cellText: false
                });

                // 检查是否有工作表
                if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
                    throw new Error('Excel 文件中没有工作表');
                }

                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: null });

                // 验证结构
                const validation = validateExcelStructure(rows);
                if (!validation.valid) {
                    throw new Error(validation.errors.join('\n'));
                }

                // 解析数据
                const result = parseAndCleanData(rows);

                if (result.data.length === 0) {
                    throw new Error('没有解析到有效数据，请检查日期和金额列格式');
                }

                // 保存数据
                state.globalData = result.data;
                state.hasError = false;
                state.errorMessage = '';

                // 启用时间过滤器并初始化日期范围
                enableTimeFilter();
                initDateInputRange();

                // 应用时间过滤并渲染
                applyTimeFilter();
                renderDashboard();

                // 显示成功消息
                let successMsg = `成功导入 ${result.data.length} 条记录`;
                if (result.warnings.length > 0) {
                    successMsg += ` (${result.warnings.join(', ')})`;
                }
                showToast(successMsg, 'success');

            } catch (error) {
                console.error('数据处理错误:', error);
                state.hasError = true;
                state.errorMessage = error.message;
                showToast(`数据处理失败: ${error.message}`, 'error');
                clearAllCharts();
            } finally {
                setLoading(false);
                fileInput.value = ''; // 清除输入，允许重新选择同一文件
            }
        };

        reader.readAsArrayBuffer(file);
    }

    /**
     * 清空所有图表
     */
    function clearAllCharts() {
        Object.values(charts).forEach(chart => {
            if (chart) {
                showChartEmpty(chart, '请导入Excel数据');
            }
        });

        // 重置 KPI
        document.getElementById('kpiCost').innerText = '¥ 0.00';
        document.getElementById('kpiOrders').innerText = '0';
        document.getElementById('kpiItems').innerText = '0';
        document.getElementById('kpiCategories').innerText = '0';
    }

    /**
     * 渲染仪表盘
     */
    function renderDashboard() {
        // 使用过滤后的数据
        if (state.filteredData.length === 0) {
            if (state.globalData.length === 0) {
                clearAllCharts();
            } else {
                // 有原始数据但过滤后为空
                clearAllCharts();
                showToast('当前时间范围内没有数据', 'warning');
            }
            return;
        }

        try {
            updateKPIs();
            updateTrendChart();
            updateDailyUsageChart();
            updateCategoryChart();
            updateProductChart();
            updateWeeklyChart();
            updateSourceChart();
            updatePriceTrendChart();
            updatePriceVolatilityChart();
            updateTreemapChart();
        } catch (error) {
            console.error('仪表盘渲染错误:', error);
            showToast('图表渲染时出现错误，部分图表可能无法显示', 'warning');
        }
    }

    // ========== 时间过滤功能 ==========

    /**
     * 获取当前使用的数据（过滤后）
     */
    function getActiveData() {
        return state.filteredData;
    }

    /**
     * 启用时间过滤器
     */
    function enableTimeFilter() {
        const timeFilter = document.getElementById('timeFilter');
        if (timeFilter) {
            timeFilter.classList.remove('disabled');
        }
    }

    /**
     * 禁用时间过滤器
     */
    function disableTimeFilter() {
        const timeFilter = document.getElementById('timeFilter');
        if (timeFilter) {
            timeFilter.classList.add('disabled');
        }
    }

    /**
     * 初始化日期输入框的范围
     */
    function initDateInputRange() {
        if (state.globalData.length === 0) return;

        // 获取数据的日期范围
        const dates = state.globalData.map(d => d.date.getTime());
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));

        const startInput = document.getElementById('dateStart');
        const endInput = document.getElementById('dateEnd');

        if (startInput && endInput) {
            // 设置输入框的 min/max 属性
            startInput.min = formatDateISO(minDate);
            startInput.max = formatDateISO(maxDate);
            endInput.min = formatDateISO(minDate);
            endInput.max = formatDateISO(maxDate);

            // 默认值设为数据范围
            startInput.value = formatDateISO(minDate);
            endInput.value = formatDateISO(maxDate);
        }
    }

    /**
     * 格式化日期为 YYYY-MM-DD (ISO 格式，用于 input[type=date])
     */
    function formatDateISO(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /**
     * 计算时间范围
     * @param {string} rangeType - 范围类型
     * @returns {{start: Date, end: Date}}
     */
    function calculateTimeRange(rangeType) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        let start, end;

        switch (rangeType) {
            case 'today':
                start = today;
                end = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1); // 今天 23:59:59
                break;

            case 'week':
                // 本周（周一到今天）
                const dayOfWeek = today.getDay();
                const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                start = new Date(today.getTime() - daysFromMonday * 24 * 60 * 60 * 1000);
                end = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);
                break;

            case 'month':
                // 本月（1号到今天）
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);
                break;

            case 'all':
            default:
                start = null;
                end = null;
                break;
        }

        return { start, end };
    }

    /**
     * 应用时间过滤
     */
    function applyTimeFilter() {
        const { type, startDate, endDate } = state.timeFilter;

        if (type === 'all' || (!startDate && !endDate)) {
            // 不过滤，使用全部数据
            state.filteredData = [...state.globalData];
            updateTimeDisplay('全部数据');
        } else {
            // 过滤数据
            state.filteredData = state.globalData.filter(d => {
                const itemDate = d.date.getTime();

                if (startDate && endDate) {
                    return itemDate >= startDate.getTime() && itemDate <= endDate.getTime();
                } else if (startDate) {
                    return itemDate >= startDate.getTime();
                } else if (endDate) {
                    return itemDate <= endDate.getTime();
                }
                return true;
            });

            // 更新显示
            updateTimeDisplay(getTimeDisplayText());
        }
    }

    /**
     * 获取时间显示文本
     */
    function getTimeDisplayText() {
        const { type, startDate, endDate } = state.timeFilter;

        switch (type) {
            case 'today':
                return '今日';
            case 'week':
                return '本周';
            case 'month':
                return '本月';
            case 'custom':
                if (startDate && endDate) {
                    const startStr = formatDate(startDate, 'day').substring(5); // MM-DD
                    const endStr = formatDate(endDate, 'day').substring(5);
                    return `${startStr} ~ ${endStr}`;
                }
                return '自定义';
            default:
                return '全部数据';
        }
    }

    /**
     * 更新时间显示
     */
    function updateTimeDisplay(text) {
        const displaySpan = document.querySelector('#timeDisplay span');
        if (displaySpan) {
            displaySpan.textContent = text;
        }
    }

    /**
     * 处理快捷时间按钮点击
     */
    function handleTimeShortcut(rangeType) {
        // 更新按钮状态
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.range === rangeType);
        });

        // 计算时间范围
        const range = calculateTimeRange(rangeType);

        // 更新状态
        state.timeFilter.type = rangeType;
        state.timeFilter.startDate = range.start;
        state.timeFilter.endDate = range.end;

        // 更新日期输入框显示
        const startInput = document.getElementById('dateStart');
        const endInput = document.getElementById('dateEnd');

        if (startInput && endInput) {
            if (rangeType === 'all') {
                // "全部"时重置为数据的完整日期范围
                if (state.globalData.length > 0) {
                    const dates = state.globalData.map(d => d.date.getTime());
                    const minDate = new Date(Math.min(...dates));
                    const maxDate = new Date(Math.max(...dates));
                    startInput.value = formatDateISO(minDate);
                    endInput.value = formatDateISO(maxDate);
                }
            } else if (range.start && range.end) {
                // 其他快捷选项
                startInput.value = formatDateISO(range.start);
                endInput.value = formatDateISO(range.end);
            }
        }

        // 应用过滤并重新渲染
        applyTimeFilter();
        renderDashboard();
    }

    /**
     * 处理自定义日期范围
     */
    function handleCustomDateRange() {
        const startInput = document.getElementById('dateStart');
        const endInput = document.getElementById('dateEnd');

        if (!startInput.value || !endInput.value) {
            showToast('请选择完整的日期范围', 'warning');
            return;
        }

        const startDate = new Date(startInput.value);
        const endDate = new Date(endInput.value);
        // 设置结束日期为当天的 23:59:59
        endDate.setHours(23, 59, 59, 999);

        if (startDate > endDate) {
            showToast('开始日期不能晚于结束日期', 'warning');
            return;
        }

        // 清除快捷按钮状态
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // 更新状态
        state.timeFilter.type = 'custom';
        state.timeFilter.startDate = startDate;
        state.timeFilter.endDate = endDate;

        // 应用过滤并重新渲染
        applyTimeFilter();
        renderDashboard();

        showToast(`已筛选 ${state.filteredData.length} 条记录`, 'info');
    }

    // ========== KPI 更新 ==========

    function updateKPIs() {
        const data = getActiveData();
        try {
            // 总成本
            const totalCost = data.reduce((acc, curr) => acc + curr.cost, 0);
            document.getElementById('kpiCost').innerText = `¥ ${totalCost.toLocaleString('zh-CN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            })}`;

            // 唯一订单数
            const uniqueOrders = new Set(data.map(d => d.orderId)).size;
            document.getElementById('kpiOrders').innerText = uniqueOrders.toLocaleString();

            // 总数量
            const totalItems = data.reduce((acc, curr) => acc + curr.qty, 0);
            document.getElementById('kpiItems').innerText = Math.round(totalItems).toLocaleString();

            // 品类统计
            const uniqueCats = new Set(data.map(d => d.category)).size;
            const uniqueItems = new Set(data.map(d => d.item)).size;
            document.getElementById('kpiCategories').innerText = `${uniqueCats} 类 / ${uniqueItems} 种`;
        } catch (error) {
            console.error('KPI 更新错误:', error);
        }
    }

    // ========== 图表更新函数 ==========

    function updateTrendChart() {
        if (!charts.trend) return;

        try {
            const granularity = document.getElementById('trendGranularity').value;
            const agg = {};
            const data = getActiveData();

            data.forEach(d => {
                if (!d.date) return;
                const dateKey = formatDate(d.date, granularity);
                agg[dateKey] = (agg[dateKey] || 0) + d.cost;
            });

            const sortedKeys = Object.keys(agg).sort();

            if (sortedKeys.length === 0) {
                showChartEmpty(charts.trend, '没有有效的日期数据');
                return;
            }

            const values = sortedKeys.map(k => parseFloat(agg[k].toFixed(2)));

            const option = {
                tooltip: {
                    trigger: 'axis',
                    formatter: function (params) {
                        const dateStr = params[0].name;
                        const value = params[0].value;

                        // 解析日期获取周几
                        let weekday = '';
                        if (granularity === 'day' && dateStr.length === 10) {
                            const date = new Date(dateStr);
                            if (!isNaN(date.getTime())) {
                                const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
                                weekday = weekdays[date.getDay()];
                            }
                        }

                        // 简化日期显示 (去掉年份)
                        let displayDate = dateStr;
                        if (dateStr.length === 10) {
                            displayDate = dateStr.substring(5); // MM-DD
                        } else if (dateStr.length === 7) {
                            displayDate = dateStr.substring(5) + '月'; // M月
                        }

                        const weekdayStr = weekday ? ` ${weekday}` : '';
                        return `${displayDate}${weekdayStr}<br/>支出: ¥${value.toLocaleString()}`;
                    },
                    confine: true
                },
                grid: { left: '3%', right: '3%', bottom: '5%', top: '15%', containLabel: true },
                xAxis: {
                    type: 'category',
                    data: sortedKeys,
                    axisLabel: {
                        rotate: sortedKeys.length > 15 ? 45 : 0
                    }
                },
                yAxis: { type: 'value' },
                series: [{
                    name: '采购支出',
                    type: 'line',
                    smooth: true,
                    symbolSize: 8,
                    data: values,
                    itemStyle: { color: '#ef4444' },
                    areaStyle: { color: 'rgba(239, 68, 68, 0.1)' },
                    markLine: {
                        data: [{ type: 'average', name: '平均值' }]
                    }
                }]
            };

            charts.trend.setOption(option, true);
        } catch (error) {
            console.error('趋势图更新错误:', error);
            showChartEmpty(charts.trend, '图表渲染失败');
        }
    }

    /**
     * 更新每日菜品用量分析图表
     * 支持热力图和堆叠柱状图两种模式
     */
    function updateDailyUsageChart() {
        if (!charts.dailyUsage) return;

        try {
            const data = getActiveData();
            const viewMode = document.getElementById('usageViewMode')?.value || 'heatmap';
            const topN = parseInt(document.getElementById('usageTopN')?.value || '10');

            if (data.length === 0) {
                showChartEmpty(charts.dailyUsage, '暂无数据');
                return;
            }

            // 1. 统计每个菜品的总用量，获取TOP N
            const itemTotalQty = {};
            data.forEach(d => {
                if (!itemTotalQty[d.item]) itemTotalQty[d.item] = 0;
                itemTotalQty[d.item] += d.qty;
            });

            const topItems = Object.entries(itemTotalQty)
                .sort((a, b) => b[1] - a[1])
                .slice(0, topN)
                .map(d => d[0]);

            if (topItems.length === 0) {
                showChartEmpty(charts.dailyUsage, '暂无菜品数据');
                return;
            }

            // 2. 统计每日每个菜品的用量
            const dailyItemQty = {}; // { dateKey: { item: qty } }
            data.forEach(d => {
                if (!d.date || !topItems.includes(d.item)) return;
                const dateKey = formatDate(d.date, 'day');
                if (!dailyItemQty[dateKey]) dailyItemQty[dateKey] = {};
                if (!dailyItemQty[dateKey][d.item]) dailyItemQty[dateKey][d.item] = 0;
                dailyItemQty[dateKey][d.item] += d.qty;
            });

            const sortedDates = Object.keys(dailyItemQty).sort();

            if (sortedDates.length === 0) {
                showChartEmpty(charts.dailyUsage, '无有效日期数据');
                return;
            }

            let option;

            if (viewMode === 'heatmap') {
                // 热力图模式
                const heatmapData = [];
                let maxValue = 0;

                sortedDates.forEach((dateKey, xIdx) => {
                    topItems.forEach((item, yIdx) => {
                        const qty = dailyItemQty[dateKey]?.[item] || 0;
                        heatmapData.push([xIdx, yIdx, qty]);
                        if (qty > maxValue) maxValue = qty;
                    });
                });

                // 简化日期标签
                const dateLabels = sortedDates.map(d => d.substring(5)); // MM-DD

                option = {
                    tooltip: {
                        position: 'top',
                        formatter: function (params) {
                            const dateIdx = params.data[0];
                            const itemIdx = params.data[1];
                            const qty = params.data[2];
                            const dateStr = sortedDates[dateIdx];
                            const item = topItems[itemIdx];

                            // 获取星期几
                            const date = new Date(dateStr);
                            const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
                            const weekday = weekdays[date.getDay()];

                            return `${dateStr.substring(5)} ${weekday}<br/>${item}<br/>用量: <b>${qty}</b>`;
                        },
                        confine: true
                    },
                    grid: {
                        left: '12%',
                        right: '8%',
                        bottom: '15%',
                        top: '8%',
                        containLabel: true
                    },
                    xAxis: {
                        type: 'category',
                        data: dateLabels,
                        splitArea: { show: true },
                        axisLabel: {
                            rotate: sortedDates.length > 15 ? 45 : 0,
                            fontSize: 10
                        }
                    },
                    yAxis: {
                        type: 'category',
                        data: topItems,
                        splitArea: { show: true },
                        axisLabel: {
                            fontSize: 10,
                            width: 80,
                            overflow: 'truncate'
                        }
                    },
                    visualMap: {
                        min: 0,
                        max: maxValue || 1,
                        calculable: true,
                        orient: 'horizontal',
                        left: 'center',
                        bottom: '0%',
                        inRange: {
                            color: ['#f0fdf4', '#86efac', '#22c55e', '#15803d', '#14532d']
                        },
                        textStyle: { fontSize: 10 }
                    },
                    series: [{
                        name: '用量',
                        type: 'heatmap',
                        data: heatmapData,
                        label: {
                            show: sortedDates.length <= 10 && topItems.length <= 10,
                            fontSize: 9
                        },
                        emphasis: {
                            itemStyle: {
                                shadowBlur: 10,
                                shadowColor: 'rgba(0, 0, 0, 0.5)'
                            }
                        }
                    }]
                };
            } else {
                // 堆叠柱状图模式
                const dateLabels = sortedDates.map(d => d.substring(5)); // MM-DD

                // 为每个菜品创建一个系列
                const series = topItems.map((item, idx) => {
                    const values = sortedDates.map(dateKey => {
                        return dailyItemQty[dateKey]?.[item] || 0;
                    });

                    return {
                        name: item,
                        type: 'bar',
                        stack: 'total',
                        emphasis: { focus: 'series' },
                        data: values
                    };
                });

                option = {
                    tooltip: {
                        trigger: 'axis',
                        axisPointer: { type: 'shadow' },
                        formatter: function (params) {
                            const dateIdx = params[0].dataIndex;
                            const dateStr = sortedDates[dateIdx];

                            // 获取星期几
                            const date = new Date(dateStr);
                            const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
                            const weekday = weekdays[date.getDay()];

                            let result = `${dateStr.substring(5)} ${weekday}<br/>`;
                            let total = 0;

                            // 按用量排序显示
                            params.sort((a, b) => b.value - a.value);
                            params.forEach(p => {
                                if (p.value > 0) {
                                    result += `${p.marker}${p.seriesName}: ${p.value}<br/>`;
                                    total += p.value;
                                }
                            });
                            result += `<b>合计: ${total}</b>`;
                            return result;
                        },
                        confine: true
                    },
                    legend: {
                        type: 'scroll',
                        bottom: 0,
                        data: topItems,
                        textStyle: { fontSize: 10 }
                    },
                    grid: {
                        left: '3%',
                        right: '4%',
                        bottom: '15%',
                        top: '8%',
                        containLabel: true
                    },
                    xAxis: {
                        type: 'category',
                        data: dateLabels,
                        axisLabel: {
                            rotate: sortedDates.length > 15 ? 45 : 0,
                            fontSize: 10
                        }
                    },
                    yAxis: {
                        type: 'value',
                        name: '用量'
                    },
                    series: series
                };
            }

            charts.dailyUsage.setOption(option, true);
        } catch (error) {
            console.error('每日用量图更新错误:', error);
            showChartEmpty(charts.dailyUsage, '图表渲染失败');
        }
    }

    function updateCategoryChart() {
        if (!charts.category) return;

        try {
            const agg = {};
            const activeData = getActiveData();
            activeData.forEach(d => {
                agg[d.category] = (agg[d.category] || 0) + d.cost;
            });

            let data = Object.entries(agg)
                .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
                .sort((a, b) => b.value - a.value);

            if (data.length === 0) {
                showChartEmpty(charts.category, '暂无分类数据');
                return;
            }

            // 合并小类别
            if (data.length > 10) {
                const top9 = data.slice(0, 9);
                const others = data.slice(9);
                const otherSum = others.reduce((acc, curr) => acc + curr.value, 0);
                top9.push({ name: '其他', value: parseFloat(otherSum.toFixed(2)) });
                data = top9;
            }

            const option = {
                tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)', confine: true },
                legend: {
                    type: 'scroll',
                    orient: 'vertical',
                    right: 10,
                    top: 20,
                    bottom: 20,
                    data: data.map(d => d.name)
                },
                series: [{
                    name: '成本分布',
                    type: 'pie',
                    radius: ['40%', '70%'],
                    center: ['40%', '50%'],
                    avoidLabelOverlap: true,
                    itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
                    label: { show: true, formatter: '{b}: {d}%' },
                    labelLine: { show: true },
                    data: data
                }]
            };

            charts.category.setOption(option, true);
        } catch (error) {
            console.error('分类图更新错误:', error);
            showChartEmpty(charts.category, '图表渲染失败');
        }
    }

    function updateProductChart() {
        if (!charts.product) return;

        try {
            const agg = {};
            const data = getActiveData();
            data.forEach(d => {
                agg[d.item] = (agg[d.item] || 0) + d.cost;
            });

            const sorted = Object.entries(agg)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .reverse();

            if (sorted.length === 0) {
                showChartEmpty(charts.product, '暂无商品数据');
                return;
            }

            const option = {
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: '{b}: ¥{c}', confine: true },
                grid: { left: '3%', right: '5%', bottom: '3%', containLabel: true },
                xAxis: { type: 'value' },
                yAxis: {
                    type: 'category',
                    data: sorted.map(d => d[0].length > 10 ? d[0].substring(0, 10) + '...' : d[0]),
                    axisLabel: { interval: 0 }
                },
                series: [{
                    name: '采购总额',
                    type: 'bar',
                    data: sorted.map(d => parseFloat(d[1].toFixed(2))),
                    itemStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                            { offset: 0, color: '#fca5a5' },
                            { offset: 1, color: '#dc2626' }
                        ])
                    },
                    label: { show: true, position: 'right', formatter: '{c}' }
                }]
            };

            charts.product.setOption(option, true);
        } catch (error) {
            console.error('商品图更新错误:', error);
            showChartEmpty(charts.product, '图表渲染失败');
        }
    }

    function updateWeeklyChart() {
        if (!charts.weekly) return;

        try {
            const daySums = new Array(7).fill(0);
            const dayDates = Array.from({ length: 7 }, () => new Set());
            const data = getActiveData();

            data.forEach(d => {
                if (!d.date) return;
                const dayIndex = d.date.getDay();
                daySums[dayIndex] += d.cost;
                dayDates[dayIndex].add(d.date.toDateString());
            });

            // 重排为周一到周日
            const labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
            const mapIndices = [1, 2, 3, 4, 5, 6, 0];

            const avgData = mapIndices.map(idx => {
                const count = dayDates[idx].size;
                const avg = count > 0 ? daySums[idx] / count : 0;
                return parseFloat(avg.toFixed(2));
            });

            if (avgData.every(v => v === 0)) {
                showChartEmpty(charts.weekly, '暂无周规律数据');
                return;
            }

            const option = {
                tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: '{b}<br />平均日支出: ¥{c}', confine: true },
                grid: { left: '3%', right: '3%', bottom: '3%', containLabel: true },
                xAxis: { type: 'category', data: labels },
                yAxis: { type: 'value' },
                series: [{
                    name: '平均支出',
                    type: 'bar',
                    data: avgData,
                    itemStyle: { color: '#8b5cf6', borderRadius: [4, 4, 0, 0] },
                    markPoint: {
                        data: [
                            { type: 'max', name: '最大值' },
                            { type: 'min', name: '最小值' }
                        ]
                    }
                }]
            };

            charts.weekly.setOption(option, true);
        } catch (error) {
            console.error('周规律图更新错误:', error);
            showChartEmpty(charts.weekly, '图表渲染失败');
        }
    }

    function updateSourceChart() {
        if (!charts.source) return;

        try {
            const agg = {};
            const activeData = getActiveData();
            activeData.forEach(d => {
                agg[d.source] = (agg[d.source] || 0) + d.cost;
            });

            const data = Object.entries(agg)
                .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
                .sort((a, b) => b.value - a.value);

            if (data.length === 0) {
                showChartEmpty(charts.source, '暂无来源数据');
                return;
            }

            const option = {
                tooltip: { trigger: 'item', confine: true },
                legend: { orient: 'vertical', left: 'left' },
                series: [{
                    name: '采购来源',
                    type: 'pie',
                    radius: '50%',
                    data: data,
                    emphasis: {
                        itemStyle: {
                            shadowBlur: 10,
                            shadowOffsetX: 0,
                            shadowColor: 'rgba(0, 0, 0, 0.5)'
                        }
                    }
                }]
            };

            charts.source.setOption(option, true);
        } catch (error) {
            console.error('来源图更新错误:', error);
            showChartEmpty(charts.source, '图表渲染失败');
        }
    }

    function updatePriceTrendChart() {
        if (!charts.priceTrend) return;

        try {
            // 获取 Top 5 商品
            const itemCosts = {};
            const data = getActiveData();
            data.forEach(d => {
                itemCosts[d.item] = (itemCosts[d.item] || 0) + d.cost;
            });

            const topItems = Object.entries(itemCosts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(entry => entry[0]);

            if (topItems.length === 0) {
                showChartEmpty(charts.priceTrend, '暂无价格趋势数据');
                return;
            }

            // 构建数据
            const seriesMap = {};
            const allDates = new Set();

            topItems.forEach(item => {
                seriesMap[item] = {};
            });

            data.forEach(d => {
                if (!topItems.includes(d.item)) return;
                if (!d.date || d.qty <= 0) return;

                const dateStr = formatDate(d.date, 'day');
                allDates.add(dateStr);

                const unitPrice = d.cost / d.qty;

                if (!seriesMap[d.item][dateStr]) {
                    seriesMap[d.item][dateStr] = [];
                }
                seriesMap[d.item][dateStr].push(unitPrice);
            });

            const sortedDates = Array.from(allDates).sort();

            if (sortedDates.length === 0) {
                showChartEmpty(charts.priceTrend, '暂无有效价格数据');
                return;
            }

            const series = topItems.map(item => ({
                name: item.length > 15 ? item.substring(0, 15) + '...' : item,
                type: 'line',
                data: sortedDates.map(date => {
                    const prices = seriesMap[item][date];
                    if (!prices || prices.length === 0) return null;
                    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
                    return parseFloat(avg.toFixed(2));
                }),
                connectNulls: true,
                smooth: true,
                symbol: 'circle',
                symbolSize: 6
            }));

            const option = {
                tooltip: { trigger: 'axis', confine: true },
                legend: {
                    data: topItems.map(i => i.length > 15 ? i.substring(0, 15) + '...' : i),
                    bottom: 0,
                    type: 'scroll'
                },
                grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
                xAxis: {
                    type: 'category',
                    boundaryGap: false,
                    data: sortedDates,
                    axisLabel: { rotate: sortedDates.length > 10 ? 45 : 0 }
                },
                yAxis: {
                    type: 'value',
                    name: '单价(元)',
                    axisLabel: { formatter: '{value}' }
                },
                series: series
            };

            charts.priceTrend.setOption(option, true);
        } catch (error) {
            console.error('价格趋势图更新错误:', error);
            showChartEmpty(charts.priceTrend, '图表渲染失败');
        }
    }

    function updateTreemapChart() {
        if (!charts.treemap) return;

        try {
            const cats = {};
            const data = getActiveData();

            data.forEach(d => {
                if (!cats[d.category]) {
                    cats[d.category] = {};
                }
                cats[d.category][d.item] = (cats[d.category][d.item] || 0) + d.cost;
            });

            const treeMapData = Object.entries(cats).map(([catName, items]) => ({
                name: catName,
                children: Object.entries(items).map(([itemName, cost]) => ({
                    name: itemName,
                    value: parseFloat(cost.toFixed(2))
                }))
            }));

            if (treeMapData.length === 0) {
                showChartEmpty(charts.treemap, '暂无分类树形数据');
                return;
            }

            const option = {
                tooltip: { formatter: '{b}: ¥{c}', confine: true },
                series: [{
                    name: '采购分类',
                    type: 'treemap',
                    breadcrumb: { show: true, bottom: 5 },
                    label: { show: true, formatter: '{b}' },
                    itemStyle: { borderColor: '#fff' },
                    levels: [
                        {
                            itemStyle: { borderColor: '#777', borderWidth: 0, gapWidth: 1 },
                            upperLabel: { show: false }
                        },
                        {
                            itemStyle: { borderColor: '#555', borderWidth: 5, gapWidth: 1 },
                            emphasis: { itemStyle: { borderColor: '#ddd' } }
                        }
                    ],
                    data: treeMapData
                }]
            };

            charts.treemap.setOption(option, true);
        } catch (error) {
            console.error('树图更新错误:', error);
            showChartEmpty(charts.treemap, '图表渲染失败');
        }
    }

    function updatePriceVolatilityChart() {
        if (!charts.priceVolatility) return;

        try {
            const data = getActiveData();

            // 统计每个商品的价格数据
            const itemPrices = {};

            data.forEach(d => {
                if (d.qty <= 0) return;
                const unitPrice = d.cost / d.qty;

                if (!itemPrices[d.item]) {
                    itemPrices[d.item] = {
                        prices: [],
                        totalCost: 0
                    };
                }
                itemPrices[d.item].prices.push(unitPrice);
                itemPrices[d.item].totalCost += d.cost;
            });

            // 计算波动率并排序
            const volatilityData = Object.entries(itemPrices)
                .filter(([_, info]) => info.prices.length >= 2) // 至少有2次采购才能计算波动
                .map(([name, info]) => {
                    const prices = info.prices;
                    const min = Math.min(...prices);
                    const max = Math.max(...prices);
                    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
                    const volatility = avg > 0 ? ((max - min) / avg * 100) : 0;

                    return {
                        name: name,
                        min: parseFloat(min.toFixed(2)),
                        max: parseFloat(max.toFixed(2)),
                        avg: parseFloat(avg.toFixed(2)),
                        volatility: parseFloat(volatility.toFixed(1)),
                        count: prices.length,
                        totalCost: info.totalCost
                    };
                })
                .sort((a, b) => b.volatility - a.volatility) // 按波动率排序
                .slice(0, 15); // 取前15个

            if (volatilityData.length === 0) {
                showChartEmpty(charts.priceVolatility, '暂无足够的价格数据计算波动');
                return;
            }

            // 反转以便横向显示
            volatilityData.reverse();

            const option = {
                tooltip: {
                    trigger: 'axis',
                    axisPointer: { type: 'shadow' },
                    formatter: function (params) {
                        const idx = params[0].dataIndex;
                        const item = volatilityData[idx];
                        return `<strong>${item.name}</strong><br/>
                                最低价: ¥${item.min}<br/>
                                平均价: ¥${item.avg}<br/>
                                最高价: ¥${item.max}<br/>
                                波动率: ${item.volatility}%<br/>
                                采购次数: ${item.count}次`;
                    },
                    confine: true
                },
                grid: { left: '3%', right: '15%', bottom: '3%', top: '10%', containLabel: true },
                xAxis: {
                    type: 'value',
                    name: '单价(元)',
                    axisLabel: { formatter: '{value}' }
                },
                yAxis: {
                    type: 'category',
                    data: volatilityData.map(d => d.name.length > 8 ? d.name.substring(0, 8) + '...' : d.name),
                    axisLabel: { interval: 0 }
                },
                series: [
                    {
                        name: '价格区间',
                        type: 'bar',
                        stack: 'price',
                        data: volatilityData.map(d => d.min),
                        itemStyle: { color: 'transparent' },
                        emphasis: { itemStyle: { color: 'transparent' } }
                    },
                    {
                        name: '价格波动范围',
                        type: 'bar',
                        stack: 'price',
                        data: volatilityData.map(d => parseFloat((d.max - d.min).toFixed(2))),
                        itemStyle: {
                            color: function (params) {
                                const v = volatilityData[params.dataIndex].volatility;
                                if (v > 50) return '#ef4444'; // 红色 - 高波动
                                if (v > 25) return '#f59e0b'; // 橙色 - 中波动
                                return '#10b981'; // 绿色 - 低波动
                            }
                        },
                        label: {
                            show: true,
                            position: 'right',
                            formatter: function (params) {
                                const item = volatilityData[params.dataIndex];
                                return `${item.volatility}%`;
                            },
                            fontSize: 11
                        }
                    },
                    {
                        name: '平均价',
                        type: 'scatter',
                        data: volatilityData.map((d, idx) => [d.avg, idx]),
                        symbolSize: 10,
                        itemStyle: { color: '#2563eb' },
                        z: 10
                    }
                ]
            };

            charts.priceVolatility.setOption(option, true);
        } catch (error) {
            console.error('价格波动图更新错误:', error);
            showChartEmpty(charts.priceVolatility, '图表渲染失败');
        }
    }

    // ========== 初始化 ==========

    function initCharts() {
        try {
            charts.trend = echarts.init(document.getElementById('trendChart'));
            charts.dailyUsage = echarts.init(document.getElementById('dailyUsageChart'));
            charts.category = echarts.init(document.getElementById('categoryChart'));
            charts.product = echarts.init(document.getElementById('productChart'));
            charts.weekly = echarts.init(document.getElementById('weeklyChart'));
            charts.source = echarts.init(document.getElementById('sourceChart'));
            charts.priceTrend = echarts.init(document.getElementById('priceTrendChart'));
            charts.priceVolatility = echarts.init(document.getElementById('priceVolatilityChart'));
            charts.treemap = echarts.init(document.getElementById('treemapChart'));

            // 初始显示空状态
            Object.values(charts).forEach(chart => {
                if (chart) showChartEmpty(chart, '请导入Excel数据');
            });
        } catch (error) {
            console.error('图表初始化失败:', error);
            showToast('图表初始化失败，请刷新页面重试', 'error');
        }
    }

    function resizeCharts() {
        Object.values(charts).forEach(chart => {
            if (chart) {
                try {
                    chart.resize();
                } catch (e) {
                    console.warn('图表调整大小失败:', e);
                }
            }
        });
    }

    // ========== 事件绑定 ==========

    // 初始化图表
    if (checkDependencies()) {
        initCharts();
    }

    // 窗口大小调整
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resizeCharts, 100);
    });

    // 文件选择
    if (fileInput) {
        fileInput.addEventListener('change', handleFile);
    } else {
        console.error('找不到文件输入元素 #fileInput');
    }

    // 粒度切换
    const granularitySelect = document.getElementById('trendGranularity');
    if (granularitySelect) {
        granularitySelect.addEventListener('change', () => {
            if (state.globalData.length > 0) {
                updateTrendChart();
            }
        });
    }

    // 每日菜品用量图表选项切换
    const usageViewModeSelect = document.getElementById('usageViewMode');
    const usageTopNSelect = document.getElementById('usageTopN');

    if (usageViewModeSelect) {
        usageViewModeSelect.addEventListener('change', () => {
            if (state.globalData.length > 0) {
                updateDailyUsageChart();
            }
        });
    }

    if (usageTopNSelect) {
        usageTopNSelect.addEventListener('change', () => {
            if (state.globalData.length > 0) {
                updateDailyUsageChart();
            }
        });
    }


    // 页面可见性变化时重新调整图表
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            setTimeout(resizeCharts, 100);
        }
    });

    // ========== 时间选择器事件绑定 ==========

    // 快捷时间按钮
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.globalData.length === 0) {
                showToast('请先导入数据', 'warning');
                return;
            }
            handleTimeShortcut(btn.dataset.range);
        });
    });

    // 自定义日期范围应用按钮
    const applyDateBtn = document.getElementById('applyDateRange');
    if (applyDateBtn) {
        applyDateBtn.addEventListener('click', () => {
            if (state.globalData.length === 0) {
                showToast('请先导入数据', 'warning');
                return;
            }
            handleCustomDateRange();
        });
    }

    // 日期输入框回车确认
    const dateStart = document.getElementById('dateStart');
    const dateEnd = document.getElementById('dateEnd');

    if (dateStart && dateEnd) {
        const handleDateEnter = (e) => {
            if (e.key === 'Enter' && state.globalData.length > 0) {
                handleCustomDateRange();
            }
        };
        dateStart.addEventListener('keypress', handleDateEnter);
        dateEnd.addEventListener('keypress', handleDateEnter);
    }

    // 初始禁用时间过滤器（等待数据导入）
    disableTimeFilter();
});
