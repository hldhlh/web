# 国内外加速部署

代码侧已经完成站内依赖、本地缓存、离线回退和后端线路选择。生产环境要真正做到国内外都快，需要把同一份静态文件部署到至少两个区域，并通过同一域名的智能 DNS 调度：

1. 国内节点：对象存储静态站点或本地云服务器/CDN。
2. 海外节点：现有 GitHub Pages 可保留，也可使用任一海外边缘静态托管。
3. DNS：大陆解析到国内节点，境外解析到海外节点；两个节点发布同一 Git 提交。
4. 数据接口：为 Supabase 配置具备完整 CORS、WebSocket、Range 请求和上传支持的反向代理，再把代理源加入 `apps/network.js` 的 `ENDPOINTS`。

只部署 GitHub Pages 无法保证中国大陆链路质量；前端 JavaScript 无法在页面 HTML 尚未下载时替代 DNS/CDN 调度。

## 容器部署

```bash
docker build -t web-static .
docker run --rm -p 8080:8080 web-static
```

`deploy/nginx.conf` 已配置压缩、ETag、Service Worker 更新策略，以及长期缓存的站内 vendor 资源。

## 后端代理要求

每个候选源必须完整转发这些路径：`/rest/v1`、`/auth/v1`、`/storage/v1`、`/functions/v1`、`/realtime/v1`。不要把管理密钥放到前端；项目中的匿名密钥仍应配合 Supabase RLS 使用。

`apps/network.js` 会在后台并行探测候选源，将最快线路缓存 6 小时，并对 GET/HEAD 请求在网络错误或 502/503/504 时切换备用线路。写请求不自动重放，以避免重复写入。
