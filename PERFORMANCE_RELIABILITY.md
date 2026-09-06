# 访问速度与保存可靠性

本轮覆盖共享网络与静态缓存、Auto Office（课程、学习进度、排班、问题反馈）和日志保存。未修改权限策略，未提交 Git 或发布生产环境。

## 已实现

- Auto Office 先渲染本机缓存，Supabase Realtime SDK 后台启动；视频上传组件仅选择视频并发布时加载。排班与反馈直接进入也能用缓存账号资料显示内容，SDK 不阻塞页面。
- 同时发生的相同读取合并为一个请求，每个调用者获得独立 Response。不同凭据、取消信号、Range 请求及大文件下载不共用读取。网关探测结果缓存 6 小时，读取和保存延迟可通过 `APP_NETWORK.metrics` 查看（只存本页内存，不上传）。
- Auto Office 多模块共用 Realtime client，子页面内嵌时复用父页面运行时；后台标签页暂停轮询，减少重复读取。
- 保存先通过 IndexedDB 事务落地。成功落地后显示“已存本机”，确认服务器更新后显示“已同步到云端”。离线、刷新、重开页面后继续同步；存储失败不显示保存成功。
- 同一记录连续修改合并，Web Locks 协调同源标签页的同步任务。数据库更新使用主键和 `ts` 条件，响应为空则重读版本；每次操作的 token 用于识别“服务端完成但响应丢失”。独立字段三方合并，同字段冲突保留草稿，用户可比较本机/云端内容再选择。
- 排班按日期、反馈按条目保存；热刷新先读取主键和版本，只下载变化的记录。课程保留单行快照以维持课程、考试、任务关系的一致性。学习进度仍按用户保存。
- 日志操作在发请求前持久化；处理 SDK 返回的 `error`，失败保留队列并重试。新增使用固定 UUID 和 ignore-duplicates，避免响应丢失后重复新增；编辑通过 `updated_at` 检查冲突，连续编辑按顺序提交。
- 日志粘贴图片缩放到最长边不超过 1600px，尝试 WebP 压缩（保留更小的原图及 GIF）。保存时将内联图片放到现有 `cloud-files/logs/images/`，正文只保留链接，图片按需加载；旧日志在重新保存时转换，没有批量修改历史数据。
- 直接访问子应用也会安装离线缓存，页面加载后空闲时缓存已用静态资源；有缓存的页面遇到慢网络时 1.8 秒回退。后端 API、版本清单和原始数据文件不进入静态缓存。
- GitHub Pages 发布前运行自动测试和发布产物检查。

## 存储兼容与发布说明

线上只读检查确认 `academy_progress` 可用，而 `academy_state` 接口返回 404。本轮没有创建新表，复用现有 `academy_progress` 的文本主键，保留 `doc:` 命名空间：

- `doc:academy/schedule.json:YYYY-MM-DD`：当天排班。
- `doc:academy/daily-feedback.json:<反馈 ID>`：一条反馈。
- `doc:academy/content.json:value`：课程内容快照。
- 每个文档的 `$ready` 记录标记首次导入完成。员工进度查询排除 `doc:` 行。

首次保存时读取原 Storage JSON，以 ignore-duplicates 批量导入，完成后写入标记；原文件保留不删除。后续新版客户端以数据库记录为准，不再回写旧 JSON。**发布时应让仍打开旧版的客户端刷新后再编辑；不要将新版和旧版长期混用，也不要在产生新数据后直接回退到只读写旧 JSON 的代码。** 回退前须从新记录导出相应 JSON，否则旧版看不到新版保存的数据。

没有使用生产数据执行写入测试或触发导入。数据库写入、版本竞争、存储上传权限需在正式发布环境继续观察；本轮验证使用模拟后端。清空浏览器网站数据会删除尚未同步的本机队列，关闭页面后需再次打开才会继续同步。

既有 `publish-build-version.mjs` 仍写 `academy_state`；由于该表线上接口当前返回 404，该通知步骤可能失败，页面的 `version.json` 轮询更新仍独立工作。本轮未将版本通知迁到业务记录中。

## 验证

```bash
npm test
npm run build
npm run check
```

自动检查覆盖网络去重、请求对象保留、冲突响应、三方合并、日志失败恢复和静态缓存排除规则；构建逐文件校验发布清单与本地资源引用。

浏览器测试脚本由 Playwright CLI 的 `run-code --filename` 执行，不依赖 Playwright Test。启动 `python3 -m http.server 8765 --directory _site` 后使用独立测试浏览器：

- `tests/reliable-browser.js`：真实 IndexedDB，模拟离线、版本竞争、响应丢失、保存中再次编辑、多页面旧快照编辑以及整页刷新恢复。
- `tests/setup-app-browser.js`：所有 Supabase HTTP 请求拦截为模拟服务，WebSocket 关闭；可在页面验证排班与反馈操作，避免写生产数据。
- `tests/performance-browser.js`：在 setup 后运行；额外需要在 8767 端口提供旧版构建用于对照。

一次受控对照：本地静态服务、同一模拟账号、SDK 人为延迟 3000ms，并禁用 Service Worker。首个内容渲染由约 3031ms 降到 26ms，上传库不再进入首屏请求。这证明首屏已与 SDK 加载解耦，**不是线上访问耗时或固定加速比例的承诺**。线上往返耗时仍取决于实际网络与 Supabase 节点。

条件更新依赖 PostgREST 的过滤更新和返回记录机制：[官方说明](https://docs.postgrest.org/en/v14/references/api/tables_views.html)。
