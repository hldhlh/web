# Auto Office MCP（v1）

让 AI 直接查询和编辑 Auto Office，无需逐步点击浏览器。当前提供通知读写、成员查询以及课程/考试/课程分组/任务阶段摘要查询。

## 运行与接入

需要 Node.js 22+，在仓库根目录执行 `npm ci`。此目录是服务端工具，**不在 GitHub Pages 的发布白名单内**。GitHub Pages 只托管静态文件，不能运行 MCP 进程。

本版使用官方 MCP SDK 的 **stdio** 传输，由 AI 客户端启动本机 Node 进程，不监听公网 TCP 端口。远端云 AI 不能直接连接这个本机 stdio 服务；需要 HTTP/OAuth 部署时应另建经过认证的服务端入口。

通用 MCP 客户端配置（替换绝对路径；环境变量由客户端安全配置注入）：

```json
{
  "mcpServers": {
    "auto-office": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/web/tools/auto-office-mcp/index.mjs"],
      "env": {
        "AUTO_OFFICE_SUPABASE_URL": "https://YOUR_PROJECT.supabase.co",
        "AUTO_OFFICE_SUPABASE_ANON_KEY": "YOUR_PUBLISHABLE_OR_ANON_KEY",
        "AUTO_OFFICE_NAME": "店长姓名",
        "AUTO_OFFICE_PASSWORD": "在客户端本机配置中填写，不提交仓库"
      }
    }
  }
}
```

项目 URL 与公开 key 对应 `apps/academy/index.html` 中 `ACADEMY_CONFIG.url/key`；不要使用 service-role、管理 API token 或数据库密码。配置后重启或重新连接客户端，先读取 `auto-office://guide`，再调用 `office_status` 验证。

环境变量：

| 变量 | 含义 |
| --- | --- |
| `AUTO_OFFICE_SUPABASE_URL` | HTTPS 项目根地址，不可带路径、查询参数或 URL 凭据 |
| `AUTO_OFFICE_SUPABASE_ANON_KEY` | 公开 anon / publishable key |
| `AUTO_OFFICE_NAME` / `AUTO_OFFICE_PASSWORD` | 现有店长账号；不作为工具参数提供给 AI |
| `AUTO_OFFICE_USER_ID` / `AUTO_OFFICE_SESSION_TOKEN` | 可选：由用户自行安全注入的现有会话；优先于账号密码 |
| `AUTO_OFFICE_READ_ONLY` | `true` 禁止全部写工具；默认可按账号权限写入 |

也可在已配置环境变量的终端运行 `npm run mcp:auto` 作本机调试。客户端请直接运行 `node`，避免 npm 的启动输出干扰 stdio。不要把密码写入 shell 历史。环境变量由宿主注入，程序不会自动读取 `.env`、浏览器存储或密码管理器。

**现有登录采用单终端会话。** 第一次数据调用才登录，可能使同账号网页退出；其他终端重新登录后，MCP 返回 `SESSION_REPLACED`，不会自动重登抢占。需要继续时由用户明确重启服务，或者为 AI 使用现有制度允许的独立店长账号。接口不创建账号、不授予新权限。

## 工具契约

| 工具 | 输入 | 行为 |
| --- | --- | --- |
| `office_status` | `{}` | 验证会话，返回账号基本信息与只读状态 |
| `office_people_list` | `{}` | 成员 ID、姓名、角色、状态；供选择接收人 |
| `office_notices_list` | `query?`, `offset?`, `limit?` | 搜索标题/正文，按发布时间倒序，返回文档版本 |
| `office_notice_get` | `id` | 获取完整通知与版本 |
| `office_notice_create` | `requestId`, `title`, `detail`, 其他字段可选 | 发布新通知，默认全体成员、一般、铃铛提醒 |
| `office_notice_update` | `id`, `expectedVersion`, `changes` | 只修改指定字段，不改变发布时间 |
| `office_catalog_list` | `kind`, `offset?`, `limit?` | `lessons/exams/courseGroups/tasks` 摘要，不输出考试答案 |

通知可写字段：`title` 标题、`detail` 纯文本正文、`kicker` 标签（默认运营通知）、`tone`（`info` 一般 / `urgent` 重要）、`notify` 是否显示铃铛、`audience` 接收范围。

`audience` 示例：`{"mode":"all","userIds":[]}`。mode 可选 `all/staff/manager/selected`。指定成员时 userIds 必须非空且来自有效成员列表；其他范围必须为空。暂不提供岗位组合范围的写入，但更新其他字段时会完整保留网页原有范围。

