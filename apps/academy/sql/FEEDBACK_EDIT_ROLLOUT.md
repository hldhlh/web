# 每日反馈编辑权限

先发布包含反馈删除操作和写入凭据请求头的 `framework/store.js`，再以数据库管理账号执行 `academy_feedback_edit.sql`（依赖已启用的 `academy_auth.sql` 和 `academy_progress.sql`）。脚本可重复执行。旧页面需刷新后才能修改反馈或处理状态。

数据库触发器校验现有反馈更新的真实登录会话、原提交人及北京时间的提交日期。正文只能由本人当天修改或删除；店长只能另外修改处理状态。原记录 ID、归属、提交时间不可修改，删除通过保留空值标记实现，防止旧设备恢复反馈；禁止物理删除记录和恢复删除标记。其他业务记录不受影响。新增反馈和历史数据导入仍沿用现有流程，本脚本不重构其权限。

本地回归：`node --test tests/feedback-edit.test.mjs tests/feedback-sync.test.mjs tests/store-reads.test.mjs`。

仅发布网页不足以启用数据库权限；必须执行 SQL。脚本未执行前，页面限制不能防止直接请求数据库。

已执行过旧版编辑权限脚本的环境，也需重新执行更新后的 `academy_feedback_edit.sql` 才能启用当天删除。
