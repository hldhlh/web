# Auto Office 网络与同步

此目录集中主程序和子程序共用的认证与数据连接层：

- `store.js`：数据读取、写入、网络恢复、Realtime 连接与轮询。
- `reliable-store.js`：本地缓存、离线写入队列、合并及冲突处理。
- `secure-auth.js`：服务端认证请求和会话验证。
- `auth.js`：Auto Office 用户、会话与访问权限。
- `save-status.js`：可靠同步状态与界面通知的桥接。
- `subprogram-bootstrap.js`：排班和反馈共用的运行时继承、依赖加载与错误处理。

底层 HTTP 传输使用仓库共用的 `apps/network.js`，Supabase 客户端使用 `apps/vendor/supabase.min.js`；这两项也被其他应用使用，未复制到本目录。复制此目录到其他项目时，需要提供兼容的 `APP_NETWORK`、Supabase 客户端和目标项目配置，或调整这些依赖。本目录不是一个无依赖的独立 SDK。

主程序按传输层、可靠存储、数据存储、服务端认证、用户认证的顺序加载。排班和反馈嵌入主程序时复用父页面运行时；独立打开时按相同顺序加载。同步状态桥接在页面功能脚本之后加载。`framework/stable-view.js` 是页面渲染工具，不属于网络层。

业务专属的数据结构和操作仍由对应业务模块负责，例如订货购物车同步和课程进度；网络层不绕过现有权限、并发检查或离线队列。变更文件路径时必须同步维护预加载清单、Service Worker 和部署清单。
