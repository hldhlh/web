window.ACADEMY_CONTENT = {
  tracks: [
    { id: "onboard", title: "岗前必修", hint: "开门前必须过的线", urgent: true },
    { id: "tools", title: "门店工具", hint: "备货、笔记、流水、记账" }
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
    }
  ]
};
