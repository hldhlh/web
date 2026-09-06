# 国内外加速部署

代码侧已经完成站内依赖、本地缓存、离线回退和后端线路选择。生产环境要真正做到国内外都快，需要把同一份静态文件部署到至少两个区域，并通过同一域名的智能 DNS 调度：

1. 国内节点：对象存储静态站点或本地云服务器/CDN。
2. 海外节点：现有 GitHub Pages 可保留，也可使用任一海外边缘静态托管。
3. DNS：大陆解析到国内节点，境外解析到海外节点；两个节点发布同一 Git 提交。
4. 数据接口：为 Supabase 配置具备完整 CORS、WebSocket、Range 请求和上传支持的反向代理，再把代理源加入 `apps/network.js` 的 `ENDPOINTS`。

只部署 GitHub Pages 无法保证中国大陆链路质量；前端 JavaScript 无法在页面 HTML 尚未下载时替代 DNS/CDN 调度。

## 容器部署

先生成发布产物，再构建容器（本机需要 Node.js 和 Git）：

```bash
node scripts/build-site.mjs
docker build -t web-static .
docker run --rm -p 8080:8080 web-static
```

`deploy/nginx.conf` 已配置压缩、ETag、Service Worker 更新策略，以及长期缓存的站内 vendor 资源。

## 发布范围

GitHub Pages 和 Docker 均只发布 `_site/`。`deploy/public-files.json` 是逐文件白名单；新增页面、图片或脚本时，需将需要公开的文件加入清单，再运行 `node scripts/build-site.mjs`。构建会清空旧产物，校验清单文件存在且不是符号链接，并生成 `version.json` 和页面更新版本。

SQL、文档、测试、依赖清单、开发脚本、原始流水数据，以及 `apps/jlhcdh/add_frontdesk_products.html`、`apps/jlhcdh/update_tags.html` 两个维护页面不发布。维护页面仍保留在仓库，必要时通过本地开发服务使用。构建脚本不会扫描目录自动公开新文件。

已删除未被页面引用的旧版 Supabase、拼音、XLSX 副本，以及旧流水 XLS/CSV 和三个硬编码 Windows 路径的分析脚本。页面继续使用 `apps/vendor/` 内的共享依赖。Git 历史不受此清理影响。

## 后端代理要求

每个候选源必须完整转发这些路径：`/rest/v1`、`/auth/v1`、`/storage/v1`、`/functions/v1`、`/realtime/v1`。不要把管理密钥放到前端；项目中的匿名密钥仍应配合 Supabase RLS 使用。

`apps/network.js` 会在后台并行探测候选源，将最快线路缓存 6 小时，并对 GET/HEAD 请求在网络错误或 502/503/504 时切换备用线路。写请求不自动重放，以避免重复写入。
