# Supabase Proxy Worker

通过 Cloudflare Workers 代理 Supabase API 请求，解决国内网络访问问题。

## 部署步骤

### 方式一：通过 Cloudflare Dashboard（推荐新手）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages**
3. 点击 **Create Application** → **Create Worker**
4. 给 Worker 起个名字（如 `supabase-proxy`）
5. 点击 **Deploy**
6. 部署后点击 **Edit code**
7. 将 `src/index.js` 的内容粘贴进去
8. 点击 **Save and Deploy**

### 方式二：通过 Wrangler CLI

```bash
# 安装依赖
npm install

# 登录 Cloudflare
npx wrangler login

# 本地开发测试
npm run dev

# 部署到 Cloudflare
npm run deploy
```

## 部署后配置

部署成功后，你会得到一个 Worker URL，格式如：
```
https://supabase-proxy.your-account.workers.dev
```

## 修改前端代码

在 `script.js` 中，将 Supabase URL 替换为你的 Worker URL：

```javascript
// 原来的
const supabaseUrl = 'https://fmxddvjgkykuqwmasigo.supabase.co';

// 改为
const supabaseUrl = 'https://supabase-proxy.your-account.workers.dev';
```

## 注意事项

1. Cloudflare Workers 免费版每天有 10 万次请求限制
2. 如需更高配额，可升级到 Workers Paid（$5/月起）
3. 建议在 `ALLOWED_ORIGINS` 中配置你的实际域名以增强安全性
