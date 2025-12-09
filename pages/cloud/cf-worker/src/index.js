/**
 * Supabase Proxy Worker
 * 用于代理 Supabase API 请求，解决国内网络访问问题
 */

// 允许的源（CORS）- 生产环境请修改为你的域名
const ALLOWED_ORIGINS = [
    'http://localhost',
    'http://127.0.0.1',
    'https://your-domain.com', // TODO: 替换为你的实际域名
];

// Supabase 配置
const SUPABASE_URL = 'https://fmxddvjgkykuqwmasigo.supabase.co';

/**
 * 处理 CORS 预检请求
 */
function handleOptions(request) {
    const origin = request.headers.get('Origin') || '*';

    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info, x-upsert, upload-offset, upload-length, tus-resumable, upload-metadata',
            'Access-Control-Expose-Headers': 'upload-offset, upload-length, tus-resumable, location',
            'Access-Control-Max-Age': '86400',
        },
    });
}

/**
 * 添加 CORS 响应头
 */
function addCorsHeaders(response, origin) {
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', origin || '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, x-client-info, x-upsert, upload-offset, upload-length, tus-resumable, upload-metadata');
    newHeaders.set('Access-Control-Expose-Headers', 'upload-offset, upload-length, tus-resumable, location');

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });
}

/**
 * 主处理函数
 */
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin');

        // 处理 CORS 预检请求
        if (request.method === 'OPTIONS') {
            return handleOptions(request);
        }

        // 健康检查端点
        if (url.pathname === '/health' || url.pathname === '/') {
            return new Response(JSON.stringify({
                status: 'ok',
                message: 'Supabase Proxy is running',
                timestamp: new Date().toISOString()
            }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': origin || '*'
                },
            });
        }

        // 构建目标 URL
        // 请求格式: /rest/v1/... -> https://xxx.supabase.co/rest/v1/...
        // 请求格式: /storage/v1/... -> https://xxx.supabase.co/storage/v1/...
        // 请求格式: /auth/v1/... -> https://xxx.supabase.co/auth/v1/...
        const targetUrl = SUPABASE_URL + url.pathname + url.search;

        // 复制请求头
        const headers = new Headers(request.headers);

        // 移除可能导致问题的头
        headers.delete('host');
        headers.delete('cf-connecting-ip');
        headers.delete('cf-ipcountry');
        headers.delete('cf-ray');
        headers.delete('cf-visitor');

        try {
            // 转发请求到 Supabase
            const response = await fetch(targetUrl, {
                method: request.method,
                headers: headers,
                body: request.body,
                // 对于 Tus 上传，需要保持 duplex
                duplex: request.body ? 'half' : undefined,
            });

            // 添加 CORS 头并返回响应
            return addCorsHeaders(response, origin);

        } catch (error) {
            // 错误处理
            return new Response(JSON.stringify({
                error: 'Proxy error',
                message: error.message,
                timestamp: new Date().toISOString()
            }), {
                status: 502,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': origin || '*'
                },
            });
        }
    },
};
