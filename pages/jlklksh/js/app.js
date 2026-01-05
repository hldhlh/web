document.addEventListener('DOMContentLoaded', () => {
    // ---- Configuration for "采购清单" (Procurement) ----
    const COL_MAP = {
        branch: 0,
        orderId: 1,
        date: 2,
        source: 4,
        majorCategory: 5,
        item: 7,
        qty: 10,
        cost: 14
    };

    // DOM Elements
    const fileInput = document.getElementById('fileInput');

    // Charts Instances
    let trendChart = null;
    let categoryChart = null;
    let productChart = null;
    let weeklyChart = null; // Renamed from storeChart
    let sourceChart = null;
    let priceTrendChart = null; // New
    let treemapChart = null;    // New

    // State
    let globalData = [];

    // ---- Initialization ----
    initCharts();
    window.addEventListener('resize', resizeCharts);

    fileInput.addEventListener('change', handleFile);
    document.getElementById('trendGranularity').addEventListener('change', updateTrendChart);

    // ---- Core Logic ----

    function handleFile(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

            // Read as Array of Arrays
            const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

            if (rows.length < 2) {
                alert("文件数据为空或格式不正确");
                return;
            }

            // Parse Data
            // Skip header (row 0)
            globalData = rows.slice(1).map(row => ({
                branch: row[COL_MAP.branch] || "未知门店",
                orderId: row[COL_MAP.orderId],
                date: row[COL_MAP.date],
                source: row[COL_MAP.source] || "其他",
                category: row[COL_MAP.majorCategory] || "其他",
                item: row[COL_MAP.item] || "未知商品",
                qty: parseFloat(row[COL_MAP.qty]) || 0,
                cost: parseFloat(row[COL_MAP.cost]) || 0
            })).filter(d => d.date); // Filter out empty lines

            renderDashboard();
        };
        reader.readAsArrayBuffer(file);
    }

    function renderDashboard() {
        if (globalData.length === 0) return;

        updateKPIs();
        updateTrendChart();
        updateCategoryChart();
        updateProductChart(); // Top Cost Items
        updateWeeklyChart();  // Weekly Rhythm (New)
        updateSourceChart(); // Procurement Source
        updatePriceTrendChart(); // New
        updateTreemapChart();    // New
    }

    // ---- KPIs ----
    function updateKPIs() {
        // Total Cost
        const totalCost = globalData.reduce((acc, curr) => acc + curr.cost, 0);
        document.getElementById('kpiCost').innerText = `¥ ${totalCost.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // Total Orders (Unique IDs)
        const uniqueOrders = new Set(globalData.map(d => d.orderId)).size;
        document.getElementById('kpiOrders').innerText = uniqueOrders.toLocaleString();

        // Total Items
        const totalItems = globalData.reduce((acc, curr) => acc + curr.qty, 0);
        document.getElementById('kpiItems').innerText = totalItems.toLocaleString();

        // Unique Categories
        const uniqueCats = new Set(globalData.map(d => d.category)).size;
        const uniqueItems = new Set(globalData.map(d => d.item)).size;
        document.getElementById('kpiCategories').innerText = `${uniqueCats} 类 / ${uniqueItems} 种`;
    }

    // ---- Charts ----

    function updateTrendChart() {
        const granularity = document.getElementById('trendGranularity').value;
        const agg = {};

        globalData.forEach(d => {
            let dateKey = d.date;
            // Robust Date Parsing
            let dateObj;
            if (typeof d.date === 'number') {
                dateObj = new Date((d.date - 25569) * 86400 * 1000);
            } else {
                dateObj = new Date(d.date);
            }

            if (isNaN(dateObj.getTime())) return;

            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');

            dateKey = granularity === 'month' ? `${y}-${m}` : `${y}-${m}-${day}`;

            agg[dateKey] = (agg[dateKey] || 0) + d.cost;
        });

        const sortedKeys = Object.keys(agg).sort();
        const startValues = sortedKeys.map(k => parseFloat(agg[k].toFixed(2)));

        const option = {
            tooltip: { trigger: 'axis', formatter: '{b}<br />支出: ¥{c}' },
            grid: { left: '3%', right: '3%', bottom: '5%', top: '15%', containLabel: true },
            xAxis: { type: 'category', data: sortedKeys },
            yAxis: { type: 'value' },
            series: [{
                name: '当日/月采购支出',
                type: 'line',
                smooth: true,
                symbolSize: 8,
                data: startValues,
                itemStyle: { color: '#ef4444' }, // Red for Cost
                areaStyle: { color: 'rgba(239, 68, 68, 0.1)' },
                markLine: {
                    data: [{ type: 'average', name: '平均值' }]
                }
            }]
        };
        trendChart.setOption(option);
    }

    function updateCategoryChart() {
        const agg = {};
        globalData.forEach(d => {
            agg[d.category] = (agg[d.category] || 0) + d.cost;
        });

        let data = Object.keys(agg).map(k => ({ name: k, value: parseFloat(agg[k].toFixed(2)) }));
        data.sort((a, b) => b.value - a.value);

        // Optimization: Too many categories make the chart unreadable.
        // Strategy: Keep Top 9, merge rest into "其他" (Others)
        if (data.length > 10) {
            const top9 = data.slice(0, 9);
            const others = data.slice(9);
            const otherSum = others.reduce((acc, curr) => acc + curr.value, 0);

            top9.push({ name: '其他', value: parseFloat(otherSum.toFixed(2)) });
            data = top9;
        }

        const option = {
            tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
            legend: {
                type: 'scroll', // Allow scrolling if still many
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
                center: ['40%', '50%'], // Move left to make room for legend
                avoidLabelOverlap: true,
                itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
                label: {
                    show: true,
                    formatter: '{b}: {d}%' // Show Name + Percent
                },
                labelLine: {
                    show: true
                },
                data: data
            }]
        };
        categoryChart.setOption(option);
    }

    function updateProductChart() {
        // Top Cost Items (Most expensive purchases)
        const agg = {};

        globalData.forEach(d => {
            const key = d.item;
            agg[key] = (agg[key] || 0) + d.cost;
        });

        const sorted = Object.entries(agg)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        sorted.reverse();

        const option = {
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: '{b}: ¥{c}' },
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
                        { offset: 0, color: '#fca5a5' }, // light red
                        { offset: 1, color: '#dc2626' }  // dark red
                    ])
                },
                label: { show: true, position: 'right', formatter: '{c}' }
            }]
        };
        productChart.setOption(option);
    }

    function updateWeeklyChart() {
        // Logic: Group total cost by Day of Week (0=Sun, 6=Sat)
        // Array for Sum and Count
        const daySums = new Array(7).fill(0);
        const dayCounts = new Array(7).fill(0); // To calculate average if needed
        const uniqueDates = new Set();

        globalData.forEach(d => {
            let dateObj;
            if (typeof d.date === 'number') {
                dateObj = new Date((d.date - 25569) * 86400 * 1000);
            } else {
                dateObj = new Date(d.date);
            }
            if (isNaN(dateObj.getTime())) return;

            const dayIndex = dateObj.getDay();
            daySums[dayIndex] += d.cost;

            // For count (naive approach: just count unique dates per weekday)
            uniqueDates.add(dateObj.toDateString());
        });

        // Re-order to Mon-Sun (standard business week)
        // Indices: 0(Sun), 1(Mon), 2(Tue)...
        // Target: Mon(1), Tue(2)... Sat(6), Sun(0)
        const reorderedData = [];
        const reorderedLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        const mapIndices = [1, 2, 3, 4, 5, 6, 0];

        mapIndices.forEach(idx => {
            reorderedData.push(parseFloat(daySums[idx].toFixed(2)));
        });

        // Calculate Average maybe? Total is tricky if data captures 2 Mondays but 1 Tuesday.
        // Let's stick to Total for "Rhythm" visualization unless data is huge.
        // Or better: Average Daily Spend per Weekday.
        // Let's try Average.

        const avgData = [];
        mapIndices.forEach(idx => {
            // Count how many unique Mondays, Tuesdays etc. in the dataset
            const count = Array.from(uniqueDates).filter(dateStr => new Date(dateStr).getDay() === idx).length;
            const avg = count > 0 ? daySums[idx] / count : 0;
            avgData.push(parseFloat(avg.toFixed(2)));
        });

        const option = {
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: '{b}<br />平均日支出: ¥{c}' },
            grid: { left: '3%', right: '3%', bottom: '3%', containLabel: true },
            xAxis: { type: 'category', data: reorderedLabels },
            yAxis: { type: 'value' },
            series: [{
                name: '平均支出',
                type: 'bar',
                data: avgData,
                itemStyle: {
                    color: '#8b5cf6', // Violet
                    borderRadius: [4, 4, 0, 0]
                },
                markPoint: {
                    data: [
                        { type: 'max', name: '最大值' },
                        { type: 'min', name: '最小值' }
                    ]
                }
            }]
        };
        weeklyChart.setOption(option);
    }

    function updateSourceChart() {
        const agg = {};
        globalData.forEach(d => {
            const s = d.source;
            agg[s] = (agg[s] || 0) + d.cost;
        });

        const data = Object.keys(agg).map(k => ({ name: k, value: parseFloat(agg[k].toFixed(2)) }));
        data.sort((a, b) => b.value - a.value);

        const option = {
            tooltip: { trigger: 'item' },
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
        sourceChart.setOption(option);
    }

    function updatePriceTrendChart() {
        // 1. Identify Top 5 Items by Cost
        const itemCosts = {};
        globalData.forEach(d => {
            itemCosts[d.item] = (itemCosts[d.item] || 0) + d.cost;
        });
        const topItems = Object.entries(itemCosts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(entry => entry[0]);

        // 2. Prepare Series Data
        // Map: Item -> { DateStr: [prices...] }
        const seriesMap = {};
        const allDates = new Set();
        const dateValues = {}; // To store numeric date values for sorting

        topItems.forEach(item => {
            seriesMap[item] = {};
        });

        globalData.forEach(d => {
            if (!topItems.includes(d.item)) return;
            if (d.qty === 0) return;

            let dateObj;
            if (typeof d.date === 'number') { dateObj = new Date((d.date - 25569) * 86400 * 1000); }
            else { dateObj = new Date(d.date); }
            if (isNaN(dateObj.getTime())) return;

            const dateStr = dateObj.toISOString().split('T')[0];
            allDates.add(dateStr);
            dateValues[dateStr] = dateObj.getTime();

            const unitPrice = d.cost / d.qty;

            if (!seriesMap[d.item][dateStr]) {
                seriesMap[d.item][dateStr] = [];
            }
            seriesMap[d.item][dateStr].push(unitPrice);
        });

        const sortedDates = Array.from(allDates).sort();

        const series = topItems.map(item => {
            const data = sortedDates.map(date => {
                const prices = seriesMap[item][date];
                if (!prices || prices.length === 0) return null;
                const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
                return parseFloat(avg.toFixed(2));
            });

            return {
                name: item,
                type: 'line',
                data: data,
                connectNulls: true,
                smooth: true,
                symbol: 'circle',
                symbolSize: 6
            };
        });

        const option = {
            tooltip: { trigger: 'axis' },
            legend: { data: topItems, bottom: 0 },
            grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: sortedDates
            },
            yAxis: {
                type: 'value',
                name: '单价(元)',
                axisLabel: { formatter: '{value}' }
            },
            series: series
        };
        priceTrendChart.setOption(option);
    }

    function updateTreemapChart() {
        const cats = {};

        globalData.forEach(d => {
            if (!cats[d.category]) {
                cats[d.category] = {};
            }
            cats[d.category][d.item] = (cats[d.category][d.item] || 0) + d.cost;
        });

        const treeMapData = [];
        Object.keys(cats).forEach(catName => {
            const children = [];
            Object.keys(cats[catName]).forEach(itemName => {
                children.push({
                    name: itemName,
                    value: parseFloat(cats[catName][itemName].toFixed(2))
                });
            });
            treeMapData.push({
                name: catName,
                children: children
            });
        });

        const option = {
            tooltip: {
                formatter: '{b}: ¥{c}'
            },
            series: [{
                name: '采购分类',
                type: 'treemap',
                breadcrumb: { show: false }, // Simplify for cleaner look
                label: { show: true, formatter: '{b}' },
                itemStyle: {
                    borderColor: '#fff'
                },
                levels: [
                    {
                        itemStyle: {
                            borderColor: '#777',
                            borderWidth: 0,
                            gapWidth: 1
                        },
                        upperLabel: { show: false }
                    },
                    {
                        itemStyle: {
                            borderColor: '#555',
                            borderWidth: 5,
                            gapWidth: 1
                        },
                        emphasis: { itemStyle: { borderColor: '#ddd' } }
                    }
                ],
                data: treeMapData
            }]
        };
        treemapChart.setOption(option);
    }

    function initCharts() {
        trendChart = echarts.init(document.getElementById('trendChart'));
        categoryChart = echarts.init(document.getElementById('categoryChart'));
        productChart = echarts.init(document.getElementById('productChart'));
        weeklyChart = echarts.init(document.getElementById('weeklyChart')); // Replaced storeChart
        sourceChart = echarts.init(document.getElementById('sourceChart'));
        priceTrendChart = echarts.init(document.getElementById('priceTrendChart'));
        treemapChart = echarts.init(document.getElementById('treemapChart'));
    }

    function resizeCharts() {
        if (trendChart) trendChart.resize();
        if (categoryChart) categoryChart.resize();
        if (productChart) productChart.resize();
        if (weeklyChart) weeklyChart.resize();
        if (sourceChart) sourceChart.resize();
        if (priceTrendChart) priceTrendChart.resize();
        if (treemapChart) treemapChart.resize();
    }
});
