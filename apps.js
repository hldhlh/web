export function getAppDirectories() {
  return [
    { name: "节假日日历", path: "calendar/index.html", icon: "calendar/icon.svg", fallback: "日" },
    { name: "待办事项", path: "todo/index.html", icon: "todo/icon.svg", fallback: "办" },
    { name: "图片转换", path: "image-converter/index.html", icon: "image-converter/icon.svg", fallback: "图" },
    { name: "思维矩阵", path: "thought-matrix/index.html", icon: "thought-matrix/icon.svg", fallback: "思" },
    { name: "云盘", path: "cloud/index.html", icon: "cloud/icon.svg", fallback: "云" },
    { name: "吃什么", path: "eatwhat/index.html", icon: "eatwhat/icon.svg", fallback: "食" },
    { name: "今岭笔记", path: "jlbj/index.html", fallback: "笔" },
    { name: "今岭流水可视化", path: "jlksh/index.html", fallback: "流" },
    { name: "今岭后厨订货", path: "jlhcdh/index.html", fallback: "订" },
    { name: "PPT", path: "ppt/index.html", fallback: "P" },
    { name: "阅图", path: "vista/index.html", icon: "vista/icon.svg", fallback: "阅" },
    { name: "SVG", path: "svg/index.html", fallback: "S" },
    { name: "日志", path: "log/index.html", icon: "log/icon.svg", fallback: "志" },
    { name: "蔬菜盘点程序", path: "vegcheck/index.html", fallback: "蔬" },
    { name: "情景故事", path: "course/index.html", icon: "course/icon.svg", fallback: "课" },
    { name: "我的头像", path: "avatar/index.html", fallback: "我" },
    { name: "实时记账", path: "ledger/index.html", icon: "ledger/icon.svg", fallback: "账" },
    { name: "Win32 GUI DIB 预览器", path: "gui-design-demo/index.html", icon: "gui-design-demo/icon.svg", fallback: "GUI" }
  ];
}
