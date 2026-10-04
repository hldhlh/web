# Auto Office MCP 维护约定

修改本目录前阅读 README.md；接口变更必须同步文档和测试。

- `index.mjs` 只处理配置与传输，`server.mjs` 定义业务工具，`backend.mjs` 管理认证和数据契约。
- 新工具使用统一 `tool()` 注册流程，保持严格 schema、明确 description、准确副作用 annotations。不得绕过店长会话校验。
- 代码注释应解释权限边界、版本冲突、幂等和兼容性原因，不只复述代码。
- 写操作必须保留未知字段，采用 CAS，处理网络结果不确定；不自动重试非幂等写操作。
- 不添加任意 SQL、任意 URL、任意表操作工具；不得输出账号密码、会话令牌或原始网络错误。
- 修改存储格式时核对 `apps/academy/framework/store.js` 与 `reliable-store.js`，确保网页和 MCP 互相兼容。
- 所有 stdio 诊断只写 stderr，本目录不得加入静态站点 public-files 白名单。
- 使用隔离后端与 MCP Client 验证协议；自动测试不得发布线上通知。
