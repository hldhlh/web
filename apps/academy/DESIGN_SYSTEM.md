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
