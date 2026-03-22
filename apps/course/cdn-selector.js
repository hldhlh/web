/**
 * CDNSelector - 高性能视频传输加速模块
 * - 支持多线程并发探测 (Benchmark)
 * - 静默切换最佳节点 (Silent Fallback)
 * - 支持加速播放相关的传输层优化 (Pre-connect/Warming)
 */
window.CDNSelector = (function () {
    // 待比对的节点列表 - 建议配置多个代理了 Supabase Storage 的域名
    const CDN_ENDPOINTS = [
        "https://fmxddvjgkykuqwmasigo.supabase.co", // 原始 Supabase 节点 (Cloudflare)
        // 在此处添加备选 CDN 节点，例如配置了反代、CDN 加速或边缘函数中转的域名
        // "https://cdn-1.your-domain.com",
        // "https://cdn-2.your-domain.com"
    ];

    const CACHE_KEY = 'best_cdn_node';
    const TEST_FILE = '/storage/v1/object/public/course-media/logo.png'; // 用于连通性与 TTFB 测试的小文件

    let bestNode = localStorage.getItem(CACHE_KEY) || CDN_ENDPOINTS[0];
    let isBenchmarking = false;

    /**
     * 并发探测各节点性能
     * 模拟多线程异步比对逻辑
     */
    async function benchmark() {
        if (CDN_ENDPOINTS.length <= 1 || isBenchmarking) return;
        isBenchmarking = true;

        console.log("[CDNSelector] 正在并发探测全线节点网络性能...");

        try {
            const tasks = CDN_ENDPOINTS.map(async (domain) => {
                const start = performance.now();
                try {
                    // 使用 HEAD 请求最小化流量，检测首字节响应时间 (TTFB)
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5秒强行断开超时节点

                    await fetch(domain + TEST_FILE, {
                        method: 'HEAD',
                        mode: 'no-cors',
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);
                    const latency = performance.now() - start;
                    return { domain, latency, success: true };
                } catch (e) {
                    return { domain, latency: 9999, success: false };
                }
            });

            const results = await Promise.all(tasks);
            const validResults = results.filter(r => r.success).sort((a, b) => a.latency - b.latency);

            if (validResults.length > 0) {
                const topNode = validResults[0];
                const oldBest = bestNode;
                bestNode = topNode.domain;

                // 持久化最优选择
                localStorage.setItem(CACHE_KEY, bestNode);

                if (oldBest !== bestNode) {
                    console.log(`[CDNSelector] 检测到更优路径: ${bestNode} (响应延迟: ${topNode.latency.toFixed(1)}ms)`);
                }

                // 注入预链接头，加速后续视频片段握手
                const preconnect = document.createElement('link');
                preconnect.rel = 'preconnect';
                preconnect.href = bestNode;
                document.head.appendChild(preconnect);
            }
        } catch (e) { }
        isBenchmarking = false;
    }

    /**
     * 核心转换函数：静默修改请求域名
     * @param {string} originalUrl 原始资源地址
     */
    function rewrite(originalUrl) {
        if (!originalUrl || typeof originalUrl !== 'string') return originalUrl;
        if (!originalUrl.startsWith('http')) return originalUrl;

        try {
            const url = new URL(originalUrl);
            // 仅对 Supabase 存储地址进行重写，防止误伤外部 CDN
            if (url.hostname.includes('supabase.co')) {
                return bestNode + url.pathname + url.search;
            }
            return originalUrl;
        } catch (e) {
            return originalUrl;
        }
    }

    /**
     * 资源预热 (Resource Warming)
     * 利用浏览器闲置带宽预热下一课时的边缘缓存
     */
    function warmUp(url) {
        if (!url) return;
        const target = rewrite(url);
        // 使用 HEAD 请求或 Range 请求进行边缘缓存触发
        fetch(target, {
            headers: { 'Range': 'bytes=0-0' }, // 仅请求 1 字节即可触发边缘握手与响应
            mode: 'no-cors'
        }).catch(() => { });
    }

    // 初始化时启动测速
    benchmark();

    return {
        getFastestUrl: rewrite,
        warmUp: warmUp,
        refresh: benchmark,
        get currentBest() { return bestNode; }
    };
})();
