# Web 应用导航中心

模拟的Web应用导航中心，包含多个常用应用演示。

## 项目结构233

```
project-root/
├── index.html      ← 首页
├── apps.js         ← 应用配置
└── pages/          ← 应用目录
    ├── mail/
    ├── contacts/
    ├── calendar/
    ├── photos/
    ├── todo/
    ├── cloud/
    ├── settings/
    ├── help/
    └── common/     ← 共享组件
```

## 功能特点

- 响应式设计，适配各种屏幕尺寸
- 支持浅色/深色主题
- 模块化结构，每个应用独立封装
- 共享组件系统

## 添加新应用

1. 在`pages`目录下创建新应用目录
2. 在`apps.js`中添加应用信息:
```js
{id:'app-id',name:'应用名称',path:'app-id/index.html'}
```
3. 引入共享组件

## 技术栈

- HTML5/CSS3 (变量、Flexbox、Grid)
- 原生JavaScript (ES6+)
- 响应式设计
- 主题支持 