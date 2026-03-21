# 日志应用 - 实时订阅功能

## 🚀 功能特性

- ✅ **实时同步** - 任何数据库更新立即反映在界面上
- ✅ **智能重试** - 网络问题时自动重连，无需手动刷新
- ✅ **移动端优化** - 针对手机端网络不稳定进行专门优化
- ✅ **状态指示** - 清晰显示连接状态和操作结果
- ✅ **离线友好** - 网络恢复时自动重连实时订阅
- 🆕 **全球CDN优化** - 多源CDN备选，确保全球可访问性

## 📡 实时订阅配置

### 1. Supabase 后台设置

确保在 Supabase 项目中：
- 开启实时订阅功能
- `logs` 表启用 Row Level Security (RLS)
- 匿名用户有适当的读取权限

### 2. SQL 权限设置

```sql
-- 启用实时订阅
ALTER PUBLICATION supabase_realtime ADD TABLE logs;

-- 设置行级安全策略
CREATE POLICY "允许匿名用户读取日志" ON logs
FOR SELECT USING (true);

CREATE POLICY "允许匿名用户插入日志" ON logs
FOR INSERT WITH CHECK (true);

CREATE POLICY "允许匿名用户更新日志" ON logs
FOR UPDATE USING (true);

CREATE POLICY "允许匿名用户删除日志" ON logs
FOR DELETE USING (true);
```

## 🌍 全球CDN优化

### 样式和CDN配置

**样式系统:**
- 使用纯CSS自定义样式 (styles.css)
- 响应式设计支持移动端
- 暗色模式自适应
- 无外部样式库依赖

**Supabase JS CDN备选:**
- cdn.jsdelivr.net (主要)
- unpkg.com (备选) 
- cdnjs.cloudflare.com (备选)
- fastly.jsdelivr.net (全球加速)
- cdn.skypack.dev (现代ESM)

### 智能CDN选择

- **地理优化** - 根据时区自动优化CDN顺序
- **自动切换** - 失败时自动尝试备选CDN
- **快速加载** - 仅加载必需的Supabase库，样式使用本地CSS
- **加载验证** - 确保资源真正可用后才初始化应用

### CDN加载流程

1. **检测地理位置** - 基于时区优化CDN顺序
2. **加载Supabase** - 尝试加载数据库连接库
3. **失败重试** - 单个CDN失败时自动切换
4. **功能验证** - 验证库真正可用
5. **应用初始化** - 资源就绪后启动应用

## 🔧 调试工具

在浏览器控制台中运行以下命令：

```javascript
// 查看实时订阅状态
debugRealtime()

// 检查CDN加载状态
debugCDN()

// 手动重新连接
window.logManager.setupRealtime()

// 检查网络状态
console.log('网络状态:', connectionManager.isOnline)

// 手动初始化应用（如果自动初始化失败）
initializeApp()
```

## 📱 移动端优化

- **心跳间隔**: 30秒（桌面端为默认值）
- **重试策略**: 指数退避，最大30秒间隔
- **连接超时**: 15秒，防止长时间等待
- **网络恢复**: 延迟1秒重连，确保网络稳定

## 🚨 常见问题

### CDN加载问题
1. **页面空白或样式错乱**
   - 运行 `debugCDN()` 检查CDN加载状态
   - 查看控制台是否有CDN加载错误
   - 手动刷新页面重新加载CDN

2. **功能不可用**
   - 检查 `window.supabase` 是否可用
   - 运行 `debugRealtime()` 查看应用状态
   - 如果自动初始化失败，运行 `initializeApp()`

3. **特定地区访问慢**
   - 应用会自动根据地理位置优化CDN顺序
   - 亚洲地区优先使用 bootcdn 和 fastly
   - 欧洲地区优先使用 cdnjs 和 jsdelivr

### 实时同步不工作
1. 检查控制台是否有错误信息
2. 运行 `debugRealtime()` 查看连接状态
3. 确认 Supabase 项目实时订阅权限
4. 检查网络连接状态

### 手机端连接不稳定
- 应用已自动优化移动端参数
- 网络恢复时会自动重连
- 观察右上角状态指示器

### 权限问题
- 确保匿名用户有 logs 表的读写权限
- 检查 RLS 策略是否正确配置

### 网络环境限制
- 如果某些CDN被屏蔽，应用会自动切换到可用源
- 支持多种CDN提供商确保全球可访问
- 移动端网络切换时自动重连

## 📊 状态指示器

- 🟢 **绿色圆点** + "实时同步" = 连接正常
- ⚪ **灰色圆点** + "同步断开" = 连接断开

状态指示器会在页面右上角显示，连接成功后10秒自动隐藏。