推荐操作顺序：

1. `office_notices_list` 搜索通知，然后 `office_notice_get` 核对目标。
2. 整理简洁内容，例如 `【五香肉卷｜售完停售】\n...`。
3. 用 get 返回的 `version` 作为 `expectedVersion`，只提交需要改变的字段。
4. 遇到 `CONFLICT` 重新读取，检查他人修改后再决定新操作，不能盲目覆盖。
5. 创建时先生成 UUID 作为 `requestId`，网络异常后必须复用该 UUID。相同 UUID 与相同内容返回原通知；不同内容返回 `IDEMPOTENCY_CONFLICT`。

调用示例：

```json
{
  "id": "notice-实际ID",
  "expectedVersion": 1791087427657,
  "changes": {
    "title": "五香肉卷停售及牛肉丸更换通知",
    "detail": "【五香肉卷｜售完停售】\n库存售完后下架，恢复销售时间另行通知。\n\n【旧牛肉丸｜售完更换】\n库存售完后下架，后续统一使用Q弹牛筋丸，售卖名称仍为“牛肉丸”。"
  }
}
```

返回结构通过 `structuredContent` 和 JSON 文本提供。业务失败 `isError: true`，包含 `code/message`；参数 schema 校验错误由 SDK 返回。不会将后端原始响应、密码、令牌返回给 AI。

## 数据与权限边界

- 每次数据调用通过现有 `academy_auth` RPC 验证会话和店长角色。MCP 工具集目前不支持普通员工调用。
- 使用现有 `academy_progress` 表的 `doc:academy/content.json:value` 行，以及 `$ready` 迁移标记。缺少标记时返回 `NOT_READY`，不自动迁移旧 Storage 文件。
- `payload.value` 是 `{rev,data}`（兼容旧平铺结构），`ts` 是文档级 CAS 版本。修改复制完整文档，只替换目标通知，保留课程、考试、未知字段及其他通知。
- 更新请求带 `user_id=eq...&ts=eq...`，数据库原子比较版本；空返回判为冲突，不自动重试写请求。这样与网页 `reliable-store.js` 的保存方式兼容。
- 更新行会触发现有 Postgres Realtime；网页也会继续按既有轮询策略拉取。编辑中的网页保持现有冲突处理，不强制刷新编辑表单。
- 本版未修改数据库 RLS。MCP 的角色校验是本地进程内的应用控制，**不是数据库权限加固**；持有公开 key 的其他程序仍受现有数据库策略约束。若需面对不可信网络客户端，必须先将会话验证、角色判断和 CAS 写入放到同一服务端事务/RPC，并配置审计与远端授权，不能直接把本进程转发到公网。
- 本版没有删除、任意 SQL、任意表、任意文件读写、权限管理或密码修改工具。业务内容作为不可信数据处理，不能当作给 AI 的指令。
- 启动和协议验证可以离线完成；真实账号操作需要配置凭据。自动测试全部使用隔离假后端，不创建线上测试通知。

## 后续扩展规范

代码分为三层：

| 文件 | 职责 |
| --- | --- |
| `index.mjs` | 本机配置与 stdio 生命周期；stdout 仅协议消息 |
| `server.mjs` | 工具命名、严格 Zod schema、说明、权限入口、业务字段与结果 |
| `backend.mjs` | HTTPS、认证、数据格式和 CAS；绝不暴露原始凭据异常 |

新增工具时：先定义具体业务操作，明确读取范围与副作用，再写 schema、说明和注释。通过统一 `tool()` 注册，不能绕过 `authorize()`。写接口必须考虑幂等、并发、网络结果不确定和旧字段兼容。需要改变数据库契约时，同时检查 `apps/academy/framework/store.js`、`reliable-store.js` 和网页调用方。不要为方便 AI 开放原始 SQL 或整份内容覆盖入口。

每次契约变化同步维护这份文档、`auto-office://guide`、工具 description 和 `tests/auto-office-mcp.test.mjs`。破坏兼容时升级 MCP 服务版本并说明迁移办法。

验证命令：

```sh
node --test tests/auto-office-mcp.test.mjs
npm test
npm run build
npm run check
```

参考：[MCP 服务端开发](https://modelcontextprotocol.io/docs/develop/build-server)、[Supabase RPC](https://supabase.com/docs/reference/javascript/rpc)。依赖使用精确版本并提交 lockfile。
