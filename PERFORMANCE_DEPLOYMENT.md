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

`deploy/nginx.conf` 已配置压缩、ETag 和 Service Worker 更新策略。HTML、未带版本号的脚本及样式通过 `no-cache` 重新验证（可用 304 复用正文）；不能对未带版本号的 vendor 文件设置一年 immutable，否则升级可能长期不生效。`version.json` 必须重新验证，`sw.js` 禁止 HTTP 缓存。

## 发布范围

GitHub Pages 和 Docker 均只发布 `_site/`。`deploy/public-files.json` 是逐文件白名单；新增页面、图片或脚本时，需将需要公开的文件加入清单，再运行 `node scripts/build-site.mjs`。构建会清空旧产物，校验清单文件存在且不是符号链接，并生成 `version.json` 和页面更新版本。

SQL、文档、测试、依赖清单、开发脚本、原始流水数据，以及 `apps/academy/pages/jlhcdh/add_frontdesk_products.html`、`apps/academy/pages/jlhcdh/update_tags.html` 两个维护页面不发布。维护页面仍保留在仓库，必要时通过本地开发服务使用。构建脚本不会扫描目录自动公开新文件。

已删除未被页面引用的旧版 Supabase、拼音、XLSX 副本，以及旧流水 XLS/CSV 和三个硬编码 Windows 路径的分析脚本。页面继续使用 `apps/vendor/` 内的共享依赖。Git 历史不受此清理影响。

## 后端代理要求

每个候选源必须完整转发这些路径：`/rest/v1`、`/auth/v1`、`/storage/v1`、`/functions/v1`、`/realtime/v1`。不要把管理密钥放到前端；项目中的匿名密钥仍应配合 Supabase RLS 使用。

`apps/network.js` 持久化候选线路的延迟排名，只恢复代码配置中的可信地址和当前站点曾验证可用的网关。过期排名仍可用于启动；每次页面加载在空闲时后台探测并重新排序，恢复联网和 Network Information API 的连接变化事件也触发复测。业务请求始终不等待测速。

GET/HEAD 立即使用已有排名，线路明确失败时立即尝试下一条，超过 320ms 尚未响应时启动备用线路；首个有效响应胜出后取消其余传输。近期失败的线路降到队尾但仍保留兜底，切换网络清除旧的失败冷却。只合并同时发出的相同读取，不缓存业务响应。普通写入仍只发送一次，只有调用者明确标记的幂等写入支持串行回退；Realtime WebSocket 保持原有连接方式。

Service Worker 对带发布版本号的 JS/CSS 使用本地缓存，对页面和未带版本号的 JS/CSS 优先重新验证；弱网有缓存时 600ms 后返回缓存，后台请求继续完成更新。所有后端 API、版本清单、Range 请求和写入绕过静态缓存。Auto 原有版本广播和轮询频率保持不变。

目前仓库只配置了 Supabase 原始地址，未配置实际国内代理。线路排名不能凭空产生 CDN 节点，也无法加速尚未下载的首屏 HTML。要验收国内所有运营商，需要部署并配置真实国内静态 CDN、支持实时连接的后端代理，再分别使用电信、联通、移动、广电和切网场景测量首次访问、重复访问、接口延迟及实时更新延迟。仓库模拟测试不代表这些网络的实测结果。
