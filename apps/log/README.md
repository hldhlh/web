# 日志应用

一个纯静态的日志页面，直接通过 Supabase JS CDN 访问 `public.logs`，支持新增、编辑、删除、缓存和 Realtime 同步。

## 当前架构

- 入口文件：`index.html`
- 主逻辑：`script.js`
- 样式：`styles.css`
- 数据库：Supabase `public.logs`
- 运行方式：静态文件托管即可，不需要构建步骤
- 访问策略：性能优先，暂时不启用 RLS，不使用 `user_id`
- 初始化策略：先启动本地 UI 和缓存渲染；HTML 解析阶段直接预取首屏，SDK、Realtime 和待同步操作在后台并行启动
- 首屏策略：列表数据与精确总数拆成两个请求，总数统计不阻塞内容显示
- 网络策略：复用 `apps/network.js` 的最优节点记忆、连接预热、只读容灾和超时重试

## 数据表

当前应用只依赖 `public.logs`：

```sql
id uuid primary key default gen_random_uuid(),
content text not null,
created_at timestamptz default now(),
updated_at timestamptz default now()
```

数据库中已有 `update_logs_updated_at` 触发器，会在更新时自动维护 `updated_at`。

## Supabase 配置

Realtime 需要把 `logs` 加入 publication：

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.logs;
```

当前选择是最高性能匿名访问，因此不启用 RLS，也不按用户隔离数据。对应代价是：任何拿到 anon key 且能访问 API 的客户端，都可以按数据库授权读取或修改 `logs`。这是当前产品取舍，不是疏漏。

如果后续要改成私有日志，再启用 RLS、添加 Auth 和 `user_id`，并为 `SELECT/INSERT/UPDATE/DELETE` 分别设计 policy。

## 本地开发

直接打开 `index.html` 可以运行。也可以在项目目录启动静态服务：

```bash
python3 -m http.server 8000
```

然后访问：

```text
http://localhost:8000/apps/log/
```

## 测试

测试不连接真实 Supabase，不读取或写入生产数据。测试通过 Node 的 `vm` 加载 `script.js`，用 mock DOM 和 mock Supabase client 验证主要调用链。

```bash
cd apps/log
npm test
```

语法检查：

```bash
npm run check
```

## 已知技术债

- 当前为性能优先：保存、删除会先更新本地 UI，再后台同步数据库；如果数据库脚本未加载或网络离线，操作会保存在 `localStorage` 的待同步队列里。
- `content` 当前存 HTML，渲染时会插入 DOM；如果允许不可信写入，需要增加 HTML allowlist 清理。
- 粘贴图片会以内联 base64 写进 `content`，大图片会拖慢首屏读取、Realtime payload 和 localStorage 缓存。后续更适合迁到 Supabase Storage。
- 列表已按 20 条分页并只传 800 字符预览；数据量很大时仍建议给 `created_at desc` 增加索引。
