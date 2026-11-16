# Auto Office UI

`ui/` 是可整体复制的界面资源目录。将整个目录复制到其他项目后，引入 `ui/core.css` 即可使用独立的基础组件；组件不依赖 Auto Office 页面的 DOM、脚本或目录外资源。请保留 `assets/`，其中包含按钮纹理及字体和许可证。

```html
<link rel="stylesheet" href="ui/core.css">
<button class="ao-icon-button" aria-label="返回">…</button>
<div class="ao-control">…</div>
<button class="ao-primary">继续</button>
<section class="ao-card">…</section>
<div class="ao-divider">…</div>
```

在根元素设置 `data-theme="dark"` 启用深色主题；移除该属性使用浅色主题。`--ao-*` 自定义属性可用于调整主题。基础组件包含键盘焦点、较高对比度和减少透明度的适配。

`appearance.css`、`app-layout.css` 和 `subprograms/` 为现有 Auto Office 页面兼容层和页面布局，依赖各自页面结构；新项目使用基础组件时无需引入。新增通用视觉组件应放在 `core.css`，资源路径必须保持在本目录内。

图标按钮有三个语义层级：默认 `ao-icon-button` 用于返回等主导航；加 `ao-icon-button--page` 用于进入页面板块；加 `ao-icon-button--auxiliary` 用于编辑等辅助操作。三种层级使用一致的图标与 44px 触控区域，并以玻璃边缘、高光和投影厚度区分，同一组同级入口应使用相同层级。

输入及日期等控件同样使用 `ao-control`，可添加 `ao-control--page` 或 `ao-control--auxiliary` 选择对应厚度，默认是主层级。

搜索等输入区域可使用 `ao-control ao-control--inset`，呈现内凹玻璃效果。

玻璃控件共用本地细颗粒纹理；增强对比度或减少透明度时自动隐藏纹理。

顶部玻璃工具栏可使用 `ao-toolbar`，统一柔和的下缘圆角。


进度环通过半透明表面与 backdrop-filter 采样其背后的实际内容；背景越有变化，透光差异越明显。组件无需复制或计算页面背景；减少透明度时回退为实体表面。

进度圆片使用 `ao-progress-disc`，可通过 `--ao-progress-size` 调整尺寸；容器设置 `role="progressbar"`、`aria-valuemin`、`aria-valuemax`、`aria-valuenow` 和可访问名称，内部用 SVG 的 `ao-progress-disc__track` 和 `ao-progress-disc__value` 绘制轨道与进度线（设置 `pathLength="100"` 和相应的 `stroke-dasharray`），并用 `span` 显示百分比。组件采用透明背景、浅色轨道与蓝色进度线。

提示组件使用 `ao-notice`，内部以 `ao-notice__icon`、`ao-notice__content`、`ao-notice__label` 和 `ao-notice__body` 组织图标、标题和正文，支持浅色和深色主题。

`ao-popover` 用于定位在触发元素附近的浮层；调用方负责位置、关闭和焦点行为。可使用 `ao-popover__close` 作为关闭按钮。

次要按钮使用 `ao-button`，文字操作附加 `ao-button--quiet`，删除等操作附加 `ao-button--danger`；原生对话框可使用 `ao-dialog`。
