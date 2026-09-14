# 尺寸标注 · Auto Office

从桌面「尺寸标注器 / 尺刻」移植，保留尺寸线、四点矩形、圆形、节点调整、缩放和 PNG 导出。桌面源项目未修改。

在 Auto Office 的「快捷访问 → 尺寸标注」进入；员工快捷权限沿用 `AcademyAuth`。直接打开子页面会跳转主程序登录。新建图片即创建团队共享项目；「复制链接」生成带项目 ID 的 Auto Office 链接。每张图片和每条标注展示制作员工、最近修改员工。不同员工可编辑同一项目。

## 存储与订阅

- 复用主程序 `ACADEMY_CONFIG` 的 `academy_progress` 表和 `cloud-files` Storage，无需新增表、SQL 迁移或额外账号。
- 项目行主键为 `doc:dimensions:<UUID>`，不会混入学习进度；`payload.meta` 保存名称、图片路径、员工和时间，`payload.annotations` 按 UUID 保存标注及删除墓碑。
- 原始图片保存为 `academy/dimensions/<UUID>/original.<ext>`。上传限制 15 MB、2400 万像素。新图片始终建立新项目，避免替换团队正在标注的底图。
- 项目内使用 `postgres_changes`，按精确主键过滤。相同项目使用相同 Presence 主题显示在线员工。目录使用 Broadcast 通知新项目，30 秒兜底刷新；列表每页 100 条，只查询 metadata，不下载全部标注或图片。
- 拖动结束才保存，输入延迟 450 ms 合并发送。保存用 `PATCH ... user_id=eq.<id>&ts=eq.<base>` 做原子版本校验；版本严格递增，服务端返回空行则重新读取合并。
- 不同标注自动合并。同一条标注的编辑/删除冲突保留本机内容，允许选择团队版本或将本机内容另存为新标注。复制时保留 `copiedFrom`，制作人记为当前员工。
- 操作队列按员工和项目写入本机 localStorage，刷新后重新打开项目会恢复；不会自动放弃未确认写入。网络恢复、重新订阅和前台切换会补拉。连接失败每 5 秒兜底读取；无修改时不写数据库。
- 上传成功但创建项目响应不确定时先读取核验，避免错误清理已被项目引用的图片；无法确认时显示状态，需刷新目录检查。未引用的上传对象可能需要后续清理。

## 权限边界

本次沿用 Auto Office 的自建员工登录和现有数据库权限，没有改动线上 RLS。仓库中现有 `academy_progress` 策略允许 anon 访问，员工登录不是 Supabase Auth JWT；因此快捷权限和制作人字段属于应用层约束，**不构成数据库级身份验证、不可篡改审计或跨团队隔离**。项目链接也不是私密授权凭证。需要服务端隔离时，应统一升级 Auto Office 身份体系，以 Supabase Auth/受信服务签发身份，再用成员关系 RLS 同时约束数据库、Storage 和 Realtime，不能仅给本子程序增加前端检查。

## 验证

```sh
npm test
npm run build
npm run check
```

`tests/dimensions-sync.test.mjs` 检查并发合并、冲突复制、删除墓碑、离线恢复、保存响应丢失、保存中继续输入、乱序事件和存储不足。

`tests/dimensions-browser.js` 通过 Playwright CLI `run-code` 执行。先在仓库启动 `python3 -m http.server 8775 --bind 127.0.0.1`。测试使用两个员工窗口、模拟数据库/Storage/Realtime；所有外部请求被拦截，不写生产数据。截图和 PNG 导出写入 `output/playwright/`。

现有线上表通过只读 REST 查询确认可访问；真实 WebSocket 过滤订阅返回 `SUBSCRIBED`（零写入）；生产 Storage 写入及跨设备真实 WebSocket 写入链路需部署后用真实员工验证，模拟测试不能替代该项验收。

参考：[Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)、[Realtime 授权](https://supabase.com/docs/guides/realtime/authorization)、[Storage 权限](https://supabase.com/docs/guides/storage/security/access-control)。
