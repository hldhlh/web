/**
 * Supabase CDN 智能管理系统
 * 功能：多CDN测速、自动选择最优节点、使用期间智能切换
 */

class CDNManager {
    constructor() {
        // CDN 节点配置
        // 注意：Supabase 的实际 API 域名是固定的，这里配置的是代理/加速节点
        // 如果你有自己的 CDN 代理服务，可以添加到这里
        this.cdnNodes = {
            // Supabase API 节点（数据库 + 存储）
            supabaseApi: [
                {
                    name: '官方节点',
                    region: 'global',
                    url: 'https://fmxddvjgkykuqwmasigo.supabase.co',
                    priority: 1
                },
                // 如果有 CDN 代理，可以添加更多节点
                // { name: '国内加速1', region: 'cn', url: 'https://your-cdn-proxy.com', priority: 2 },
            ],
            // 存储 CDN 节点（用于文件下载）
            storage: [
                {
                    name: '官方存储',
                    region: 'global',
                    url: 'https://fmxddvjgkykuqwmasigo.supabase.co/storage/v1',
                    priority: 1
                },
                // 可添加 Cloudflare Workers、Vercel Edge 等代理节点
            ],
            // 第三方库 CDN（已有配置增强版）
            libs: {
                supabase: [
                    { name: 'jsDelivr', region: 'global', url: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js' },
                    { name: 'Fastly jsDelivr', region: 'global', url: 'https://fastly.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js' },
                    { name: 'UNPKG', region: 'us', url: 'https://unpkg.com/@supabase/supabase-js@2.45.0/dist/umd/supabase.min.js' },
                    { name: 'ESM.sh', region: 'global', url: 'https://esm.sh/@supabase/supabase-js@2?bundle' },
                    // 国内 CDN 源
                    { name: 'BootCDN', region: 'cn', url: 'https://cdn.bootcdn.net/ajax/libs/supabase/2.45.0/umd/supabase.min.js' },
                    { name: '字节跳动 CDN', region: 'cn', url: 'https://lf3-cdn-tos.bytecdntp.com/cdn/expire-1-M/supabase/2.45.0/umd/supabase.min.js' },
                    { name: '七牛云 CDN', region: 'cn', url: 'https://cdn.staticfile.org/supabase/2.45.0/umd/supabase.min.js' },
                ],
                tus: [
                    { name: 'jsDelivr', region: 'global', url: 'https://cdn.jsdelivr.net/npm/tus-js-client@3/dist/tus.min.js' },
                    { name: 'Fastly jsDelivr', region: 'global', url: 'https://fastly.jsdelivr.net/npm/tus-js-client@3/dist/tus.min.js' },
                    { name: 'UNPKG', region: 'us', url: 'https://unpkg.com/tus-js-client@3.1.3/dist/tus.min.js' },
                    { name: 'BootCDN', region: 'cn', url: 'https://cdn.bootcdn.net/ajax/libs/tus-js-client/3.1.3/tus.min.js' },
                ],
                jszip: [
                    { name: 'jsDelivr', region: 'global', url: 'https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js' },
                    { name: 'Fastly jsDelivr', region: 'global', url: 'https://fastly.jsdelivr.net/npm/jszip@3/dist/jszip.min.js' },
                    { name: 'UNPKG', region: 'us', url: 'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js' },
                    { name: 'BootCDN', region: 'cn', url: 'https://cdn.bootcdn.net/ajax/libs/jszip/3.10.1/jszip.min.js' },
                    { name: '七牛云 CDN', region: 'cn', url: 'https://cdn.staticfile.org/jszip/3.10.1/jszip.min.js' },
                ]
            }
        };

        // 节点状态缓存
        this.nodeStatus = new Map();

        // 当前最优节点
        this.currentBestNodes = {
            supabaseApi: null,
            storage: null,
            libs: {}
        };

        // 配置
        this.config = {
            speedTestInterval: 30000,      // 测速间隔（30秒）
            healthCheckInterval: 10000,    // 健康检查间隔（10秒）
            speedTestTimeout: 5000,        // 单次测速超时（5秒）
            maxRetries: 3,                 // 最大重试次数
            switchThreshold: 500,          // 切换阈值（当前节点比最优节点慢500ms以上则切换）
            minSuccessRate: 0.7,           // 最低成功率（低于70%认为节点不可用）
        };

        // 测速历史记录
        this.speedHistory = new Map();

        // 定时器
        this._speedTestTimer = null;
        this._healthCheckTimer = null;

        // 事件回调
        this._onNodeChange = null;
        this._onSpeedUpdate = null;
    }

    /**
     * 初始化 CDN 管理器
     */
    async init() {
        console.log('[CDN Manager] 初始化...');

        // 加载缓存的节点状态
        this._loadCache();

        // 首次测速
        await this.runSpeedTest();

        // 启动定时测速
        this._startSpeedTestLoop();

        // 启动健康检查
        this._startHealthCheck();

        console.log('[CDN Manager] 初始化完成');
        return this;
    }

    /**
     * 运行完整测速
     */
    async runSpeedTest() {
        console.log('[CDN Manager] 开始测速...');
        const results = [];

        // 测试所有库 CDN
        for (const [libName, nodes] of Object.entries(this.cdnNodes.libs)) {
            const libResults = await this._testNodeGroup(libName, nodes);
            results.push(...libResults);

            // 选择最快的可用节点
            const available = libResults.filter(r => r.success);
            if (available.length > 0) {
                available.sort((a, b) => a.latency - b.latency);
                this.currentBestNodes.libs[libName] = available[0].node;
                console.log(`[CDN Manager] ${libName} 最优: ${available[0].node.name} (${available[0].latency}ms)`);
            }
        }

        // 测试 Supabase API 节点
        const apiResults = await this._testNodeGroup('supabaseApi', this.cdnNodes.supabaseApi);
        const availableApi = apiResults.filter(r => r.success);
        if (availableApi.length > 0) {
            availableApi.sort((a, b) => a.latency - b.latency);
            this.currentBestNodes.supabaseApi = availableApi[0].node;
            console.log(`[CDN Manager] Supabase API 最优: ${availableApi[0].node.name} (${availableApi[0].latency}ms)`);
        }

        // 保存缓存
        this._saveCache();

        // 触发更新回调
        if (this._onSpeedUpdate) {
            this._onSpeedUpdate(this.getSpeedTestResults());
        }

        return results;
    }

    /**
     * 测试一组节点
     */
    async _testNodeGroup(groupName, nodes) {
        const results = [];

        // 并行测试所有节点
        const tests = nodes.map(node => this._testNode(groupName, node));
        const testResults = await Promise.allSettled(tests);

        testResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                results.push({
                    group: groupName,
                    node: nodes[index],
                    success: false,
                    latency: Infinity,
                    error: result.reason?.message || 'Unknown error'
                });
            }
        });

        return results;
    }

    /**
     * 测试单个节点的延迟
     */
    async _testNode(groupName, node) {
        const url = this._getTestUrl(groupName, node);
        const startTime = performance.now();

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.config.speedTestTimeout);

            const response = await fetch(url, {
                method: 'HEAD',
                mode: 'cors',
                cache: 'no-store',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const latency = Math.round(performance.now() - startTime);
            const success = response.ok || response.status === 0; // CORS 可能返回 status 0

            // 更新历史记录
            this._updateHistory(groupName, node.name, { success, latency, timestamp: Date.now() });

            return { group: groupName, node, success, latency };
        } catch (error) {
            const latency = Math.round(performance.now() - startTime);

            // 可能是 CORS 限制，尝试用其他方式检测
            if (error.name === 'TypeError' || error.message.includes('CORS')) {
                // 用 img 标签测试（绕过 CORS）
                try {
                    const imgLatency = await this._testWithImage(url);
                    this._updateHistory(groupName, node.name, { success: true, latency: imgLatency, timestamp: Date.now() });
                    return { group: groupName, node, success: true, latency: imgLatency };
                } catch {
                    // 继续往下走
                }
            }

            this._updateHistory(groupName, node.name, { success: false, latency, timestamp: Date.now() });
            return { group: groupName, node, success: false, latency: Infinity, error: error.message };
        }
    }

    /**
     * 使用 Image 测试连接（绕过 CORS）
     */
    _testWithImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const startTime = performance.now();
            const timeout = setTimeout(() => {
                img.src = '';
                reject(new Error('Timeout'));
            }, this.config.speedTestTimeout);

            img.onload = img.onerror = () => {
                clearTimeout(timeout);
                const latency = Math.round(performance.now() - startTime);
                resolve(latency);
            };

            // 添加随机参数防止缓存
            img.src = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
        });
    }

    /**
     * 获取测试 URL
     */
    _getTestUrl(groupName, node) {
        // 对于库 CDN，直接使用 URL
        if (node.url.endsWith('.js')) {
            return node.url;
        }
        // 对于 API 节点，测试健康检查端点
        return node.url + '/rest/v1/';
    }

    /**
     * 更新历史记录
     */
    _updateHistory(groupName, nodeName, record) {
        const key = `${groupName}:${nodeName}`;
        if (!this.speedHistory.has(key)) {
            this.speedHistory.set(key, []);
        }

        const history = this.speedHistory.get(key);
        history.push(record);

        // 只保留最近 20 条记录
        if (history.length > 20) {
            history.shift();
        }
    }

    /**
     * 获取节点成功率和平均延迟
     */
    getNodeStats(groupName, nodeName) {
        const key = `${groupName}:${nodeName}`;
        const history = this.speedHistory.get(key) || [];

        if (history.length === 0) {
            return { successRate: 0, avgLatency: Infinity, samples: 0 };
        }

        const successCount = history.filter(r => r.success).length;
        const successfulLatencies = history.filter(r => r.success).map(r => r.latency);

        return {
            successRate: successCount / history.length,
            avgLatency: successfulLatencies.length > 0
                ? Math.round(successfulLatencies.reduce((a, b) => a + b, 0) / successfulLatencies.length)
                : Infinity,
            samples: history.length
        };
    }

    /**
     * 获取当前最优节点
     */
    getBestNode(groupName) {
        if (groupName === 'supabaseApi') {
            return this.currentBestNodes.supabaseApi;
        }
        if (groupName === 'storage') {
            return this.currentBestNodes.storage;
        }
        return this.currentBestNodes.libs[groupName];
    }

    /**
     * 获取当前最优的库 CDN URL
     */
    getBestLibUrl(libName) {
        const bestNode = this.currentBestNodes.libs[libName];
        if (bestNode) {
            return bestNode.url;
        }
        // 回退到第一个可用的
        const nodes = this.cdnNodes.libs[libName];
        return nodes ? nodes[0].url : null;
    }

    /**
     * 获取当前 Supabase URL
     */
    getSupabaseUrl() {
        const best = this.currentBestNodes.supabaseApi;
        if (best) {
            return best.url;
        }
        return this.cdnNodes.supabaseApi[0].url;
    }

    /**
     * 获取所有测速结果
     */
    getSpeedTestResults() {
        const results = {};

        // 库 CDN 结果
        for (const [libName, nodes] of Object.entries(this.cdnNodes.libs)) {
            results[libName] = nodes.map(node => ({
                ...node,
                ...this.getNodeStats(libName, node.name),
                isBest: this.currentBestNodes.libs[libName]?.name === node.name
            }));
        }

        // API 节点结果
        results.supabaseApi = this.cdnNodes.supabaseApi.map(node => ({
            ...node,
            ...this.getNodeStats('supabaseApi', node.name),
            isBest: this.currentBestNodes.supabaseApi?.name === node.name
        }));

        return results;
    }

    /**
     * 启动定时测速
     */
    _startSpeedTestLoop() {
        if (this._speedTestTimer) {
            clearInterval(this._speedTestTimer);
        }

        this._speedTestTimer = setInterval(() => {
            this.runSpeedTest().catch(err => {
                console.warn('[CDN Manager] 测速出错:', err);
            });
        }, this.config.speedTestInterval);
    }

    /**
     * 启动健康检查
     */
    _startHealthCheck() {
        if (this._healthCheckTimer) {
            clearInterval(this._healthCheckTimer);
        }

        this._healthCheckTimer = setInterval(() => {
            this._checkCurrentNodes();
        }, this.config.healthCheckInterval);
    }

    /**
     * 检查当前节点健康状态
     */
    async _checkCurrentNodes() {
        // 检查当前 Supabase API 节点
        const currentApi = this.currentBestNodes.supabaseApi;
        if (currentApi) {
            try {
                const result = await this._testNode('supabaseApi', currentApi);

                // 如果当前节点变慢了，重新选择
                if (!result.success || result.latency > 2000) {
                    console.log('[CDN Manager] 当前节点响应过慢，重新选择...');
                    await this.runSpeedTest();
                }
            } catch (error) {
                console.warn('[CDN Manager] 健康检查失败:', error);
            }
        }
    }

    /**
     * 手动切换节点
     */
    async switchNode(groupName, nodeName) {
        let targetNode = null;

        if (groupName === 'supabaseApi') {
            targetNode = this.cdnNodes.supabaseApi.find(n => n.name === nodeName);
            if (targetNode) {
                this.currentBestNodes.supabaseApi = targetNode;
            }
        } else if (this.cdnNodes.libs[groupName]) {
            targetNode = this.cdnNodes.libs[groupName].find(n => n.name === nodeName);
            if (targetNode) {
                this.currentBestNodes.libs[groupName] = targetNode;
            }
        }

        if (targetNode && this._onNodeChange) {
            this._onNodeChange(groupName, targetNode);
        }

        this._saveCache();
        return targetNode;
    }

    /**
     * 添加自定义节点
     */
    addCustomNode(groupName, node) {
        if (groupName === 'supabaseApi') {
            this.cdnNodes.supabaseApi.push(node);
        } else if (groupName === 'storage') {
            this.cdnNodes.storage.push(node);
        } else if (this.cdnNodes.libs[groupName]) {
            this.cdnNodes.libs[groupName].push(node);
        }
        this._saveCache();
    }

    /**
     * 设置节点变更回调
     */
    onNodeChange(callback) {
        this._onNodeChange = callback;
    }

    /**
     * 设置测速更新回调
     */
    onSpeedUpdate(callback) {
        this._onSpeedUpdate = callback;
    }

    /**
     * 加载缓存
     */
    _loadCache() {
        try {
            const cached = localStorage.getItem('cdn_manager_cache');
            if (cached) {
                const data = JSON.parse(cached);

                // 恢复最优节点选择
                if (data.bestNodes) {
                    // 验证缓存的节点是否仍然有效
                    if (data.bestNodes.supabaseApi) {
                        const found = this.cdnNodes.supabaseApi.find(n => n.name === data.bestNodes.supabaseApi);
                        if (found) this.currentBestNodes.supabaseApi = found;
                    }

                    if (data.bestNodes.libs) {
                        for (const [libName, nodeName] of Object.entries(data.bestNodes.libs)) {
                            const nodes = this.cdnNodes.libs[libName];
                            if (nodes) {
                                const found = nodes.find(n => n.name === nodeName);
                                if (found) this.currentBestNodes.libs[libName] = found;
                            }
                        }
                    }
                }

                console.log('[CDN Manager] 缓存加载成功');
            }
        } catch (error) {
            console.warn('[CDN Manager] 缓存加载失败:', error);
        }
    }

    /**
     * 保存缓存
     */
    _saveCache() {
        try {
            const data = {
                bestNodes: {
                    supabaseApi: this.currentBestNodes.supabaseApi?.name,
                    libs: {}
                },
                timestamp: Date.now()
            };

            for (const [libName, node] of Object.entries(this.currentBestNodes.libs)) {
                if (node) {
                    data.bestNodes.libs[libName] = node.name;
                }
            }

            localStorage.setItem('cdn_manager_cache', JSON.stringify(data));
        } catch (error) {
            console.warn('[CDN Manager] 缓存保存失败:', error);
        }
    }

    /**
     * 停止所有定时任务
     */
    stop() {
        if (this._speedTestTimer) {
            clearInterval(this._speedTestTimer);
            this._speedTestTimer = null;
        }
        if (this._healthCheckTimer) {
            clearInterval(this._healthCheckTimer);
            this._healthCheckTimer = null;
        }
    }

    /**
     * 生成测速报告
     */
    generateReport() {
        const results = this.getSpeedTestResults();
        let report = '=== CDN 测速报告 ===\n\n';

        for (const [groupName, nodes] of Object.entries(results)) {
            report += `【${groupName}】\n`;
            nodes.forEach(node => {
                const status = node.successRate >= this.config.minSuccessRate ? '✓' : '✗';
                const best = node.isBest ? ' ⭐' : '';
                report += `  ${status} ${node.name} (${node.region}): ${node.avgLatency}ms, 成功率: ${Math.round(node.successRate * 100)}%${best}\n`;
            });
            report += '\n';
        }

        return report;
    }
}

// 创建全局实例
window.cdnManager = new CDNManager();

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CDNManager;
}
