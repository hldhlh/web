window.ACADEMY_CONTENT = {
  tracks: [
    { id: "onboard", title: "岗前必修", hint: "开门前必须过的线", urgent: true },
    { id: "html", title: "HTML 动手学", hint: "看、玩、考，一次学会结构" },
    { id: "tools", title: "门户效率", hint: "把今岭工具用到手上" }
  ],

  lessons: [
    {
      id: "a-day",
      type: "article",
      track: "onboard",
      title: "门店一日",
      minutes: 3,
      summary: "开店、高峰、订货、打烊四段节奏。先把一天的骨架记住。",
      blocks: [
        { type: "lead", text: "店不是一直在忙，而是四段节奏轮换。把节奏做对，高峰才不会乱。" },
        { type: "figure", kind: "day-flow" },
        { type: "h", text: "开店：先让机器和物料就位" },
        { type: "p", text: "到店先看三件事：设备能否出杯、冷藏是否在温、当日主推是否到货。这三件不过，不要开始接待。" },
        { type: "ul", items: ["制冰、咖啡机、制茶设备空转一次", "牛奶、椰浆、鲜食看效期和余量", "杯贴、吸管、打包袋补到手边"] },
        { type: "h", text: "高峰：只做标准动作" },
        { type: "p", text: "高峰不创新。配方、出杯顺序、叫号方式固定。客诉先停手致歉，再处理，不要边做边辩。" },
        { type: "h", text: "订货：用系统，不靠感觉" },
        { type: "p", text: "打开「今岭后厨订货」，按定位筛选，对照冰箱余量改数量，勾选已采购。不要口头报货。" },
        { type: "h", text: "打烊：留给明天一个干净的起点" },
        { type: "p", text: "清洗、清点、记录异常。笔记只写明天要用的：缺货、设备故障、客诉结论。" },
        { type: "callout", tone: "key", title: "一句话", text: "开店看状态，高峰看标准，订货看余量，打烊看明天。" }
      ]
    },
    {
      id: "a-product",
      type: "article",
      track: "onboard",
      title: "出品与客诉",
      minutes: 3,
      summary: "出品只认标准。客诉先处理感受，再处理问题。",
      blocks: [
        { type: "lead", text: "顾客记住的不是你有多忙，而是这杯像不像他上次喝到的那杯。" },
        { type: "h", text: "出品三不改" },
        { type: "ul", items: ["配方不改：糖、奶、浓缩按克数和秒数", "顺序不改：先冰后液，先底后顶", "交付不改：杯贴朝外，吸管随杯，叫号再递"] },
        { type: "h", text: "超时怎么处理" },
        { type: "p", text: "制作超时先告知，不要等顾客来问。能补救的立刻重做；不能补救的说明原因，并给出店内可执行的补偿。" },
        { type: "h", text: "客诉四步" },
        { type: "ol", items: ["停手，看着对方，先致歉", "确认诉求：重做、少糖、打包或退款", "在权限内当场解决", "用今岭笔记记一句：时间、饮品、结论"] },
        { type: "callout", tone: "warn", title: "不要做", text: "不要解释自己有多忙。不要把责任推给系统或同事。顾客要的是下一杯对的饮品。" }
      ]
    },
    {
      id: "v-order",
      type: "video",
      track: "onboard",
      title: "后厨订货三分钟",
      minutes: 4,
      summary: "打开订货表，按定位加车，核对后提交。全程不离开这个流程。",
      scenes: [
        { duration: 7, title: "订货前先看余量", caption: "打开冰箱和干货架，把「还够卖多久」记在脑子里。没有余量，系统里的数字没有意义。", stage: { kind: "steps", items: ["看余量", "打开订货", "按定位加车", "核对提交"] } },
        { duration: 8, title: "只从「今岭后厨订货」下单", caption: "不要微信报货，不要口头加一项。所有数量都进购物车，方便对账和复查。", stage: { kind: "browser", bar: "今岭后厨订货", html: "<div class='demo-list'><div class='demo-row on'><b>冷藏</b><span>12 项</span></div><div class='demo-row'><b>干货</b><span>9 项</span></div><div class='demo-row'><b>前厅</b><span>6 项</span></div></div>" } },
        { duration: 8, title: "按定位筛，不靠搜索硬找", caption: "定位是货架位置。先冷藏后干货，顺着走一遍，漏订会少很多。", stage: { kind: "browser", bar: "按定位", html: "<div class='demo-chips'><i class='on'>冷藏</i><i>干货</i><i>前厅</i></div><div class='demo-item'><b>厚乳</b><em>余 1</em><strong>+ 2</strong></div><div class='demo-item'><b>椰浆</b><em>余 0</em><strong>+ 4</strong></div>" } },
        { duration: 8, title: "改数量，再勾已采购", caption: "购物车里的数字是计划；勾选已采购表示货已经到手。两步不要混。", stage: { kind: "split", code: "计划  ≠  到货\n先改数量\n再勾已采购", preview: "<div class='demo-cart'><div>✓ 厚乳 ×2</div><div class='wait'>○ 椰浆 ×4</div><div class='sum'>待采购 1 项</div></div>" } },
        { duration: 7, title: "提交一次，不要连点", caption: "核对名称、数量、定位后提交。写请求不会自动重放，连点可能造成重复单据。", stage: { kind: "callout", kicker: "提交前", text: "名称 · 数量 · 定位\n三栏都对，再按下。" } }
      ]
    },
    {
      id: "a-safety",
      type: "article",
      track: "onboard",
      title: "卫生与安全",
      minutes: 2,
      summary: "手、器具、效期。这三件事没有「差不多」。",
      blocks: [
        { type: "lead", text: "卫生不是感觉干净，是动作干净。顾客看不到操作台背面，检查的人看得到。" },
        { type: "h", text: "手" },
        { type: "p", text: "接触钱款、清洁、垃圾后必须洗手再回出品。手套不能替代洗手。" },
        { type: "h", text: "器具" },
        { type: "p", text: "奶缸、茶桶、搅拌匙用完即洗。隔夜器具按开店流程再消毒一次。" },
        { type: "h", text: "效期" },
        { type: "ul", items: ["开封乳品写开封时间，超时即弃", "鲜食按当日批次出，先近后远", "发现胀袋、变味，整批停用并记录"] },
        { type: "callout", tone: "warn", title: "红线", text: "过期、变质、来源不明的物料，一律不出品。没有主管点头这回事。" }
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
        { type: "code", text: "<!DOCTYPE html>\n<html>\n  <head>\n    <title>今岭学堂</title>\n  </head>\n  <body>\n    <h1>开门营业</h1>\n    <p>先看余量，再订货。</p>\n  </body>\n</html>" },
        { type: "p", text: "head 放标题、字符集这些给浏览器的元信息。body 放用户能看见的内容。" },
        { type: "h", text: "标签、属性、内容" },
        { type: "ul", items: ["标签：<p> 说明这是段落", "属性：<img alt=\"生椰拿铁\"> 给标签附加信息", "内容：标签中间的文字或子标签"] },
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
        { duration: 8, title: "标题占一行，而且更重", caption: "h1 到 h6 是标题层级。一页里 h1 只用一次，表示这份文件的主题。", stage: { kind: "split", code: "<h1>生椰拿铁</h1>", preview: "<h1 class='live-h'>生椰拿铁</h1>" } },
        { duration: 8, title: "段落负责把话说完", caption: "p 是段落。浏览器会自动留出段前段后的空隙，所以不要用一堆 <br> 来撑开文章。", stage: { kind: "split", code: "<p>冷萃椰浆，入口先甜后香。</p>", preview: "<p class='live-p'>冷萃椰浆，入口先甜后香。</p>" } },
        { duration: 8, title: "链接带走用户", caption: "a 加 href 才会跳转。没有地址的 a 只是看起来像链接。", stage: { kind: "split", code: "<a href=\"/menu\">看菜单</a>", preview: "<a class='live-a'>看菜单</a>" } },
        { duration: 8, title: "图片必须有替代文字", caption: "img 的 src 是地址，alt 是图片加载失败或读屏时要说的话。装饰图可以用空 alt。", stage: { kind: "split", code: "<img src=\"latte.jpg\"\n     alt=\"生椰拿铁\">", preview: "<div class='live-img'>图 · 生椰拿铁</div>" } },
        { duration: 7, title: "按钮触发动作", caption: "提交、加入购物车用 button。跳去另一页用 a。两者不要混。", stage: { kind: "split", code: "<button>加入购物车</button>", preview: "<button class='live-btn'>加入购物车</button>" } }
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
        { duration: 7, title: "选择器先点名", caption: "CSS 先写「选谁」，再写「改什么」。点名不准，样式就会套到别人头上。", stage: { kind: "split", code: "button {\n  background: #111;\n  color: #fff;\n}", preview: "<button class='live-btn'>加入购物车</button>" } },
        { duration: 8, title: "盒模型是四层", caption: "从里到外：内容、内边距 padding、边框 border、外边距 margin。改宽度时四层都会占空间。", stage: { kind: "figure", name: "box" } },
        { duration: 8, title: "padding 把字撑开", caption: "padding 是内容到边框的距离。按钮显得好按，通常是 padding 够，不是字变大了。", stage: { kind: "browser", bar: "padding", html: "<button class='live-btn pad'>加入购物车</button>" } },
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
      title: "今岭工具箱",
      minutes: 3,
      summary: "学堂之外，日常只用四件事：订货、笔记、流水、记账。",
      blocks: [
        { type: "lead", text: "门户里应用很多。岗前只要求你会四件，其他的用到再学。" },
        { type: "figure", kind: "tools" },
        { type: "h", text: "后厨订货" },
        { type: "p", text: "每日补货。按定位走货架，改数量，勾已采购，提交一次。" },
        { type: "h", text: "今岭笔记" },
        { type: "p", text: "写给明天的自己。客诉结论、设备故障、缺货。短句，能搜到。" },
        { type: "h", text: "流水可视化" },
        { type: "p", text: "看顾客流水，不在这里改订单。用来发现高峰和异常，不是用来结账。" },
        { type: "h", text: "实时记账" },
        { type: "p", text: "店内收支。发生即记，不要晚上凭记忆补。分类选对，备注写清。" },
        { type: "callout", tone: "key", title: "效率原则", text: "一件事只进一个应用。订货不进笔记，客诉不进订货，流水不做假账。" }
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
      summary: "门店节奏、出品、订货、卫生。80 分过关。",
      questions: [
        { id: "o1", type: "single", stem: "开店时哪一件必须先完成？", options: ["先接待排队顾客", "先确认设备、冷藏温度和主推到货", "先把朋友圈海报发了", "先做当天新品研发"], answer: 1, explain: "设备、温度、物料是出品前提。接待可以稍后，机器不能出杯就不能开。" },
        { id: "o2", type: "single", stem: "高峰期出品应该怎么做？", options: ["按自己手感加减糖", "只做标准动作，配方和顺序固定", "忙的时候跳过杯贴", "先做熟客加料款"], answer: 1, explain: "高峰不创新。标准动作才能稳定出杯时间和口感。" },
        { id: "o3", type: "single", stem: "后厨订货的正确顺序是？", options: ["口头报给主管再补进系统", "先提交再改数量", "看余量 → 按定位加车 → 核对 → 提交", "先搜商品名，想到什么加什么"], answer: 2, explain: "余量是依据，定位是路径，核对称后提交。口头报货会丢记录。" },
        { id: "o4", type: "judge", stem: "购物车里改好数量，就等于货已经采购完成。", answer: false, explain: "改数量是计划；勾选已采购才表示货到手。两步不能混。" },
        { id: "o5", type: "single", stem: "客诉到来时第一步是？", options: ["解释现在很忙", "先停手致歉，再确认诉求", "让顾客去找经理", "先把这杯做完再说"], answer: 1, explain: "先处理感受，再处理问题。解释忙碌会升温。" },
        { id: "o6", type: "single", stem: "客诉处理完应该记在哪里？", options: ["订货备注", "今岭笔记：时间、饮品、结论", "流水可视化里改订单", "不用记"], answer: 1, explain: "笔记留给交接和复查。不要把客诉写进订货或流水。" },
        { id: "o7", type: "judge", stem: "过期乳品只要闻起来正常，可以继续出品。", answer: false, explain: "效期是红线。变质、过期、来源不明一律停用。" },
        { id: "o8", type: "single", stem: "接触完现金后要做什么？", options: ["直接回去做下一杯", "换一副新手套即可，不用洗手", "洗手后再回到出品", "用围裙擦一下手"], answer: 2, explain: "手套不能替代洗手。钱款、清洁、垃圾后必须洗手。" },
        { id: "o9", type: "single", stem: "订货提交时为什么不要连点？", options: ["系统会自动合并", "写操作不会自动重放，连点可能重复下单", "连点能加快到货", "没有影响"], answer: 1, explain: "本门户的写请求失败不会自动重放；成功时连点则可能产生重复单据。" },
        { id: "o10", type: "single", stem: "打烊笔记应该写什么？", options: ["今天心情", "明天要用的：缺货、故障、客诉结论", "把流水明细抄一遍", "把菜单背诵下来"], answer: 1, explain: "笔记服务明天。短、能搜、能执行。" }
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
