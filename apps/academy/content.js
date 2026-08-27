window.ACADEMY_CONTENT = {
  tracks: [
    { id: "onboard", title: "岗前必修", hint: "开门前必须过的线", urgent: true },
    { id: "html", title: "HTML 动手学", hint: "看、玩、考，一次学会结构" },
    { id: "tools", title: "门户效率", hint: "把火锅店工具用到手上" }
  ],

  lessons: [
    {
      id: "a-day",
      type: "article",
      track: "onboard",
      title: "火锅店一日",
      minutes: 4,
      summary: "按店内 SOP：前厅开早、后厨开市、开晚市、闭店。数字来自笔记，不要凭感觉改。",
      blocks: [
        { type: "lead", text: "开市不是「感觉准备好了」。电源、茶水、小料、汤锅都按条做完，才能迎客。" },
        { type: "figure", kind: "day-flow" },
        { type: "h", text: "前厅开早（笔记 SOP）" },
        { type: "ol", items: ["打开所有电源（除门牌灯）", "开启电脑、手机、POS 并登录", "开饮料展示柜灯", "煮饭，确认按了开始", "准备茶水：工作日至少 3 壶，节假日约 5 壶", "出餐台两条蓝色毛巾（打湿）", "擦桌椅餐架，桌面摆好餐具和纸巾", "门口点蚊香", "调料区备满，检查瓶装调料", "外卖调料：辣椒酱 ×10、沙茶酱 ×50", "扫地拖地，对齐桌椅", "与后厨沟通沽清，检查设备下单正常"] },
        { type: "h", text: "后厨开市（笔记 SOP）" },
        { type: "ol", items: ["开所有电源（除空调和门头灯）", "开汤锅：碎肉和骨头入锅，放 200 克南姜", "加前厅和厨房所用小料", "泡凉菜：干云丝 500 克、木耳 1 包，热水泡", "开油锅炸土豆，按 SOP 熬煮牛腩饭", "备外卖物料（淀粉水 1:2、牛杂系列补齐）", "调汤后必尝；萝卜烫三分钟捞起；牛肉丸清水烫到飘起即捞"] },
        { type: "h", text: "开晚市与闭店" },
        { type: "ul", items: ["晚市：广告牌和凳子放出，室外点两盘蚊香；蒸饭；备外卖沙茶酱 30、辣椒酱 5；摆台扫地拖地；茶水 8 壶；检查漏勺和打包袋", "闭店：收桌收水壶；收小料；收广告牌和凳子；检查易买买够不够第二天用"] },
        { type: "callout", tone: "key", title: "一句话", text: "电源、茶水、小料、汤锅四件到位再开台。茶水工作日 3 壶，节假日 5 壶，晚市 8 壶。" }
      ]
    },
    {
      id: "a-product",
      type: "article",
      track: "onboard",
      title: "锅底与出品克数",
      minutes: 4,
      summary: "锅底和装盘克数以笔记配方为准。客诉先处理感受，再处理问题。",
      blocks: [
        { type: "lead", text: "锅底按克数，菜品按盘型。改手感就是改味道。" },
        { type: "h", text: "麻辣锅（笔记配方）" },
        { type: "ul", items: ["水 3000 g", "花椒 0.5 g", "辣椒 5 g", "大葱 20 g", "小葱 5 g", "牛油火锅底料 300 g"] },
        { type: "h", text: "清汤锅（笔记配方）" },
        { type: "ul", items: ["牛骨汤 2000 g", "水 1000 g", "玉米 75 g", "白萝卜 45 g", "肉卷 30 g", "芹菜 10 g"] },
        { type: "h", text: "鸳鸯锅" },
        { type: "p", text: "清汤侧：牛骨汤 1000、水 1000、肉卷 20、玉米 50、芹菜 10、白萝卜 30。麻辣侧：水 2000、大葱 10、小葱 5、花椒 0.5、辣椒 5、牛油底料 200。" },
        { type: "h", text: "出品克数（圆黑盘 / 长盘）" },
        { type: "ul", items: ["毛肚 130 g（圆黑盘）", "牛百叶 150 g（圆黑盘）", "牛大肚 / 牛肠 各 150 g（圆黑盘）", "牛肋条 250 g（圆黑盘）", "虾滑 75 g（两管）", "牛肉丸 8 个（圆盘）", "笋尖 150 g 约 8 根（长盘）", "牛杂拼盘：牛肠、牛肚、牛碎肉各 80 g"] },
        { type: "h", text: "客诉四步" },
        { type: "ol", items: ["停手，看着对方，先致歉", "确认诉求：换锅、减辣、补菜或退款", "在权限内当场解决", "用翻台笔记记一句：时间、桌号、结论"] },
        { type: "callout", tone: "warn", title: "不要做", text: "不要手抓牛油「差不多就行」。底料差 50 g，锅就不一样。" }
      ]
    },
    {
      id: "v-order",
      type: "video",
      track: "onboard",
      title: "锅底备货三分钟",
      minutes: 4,
      summary: "打开备货表，按库位加车，核对后提交。全程不离开这个流程。",
      scenes: [
        { duration: 7, title: "补货前先看余量", caption: "打开冻库和干货架，把「还够卖多久」记在脑子里。没有余量，系统里的数字没有意义。", stage: { kind: "steps", items: ["看余量", "打开备货", "按库位加车", "核对提交"] } },
        { duration: 8, title: "只从「锅底备货」下单", caption: "不要微信报货，不要口头加一项。所有数量都进购物车，方便对账和复查。", stage: { kind: "browser", bar: "锅底备货", html: "<div class='demo-list'><div class='demo-row on'><b>冻库</b><span>12 项</span></div><div class='demo-row'><b>干货</b><span>9 项</span></div><div class='demo-row'><b>小料台</b><span>6 项</span></div></div>" } },
        { duration: 8, title: "按库位筛，不靠搜索硬找", caption: "库位是货架位置。先冻库后干货。毛肚、牛油底料、南姜这些常用货，顺着走一遍。", stage: { kind: "browser", bar: "按库位", html: "<div class='demo-chips'><i class='on'>冻库</i><i>干货</i><i>小料台</i></div><div class='demo-item'><b>黑毛肚</b><em>余 1</em><strong>+ 2</strong></div><div class='demo-item'><b>牛油底料</b><em>余 0</em><strong>+ 4</strong></div>" } },
        { duration: 8, title: "改数量，再勾已采购", caption: "购物车里的数字是计划；勾选已采购表示货已经到手。两步不要混。", stage: { kind: "split", code: "计划  ≠  到货\n先改数量\n再勾已采购", preview: "<div class='demo-cart'><div>✓ 黑毛肚 ×2</div><div class='wait'>○ 牛油底料 ×4</div><div class='sum'>待采购 1 项</div></div>" } },
        { duration: 7, title: "提交一次，不要连点", caption: "核对名称、数量、库位后提交。写请求不会自动重放，连点可能造成重复单据。", stage: { kind: "callout", kicker: "提交前", text: "名称 · 数量 · 库位\n三栏都对，再按下。" } }
      ]
    },
    {
      id: "a-safety",
      type: "article",
      track: "onboard",
      title: "卫生与毛肚处理",
      minutes: 3,
      summary: "洗手时机和毛肚处理来自店内 SOP。漏一步就不合格。",
      blocks: [
        { type: "lead", text: "碰过可能污染物之后必须洗手。毛肚处理四步，不能省。" },
        { type: "h", text: "哪些情况必须洗手消毒（笔记）" },
        { type: "ul", items: ["进行处理、加工食品前", "用完化学药剂之后", "处理完生食后", "使用过卫生间后", "接触受污染工具后", "使用手机后", "处理过垃圾后", "上岗前"] },
        { type: "h", text: "毛肚处理 SOP" },
        { type: "ol", items: ["清水冲洗干净", "去杂边硬块", "切片 8×12 cm", "冰水保存"] },
        { type: "h", text: "出品" },
        { type: "p", text: "处理后的毛肚按出品标准装盘：毛肚 130 g，圆黑盘。牛百叶 150 g，同样圆黑盘。" },
        { type: "callout", tone: "warn", title: "红线", text: "过期、变质、来源不明的食材一律不上桌。毛肚不进冰水就容易糟，不能出堂。" }
      ]
    },
    {
      id: "a-html-what",
      type: "article",
      track: "html",
      title: "HTML 是说明书",
      minutes: 4,
      summary: "浏览器读的不是画面，是结构。先分清标签、属性和嵌套。",
      blocks: [
        { type: "lead", text: "HTML 不负责好看。它只告诉浏览器：这是标题、这是段落、这是按钮。好看是 CSS 的事。" },
        { type: "figure", kind: "html-tree" },
        { type: "h", text: "一份文件的最小骨架" },
        { type: "code", text: "<!DOCTYPE html>\n<html>\n  <head>\n    <title>火锅学堂</title>\n  </head>\n  <body>\n    <h1>毛肚 130g</h1>\n    <p>圆黑盘，冰水保存。</p>\n  </body>\n</html>" },
        { type: "p", text: "head 放标题、字符集这些给浏览器的元信息。body 放用户能看见的内容。" },
        { type: "h", text: "标签、属性、内容" },
        { type: "ul", items: ["标签：<p> 说明这是段落", "属性：<img alt=\"毛肚 130克 圆黑盘\"> 给标签附加信息", "内容：标签中间的文字或子标签"] },
        { type: "h", text: "嵌套像盒子套盒子" },
        { type: "p", text: "父标签包着子标签。p 里不要再塞 div。先写开标签，再写闭标签，最后检查有没有漏。" },
        { type: "callout", tone: "key", title: "学的目标", text: "看到一个页面，能说出哪一块是标题、哪一块是列表、哪一块会跳转。这就够往下玩了。" }
      ]
    },
    {
      id: "g-tags",
      type: "game",
      track: "html",
      title: "标签对对碰",
      minutes: 3,
      game: "tags",
      summary: "看到标签立刻说出它的职责。10 题，越快越好。",
      goal: "正确 8 题以上通关"
    },
    {
      id: "v-html-page",
      type: "video",
      track: "html",
      title: "从标签到页面",
      minutes: 4,
      summary: "看一行标签如何变成屏幕上的一块内容。",
      scenes: [
        { duration: 7, title: "先有结构，才有画面", caption: "浏览器从上到下读文件。它先搭骨架，再往格子里填内容。", stage: { kind: "browser", bar: "空白页", html: "<div class='ghost-page'><i></i><i></i><i></i></div>" } },
        { duration: 8, title: "标题占一行，而且更重", caption: "h1 到 h6 是标题层级。一页里 h1 只用一次，表示这份文件的主题。", stage: { kind: "split", code: "<h1>毛肚 130g</h1>", preview: "<h1 class='live-h'>毛肚 130g</h1>" } },
        { duration: 8, title: "段落负责把话说完", caption: "p 是段落。浏览器会自动留出段前段后的空隙，所以不要用一堆 <br> 来撑开文章。", stage: { kind: "split", code: "<p>圆黑盘，切片 8×12cm。</p>", preview: "<p class='live-p'>圆黑盘，切片 8×12cm。</p>" } },
        { duration: 8, title: "链接带走用户", caption: "a 加 href 才会跳转。没有地址的 a 只是看起来像链接。", stage: { kind: "split", code: "<a href=\"/pots\">看锅底</a>", preview: "<a class='live-a'>看锅底</a>" } },
        { duration: 8, title: "图片必须有替代文字", caption: "img 的 src 是地址，alt 是图片加载失败或读屏时要说的话。装饰图可以用空 alt。", stage: { kind: "split", code: "<img src=\"tripe.jpg\"\n     alt=\"毛肚 130克 圆黑盘\">", preview: "<div class='live-img'>图 · 毛肚 130g</div>" } },
        { duration: 7, title: "按钮触发动作", caption: "提交、加入锅里用 button。跳去另一页用 a。两者不要混。", stage: { kind: "split", code: "<button>加入锅里</button>", preview: "<button class='live-btn'>加入锅里</button>" } }
      ]
    },
    {
      id: "a-tags",
      type: "article",
      track: "html",
      title: "常用标签速查",
      minutes: 3,
      summary: "先把这 12 个标签记熟。页面上 80% 的结构都靠它们。",
      blocks: [
        { type: "lead", text: "不要背一百个标签。先会这 12 个，就已经能搭出课程卡、菜单和表单。" },
        { type: "table", headers: ["标签", "职责", "记住"], rows: [
          ["h1–h6", "标题", "一页一个 h1"],
          ["p", "段落", "一段话一个 p"],
          ["a", "链接", "必须有 href"],
          ["img", "图片", "必须有 alt"],
          ["ul / ol / li", "列表", "ul 无序，ol 有序"],
          ["button", "动作", "提交、开关用它"],
          ["input", "输入", "配合 label"],
          ["div", "分区", "没有语义时再用"],
          ["span", "行内标记", "只包几个字"],
          ["header / main / footer", "页面分区", "比纯 div 更清楚"]
        ]},
        { type: "callout", tone: "key", title: "选择原则", text: "先问「这块内容是什么」，再选标签。是标题就用 h，是动作就用 button。不要所有东西都用 div。" }
      ]
    },
    {
      id: "g-card",
      type: "game",
      track: "html",
      title: "拼一张卡片",
      minutes: 4,
      game: "card",
      summary: "用标题、介绍、价格和按钮，拼出一张商品卡。右侧即时预览。",
      goal: "四块结构齐全即通关"
    },
    {
      id: "g-fix",
      type: "game",
      track: "html",
      title: "找出坏标签",
      minutes: 4,
      game: "fix",
      summary: "四段有问题的 HTML。点出坏行，再选正确修法。",
      goal: "四处都修好即通关"
    },
    {
      id: "v-css",
      type: "video",
      track: "html",
      title: "CSS 如何给页面穿衣服",
      minutes: 4,
      summary: "结构已经有了。CSS 只做一件事：选中某块，改它的外观。",
      scenes: [
        { duration: 7, title: "选择器先点名", caption: "CSS 先写「选谁」，再写「改什么」。点名不准，样式就会套到别人头上。", stage: { kind: "split", code: "button {\n  background: #111;\n  color: #fff;\n}", preview: "<button class='live-btn'>加入锅里</button>" } },
        { duration: 8, title: "盒模型是四层", caption: "从里到外：内容、内边距 padding、边框 border、外边距 margin。改宽度时四层都会占空间。", stage: { kind: "figure", name: "box" } },
        { duration: 8, title: "padding 把字撑开", caption: "padding 是内容到边框的距离。按钮显得好按，通常是 padding 够，不是字变大了。", stage: { kind: "browser", bar: "padding", html: "<button class='live-btn pad'>加入锅里</button>" } },
        { duration: 8, title: "margin 把块推开", caption: "margin 是盒子和邻居的距离。垂直方向上，两个相邻 margin 还会合并，所以间距看起来可能比你写的小。", stage: { kind: "browser", bar: "margin", html: "<div class='live-stack'><div class='box'>卡片 A</div><div class='box'>卡片 B</div></div>" } },
        { duration: 7, title: "下一步去实验室", caption: "文字看懂了还不够。下一课用滑杆亲手改这四层，手感会比背定义快。", stage: { kind: "callout", kicker: "下一课", text: "盒模型实验室\n拖动即看到结果" } }
      ]
    },
    {
      id: "g-box",
      type: "game",
      track: "html",
      title: "盒模型实验室",
      minutes: 4,
      game: "box",
      summary: "拖动内容、内边距、边框、外边距，对齐目标尺寸。",
      goal: "三道题都对齐即通关"
    },
    {
      id: "a-tools",
      type: "article",
      track: "tools",
      title: "火锅店工具箱",
      minutes: 3,
      summary: "学堂之外，日常只用四件事：备货、笔记、流水、记账。",
      blocks: [
        { type: "lead", text: "门户里应用很多。岗前只要求你会四件，其他的用到再学。" },
        { type: "figure", kind: "tools" },
        { type: "h", text: "锅底备货" },
        { type: "p", text: "每日补货。按库位走货架，改数量，勾已采购，提交一次。" },
        { type: "h", text: "翻台笔记" },
        { type: "p", text: "写给明天的自己。客诉结论、炉头故障、缺货。短句，能搜到。" },
        { type: "h", text: "翻台流水" },
        { type: "p", text: "看翻台流水，不在这里改账单。用来发现高峰和异常，不是用来结账。" },
        { type: "h", text: "门店记账" },
        { type: "p", text: "店内收支。发生即记，不要晚上凭记忆补。分类选对，备注写清。" },
        { type: "callout", tone: "key", title: "效率原则", text: "一件事只进一个应用。备货不进笔记，客诉不进备货，流水不做假账。" }
      ]
    }
  ],

  exams: [
    {
      id: "e-onboard",
      title: "岗前通关",
      track: "onboard",
      minutes: 8,
      pass: 80,
      summary: "开市 SOP、锅底克数、出品克数、毛肚处理。80 分过关。",
      questions: [
        { id: "o1", type: "single", stem: "前厅开早，电源怎么开？", options: ["全部电源一起开", "打开所有电源，门牌灯除外", "只开 POS", "先开门牌灯再开别的"], answer: 1, explain: "笔记：打开所有电源（除门牌灯）。" },
        { id: "o2", type: "single", stem: "工作日早市茶水至少准备几壶？", options: ["1 壶", "3 壶", "8 壶", "不用准备"], answer: 1, explain: "笔记：工作日至少 3 壶，节假日约 5 壶。晚市是 8 壶。" },
        { id: "o3", type: "single", stem: "早市外卖调料备货数量是？", options: ["辣椒酱 5、沙茶酱 10", "辣椒酱 10、沙茶酱 50", "辣椒酱 50、沙茶酱 10", "各 30"], answer: 1, explain: "笔记：辣椒酱 ×10，沙茶酱 ×50。" },
        { id: "o4", type: "single", stem: "后厨开汤锅时南姜放多少？", options: ["20 克", "100 克", "200 克", "随意抓一把"], answer: 2, explain: "笔记：碎肉和骨头入锅，放 200 克南姜。" },
        { id: "o5", type: "single", stem: "麻辣锅牛油火锅底料是多少？", options: ["100 g", "200 g", "300 g", "500 g"], answer: 2, explain: "笔记麻辣锅：水 3000、花椒 0.5、辣椒 5、大葱 20、小葱 5、牛油底料 300。" },
        { id: "o6", type: "single", stem: "清汤锅的牛骨汤和水分别是？", options: ["汤 1000、水 2000", "汤 2000、水 1000", "汤 3000、水 0", "各 1500"], answer: 1, explain: "笔记清汤锅：牛骨汤 2000 g，水 1000 g。" },
        { id: "o7", type: "single", stem: "毛肚出品标准是？", options: ["100 g 长盘", "130 g 圆黑盘", "150 g 白长盘", "随手抓一盘"], answer: 1, explain: "火锅出品 SOP：毛肚 130（圆黑盘）。牛百叶是 150 圆黑盘。" },
        { id: "o8", type: "single", stem: "毛肚处理正确顺序是？", options: ["切片 → 冲洗 → 冰水", "清水冲洗 → 去杂边硬块 → 切片 8×12cm → 冰水保存", "直接解冻上桌", "只用热水泡"], answer: 1, explain: "毛肚处理 SOP：冲洗、去杂边、切片 8×12cm、冰水保存。" },
        { id: "o9", type: "judge", stem: "处理完生食、用过卫生间或用过手机后，都要洗手消毒。", answer: true, explain: "笔记「洗手消毒」明确列出这些情况，上岗前也要洗。" },
        { id: "o10", type: "single", stem: "虾滑出品是？", options: ["50 克一管", "75 克两管", "150 克圆黑盘", "8 个圆盘"], answer: 1, explain: "出品 SOP：虾滑 75 克（两管）。牛肉丸才是 8 个圆盘。" }
      ]
    },
    {
      id: "e-html",
      title: "HTML 基础",
      track: "html",
      minutes: 10,
      pass: 80,
      summary: "标签职责、属性、嵌套和盒模型。80 分过关。",
      questions: [
        { id: "h1", type: "single", stem: "HTML 主要负责什么？", options: ["让页面变好看", "描述内容结构", "连接数据库", "播放视频特效"], answer: 1, explain: "HTML 是结构。外观交给 CSS，行为交给 JavaScript。" },
        { id: "h2", type: "single", stem: "用户能看见的内容应该写在哪里？", options: ["<!DOCTYPE>", "<head>", "<body>", "<html> 的属性里"], answer: 2, explain: "body 放可见内容，head 放标题、字符集等元信息。" },
        { id: "h3", type: "single", stem: "表示页面主标题，优先用哪个？", options: ["<h1>", "<p>", "<b>", "<div>"], answer: 0, explain: "一页一个 h1，表示这份文件的主题。加粗不等于标题。" },
        { id: "h4", type: "single", stem: "<img> 必须提供的信息是？", options: ["width 和 height", "src，以及有意义的 alt（装饰图可用空 alt）", "只能写 id", "必须包在 <p> 里"], answer: 1, explain: "src 决定显示什么，alt 在失败或读屏时起作用。" },
        { id: "h5", type: "single", stem: "希望跳转到另一页，应该用？", options: ["<button>", "<span>", "<a href=\"...\">", "<div onclick>"], answer: 2, explain: "跳转用链接 a。提交、开关等动作才用 button。" },
        { id: "h6", type: "judge", stem: "所有内容都可以用 div 包起来，语义标签没有实际作用。", answer: false, explain: "div 没有语义。标题、导航、主内容用对应标签，读屏、样式和协作都会更清楚。" },
        { id: "h7", type: "single", stem: "下面哪一项是合法嵌套思路？", options: ["<p> 里面再放 <div>", "列表用 ul 包 li", "把 </p> 写在 <p> 前面", "按钮里再套一个 <html>"], answer: 1, explain: "ul/ol 的子级是 li。p 是段落，不能再塞块级大盒子。" },
        { id: "h8", type: "single", stem: "CSS 盒模型从里到外是？", options: ["margin → border → padding → content", "content → padding → border → margin", "border → content → padding → margin", "padding → content → margin → border"], answer: 1, explain: "内容在最里，然后是内边距、边框、外边距。" },
        { id: "h9", type: "single", stem: "让按钮更好按，通常先加哪一层？", options: ["margin", "padding", "再套一层 html", "把字号改成 8px"], answer: 1, explain: "padding 增大可点区域，而不必把字撑得过大。" },
        { id: "h10", type: "single", stem: "两个块之间要留空隙，优先改？", options: ["content", "alt", "margin", "<!DOCTYPE>"], answer: 2, explain: "margin 控制盒子和邻居的距离。" },
        { id: "h11", type: "multi", stem: "关于 <a> 和 <button>，正确的是？（多选）", options: ["跳转用 a", "提交表单用 button", "两者可以随便互换", "a 需要 href 才是真正的链接"], answer: [0, 1, 3], explain: "跳转与动作分开。没有 href 的 a 只是样子像链接。" },
        { id: "h12", type: "judge", stem: "装饰性图片可以使用空的 alt=\"\"。", answer: true, explain: "有信息的图写清楚 alt；纯装饰可以空 alt，避免读屏重复。" }
      ]
    },
    {
      id: "e-mix",
      title: "综合模拟",
      track: "tools",
      minutes: 12,
      pass: 80,
      summary: "岗前 + HTML。按正式考试节奏计时。",
      questions: []
    }
  ]
};

(function mixExam() {
  const exams = window.ACADEMY_CONTENT.exams;
  const mix = exams.find((item) => item.id === "e-mix");
  const source = exams.filter((item) => item.id !== "e-mix");
  mix.questions = source.flatMap((exam) => exam.questions.slice(0, 6));
})();
