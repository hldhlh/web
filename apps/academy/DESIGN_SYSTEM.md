# Auto Office 界面设计约定

本项目以 Apple Human Interface Guidelines 为长期设计基线。实现时优先遵循层级、和谐、一致性，以及 Purpose、Agency、Flexibility、Simplicity、Craft、Delight 六项设计原则。

官方参考：

- [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
- [Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- [Color](https://developer.apple.com/design/human-interface-guidelines/color)
- [Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)
- [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Motion](https://developer.apple.com/design/human-interface-guidelines/motion)

## 必须遵守

1. 内容优先。首屏先呈现任务、状态与下一步，不让品牌装饰或大面积控件抢占内容空间。
2. 使用语义色。主操作使用 `--accent`，成功、警告、危险分别使用 `--ok`、`--warn`、`--bad`；颜色不能单独承担信息表达。
3. 使用系统字体栈和 iOS Dynamic Type 默认层级。正文使用 17px，辅助文字不得低于 11px；避免 Light、Thin 等过细字重。
4. 保持清晰层级。标题主要通过字号和字重区分；减少同时使用阴影、描边、渐变和高饱和色。
5. 遵守安全区。顶部栏、底部栏和固定操作区必须包含 `env(safe-area-inset-*)`。
6. 触控目标至少 44×44px。可见图标可以更小，但其按钮热区不能缩小。
7. Liquid Glass 只用于导航和浮动控制层。内容卡片使用标准实体材质，不在内容区域滥用玻璃效果。
8. 底部 Tab Bar 只负责切换顶层区域，不放发布、添加等操作按钮，保持 3–5 个稳定入口。
9. 动效只用于反馈和状态变化，通常控制在 120–240ms；必须支持 `prefers-reduced-motion`。
10. 同时验证浅色、深色、增强对比度、减少透明度和大字体场景。

## 视觉参数

### Graphite / Light 双主题

共用 `appearance.css` 的语义颜色与组件布局；Light 使用浅灰底与白色内容，Graphite 使用石墨底与深灰内容。主题切换只改变外观，不改变功能、信息顺序或权限。

首页快捷访问使用一致的线性 SVG 图标和双列网格，宽屏扩展为四列；待办直接按真实课程、考试和未读消息渲染，第一项强调，其他项降低视觉权重。保留后台首页布局配置，不根据概念图硬编码数据。学习进度圆环仍表示总学习进度，不改称每日进度。

### 通用尺寸

- 页面横向安全边距：手机 16px，宽屏 24px。
- 基础间距：4、8、12、16、24、32px。
- 常规卡片圆角：18px；控件圆角：12–14px；胶囊仅用于状态和筛选。
- 卡片主要依靠背景分组和间距形成层级，阴影保持低对比。
- 主按钮使用系统蓝语义色；破坏性操作使用系统红，并提供明确文字。
- 导航材质采用 regular glass：高模糊、适度不透明，保证文字始终清晰。

## iOS 默认文字层级

- Large Title：34px / Regular，强调时 Bold。
- Title 1：28px / Regular，强调时 Bold。
- Title 2：22px / Regular，强调时 Bold。
- Title 3：20px / Regular，强调时 Semibold。
- Headline：17px / Semibold。
- Body：17px / Regular，强调时 Semibold。
- Callout：16px / Regular。
- Subhead：15px / Regular。
- Footnote：13px / Regular。
- Caption 1：12px / Regular。
- Caption 2：11px / Regular；任何有意义的文字都不得小于此字号。

## 交互检查清单

- 点击后是否立即有可见状态反馈？
- 禁用状态是否说明原因，而不是只变灰？
- 返回、取消、删除等动作的位置和含义是否稳定？
- 键盘焦点是否可见？
- 仅看灰度时，状态是否仍然可以理解？
- 页面旋转或宽度变化后，关键信息是否仍按阅读顺序呈现？

## 用户确认的长期设计要求（2026-11-03）

用户明确要求：Auto Office UI 应现代、简约、符合 Apple Human Interface Guidelines；每次设计与验收都遵循此指导。此条是项目持久指导，不能只在聊天中口头承诺。

### 官方依据与实施解读

本次阅读 HIG 总览及 Layout、Typography、Lists and tables、Buttons、Color、Icons、Materials、Accessibility 官方 Markdown 正文。HIG 是持续更新的规范；涉及新组件时继续查阅对应章节。下面的网页实现选择是本项目约定，不是 Apple 对 Web 的强制像素规范。

- [布局](https://developer.apple.com/design/human-interface-guidelines/layout)：用阅读顺序、对齐、分组和渐进展开表达层级。页面只有一个主标题；同一区域不连续重复“项目资料库 / 资料库”。间距体现内容关系，不为显得简约制造大块无意义留白。
- [列表](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)：文字型目录采用有规律的列表行；照片以预览集合呈现。目录使用熟悉的文件夹图标、完整名称和进入箭头，整行可点击。目录不画成筛选胶囊或一排尺寸各异的操作按钮。
- [按钮](https://developer.apple.com/design/human-interface-guidelines/buttons)：保持少量突出主操作；次要动作使用安静的文字或图标加文字。保留至少 44 CSS px 的 Web 触控区域、按下、悬停、键盘焦点与禁用反馈；不能以缩小热区换取视觉紧凑。
- [字体](https://developer.apple.com/design/human-interface-guidelines/typography)：优先系统字体，正文常规字重，标题适度加重。用字号、字重和语义色建立层次；不要把目录名称、路径、动作全部做成粗体。放大文字时允许行高增长和自然换行。
- [图标](https://developer.apple.com/design/human-interface-guidelines/icons)：使用熟悉含义和统一笔画的矢量图标；不得用“▱”等字形假装文件夹。Web 自绘 SVG 不宣称是原生 SF Symbols。
- [颜色](https://developer.apple.com/design/human-interface-guidelines/color)：基于语义色适配浅色与深色；强调色用于明确交互及重点，主体文字保持中性。当前路径以文字层次表示，不伪装成可点击蓝色按钮。
- [材质](https://developer.apple.com/design/human-interface-guidelines/materials)：内容区域保持清晰实体背景；只有确有导航分层需求时才考虑玻璃效果，不以大量模糊、阴影或渐变代替设计。
- [可访问性](https://developer.apple.com/design/human-interface-guidelines/accessibility)：检查键盘、可访问名称、200% 文字、深浅色、增强对比度及减少动态效果。状态不得只依赖颜色。网页字号响应须实际验证，不把使用系统字体误称为原生 Dynamic Type 支持。

### 发布前视觉检查

用有代表性的真实数量与名称核验，不只看一个空文件夹。至少检查桌面与窄屏、长目录名、三级路径、浅色与深色；截图须等主题和过渡完成。去掉重复同步口号、重复区域标题以及“有文件夹却显示空资料库”的误导提示。复用同一测试页，用完清理临时页面。
