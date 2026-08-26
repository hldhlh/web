(() => {
  const DATA = window.ACADEMY_CONTENT;
  const KEY = "academy-progress-v1";
  const LETTERS = "ABCDEFGH";

  const TYPE_LABEL = { article: "图文", video: "视频", game: "互动" };
  const TYPE_ICON = { article: "文", video: "播", game: "玩" };

  const TAG_PAIRS = [
    { tag: "<h1>", meaning: "页面主标题" },
    { tag: "<p>", meaning: "一段完整的话" },
    { tag: "<a>", meaning: "跳转到别处" },
    { tag: "<img>", meaning: "插入图片" },
    { tag: "<button>", meaning: "触发一个动作" },
    { tag: "<ul>", meaning: "无序列表" },
    { tag: "<li>", meaning: "列表中的一项" },
    { tag: "<input>", meaning: "让人填写内容" },
    { tag: "<div>", meaning: "没有语义的分区" },
    { tag: "<span>", meaning: "包住几个行内字" },
    { tag: "<label>", meaning: "给输入框起名字" },
    { tag: "<header>", meaning: "页头区域" }
  ];

  const CARD_TOOLS = [
    { id: "h2", label: "标题 h2", html: "<h2>生椰拿铁</h2>" },
    { id: "p", label: "介绍 p", html: "<p>冷萃椰浆，入口先甜后香。</p>" },
    { id: "price", label: "价格 span", html: "<div class=\"price\">¥18</div>" },
    { id: "btn", label: "按钮 button", html: "<button type=\"button\">加入购物车</button>" },
    { id: "note", label: "备注 span", html: "<span>含椰奶，可做热饮。</span>" }
  ];

  const FIX_ROUNDS = [
    {
      title: "图片少了替代文字",
      lines: ["<section>", "  <h2>生椰拿铁</h2>", "  <img src=\"latte.jpg\">", "</section>"],
      bad: 2,
      options: ["给 img 补上 alt=\"生椰拿铁\"", "把 img 改成 button", "删掉整张图就算修好"],
      answer: 0
    },
    {
      title: "链接没有去处",
      lines: ["<nav>", "  <a>菜单</a>", "  <a href=\"/about\">关于</a>", "</nav>"],
      bad: 1,
      options: ["给第一个 a 加上 href=\"/menu\"", "把 a 改成 p", "把两个链接都删掉"],
      answer: 0
    },
    {
      title: "列表结构不对",
      lines: ["<ul>", "  <div>厚乳</div>", "  <li>椰浆</li>", "</ul>"],
      bad: 1,
      options: ["把 div 改成 li", "在 ul 外包一层 p", "把 ul 改成 h1"],
      answer: 0
    },
    {
      title: "段落里塞了大盒子",
      lines: ["<p>", "  今日主推", "  <div>生椰拿铁</div>", "</p>"],
      bad: 2,
      options: ["把 div 拿出去，或改成 span", "再套一层 html", "把 p 改成 img"],
      answer: 0
    }
  ];

  const BOX_CHALLENGES = [
    { title: "让内边距变成 16", target: { content: 140, padding: 16, border: 2, margin: 8 } },
    { title: "边框加到 6，外边距 20", target: { content: 120, padding: 10, border: 6, margin: 20 } },
    { title: "内容 160，其余都收紧", target: { content: 160, padding: 4, border: 1, margin: 4 } }
  ];

  const state = {
    route: { name: "home" },
    theme: localStorage.getItem("app-theme") || "light",
    progress: loadProgress(),
    exam: null,
    video: null,
    game: null,
    tick: 0
  };

  const view = () => document.getElementById("view");

  function defaults() {
    return {
      completed: {},
      examHistory: {},
      wrong: [],
      minutes: 0,
      last: null,
      streakDate: "",
      streak: 0
    };
  }

  function loadProgress() {
    try {
      return Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || "{}"));
    } catch (_) {
      return defaults();
    }
  }

  const CLIENT_ID = (() => {
    try {
      const existing = localStorage.getItem("academy-client-id");
      if (existing) return existing;
      const id = (crypto.randomUUID && crypto.randomUUID()) || `c-${Date.now()}`;
      localStorage.setItem("academy-client-id", id);
      return id;
    } catch (_) {
      return `c-${Date.now()}`;
    }
  })();

  const Live = {
    sb: null,
    skipUntil: 0,
    timer: 0,
    rev: 0,
    setStatus(name, label) {
      const el = document.getElementById("live-status");
      if (!el) return;
      el.dataset.state = name;
      el.textContent = label;
    },
    unpack(payload) {
      if (!payload || typeof payload !== "object") return null;
      if (payload.data && typeof payload.data === "object") return payload.data;
      if (payload.completed || payload.examHistory) return payload;
      return null;
    },
    apply(payload, updatedAt) {
      if (!payload || typeof payload !== "object") return false;
      if (payload.client === CLIENT_ID) return false;
      const ts = payload.ts || Date.parse(updatedAt || "") || 0;
      if (ts && ts < this.rev) return false;
      const next = this.unpack(payload);
      if (!next) return false;
      this.rev = ts || Date.now();
      state.progress = Object.assign(defaults(), next);
      try { localStorage.setItem(KEY, JSON.stringify(state.progress)); } catch (_) { }
      return true;
    },
    async pull() {
      if (!this.sb) return false;
      const cfg = window.ACADEMY_CONFIG;
      const { data, error } = await this.sb.from(cfg.table).select("payload,updated_at").eq("id", cfg.rowId).maybeSingle();
      if (error || !data) return false;
      return this.apply(data.payload, data.updated_at);
    },
    push() {
      try { localStorage.setItem(KEY, JSON.stringify(state.progress)); } catch (_) { }
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), 60);
    },
    async flush() {
      if (!this.sb) return;
      const cfg = window.ACADEMY_CONFIG;
      const payload = { client: CLIENT_ID, ts: Date.now(), data: state.progress };
      this.skipUntil = Date.now() + 900;
      this.rev = payload.ts;
      const { error } = await this.sb.from(cfg.table).upsert({
        id: cfg.rowId,
        payload,
        updated_at: new Date(payload.ts).toISOString()
      });
      this.setStatus(error ? "offline" : "live", error ? "离线" : "已同步");
    },
    subscribe() {
      const cfg = window.ACADEMY_CONFIG;
      this.sb.channel("academy-live", { config: { broadcast: { self: false } } })
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: cfg.table,
          filter: `id=eq.${cfg.rowId}`
        }, (msg) => {
          if (Date.now() < this.skipUntil) return;
          if (!msg.new) return;
          if (this.apply(msg.new.payload, msg.new.updated_at)) {
            this.setStatus("live", "已同步");
            const stay = state.route?.name;
            if (stay === "home" || stay === "learn" || stay === "exams" || stay === "me" || stay === "result") render();
          }
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") this.setStatus("live", "已同步");
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") this.setStatus("offline", "离线");
        });
    },
    async connect() {
      const cfg = window.ACADEMY_CONFIG;
      this.setStatus("connecting", "同步中");
      try {
        const boot = await window.ACADEMY_BOOTSTRAP;
        if (boot?.row && this.apply(boot.row.payload, boot.row.updated_at)) render();
      } catch (_) { }
      if (!window.supabase?.createClient || !cfg) {
        this.setStatus("offline", "离线");
        return;
      }
      this.sb = window.supabase.createClient(cfg.url, cfg.key, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 20 } }
      });
      try {
        if (await this.pull()) render();
      } catch (_) { }
      this.subscribe();
    }
  };

  function save() {
    Live.push();
  }

  function today() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function touchStreak() {
    const day = today();
    if (state.progress.streakDate === day) return;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const y = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    state.progress.streak = state.progress.streakDate === y ? state.progress.streak + 1 : 1;
    state.progress.streakDate = day;
    save();
  }

  function lessonById(id) {
    return DATA.lessons.find((item) => item.id === id);
  }

  function examById(id) {
    return DATA.exams.find((item) => item.id === id);
  }

  function lessonsIn(track) {
    return DATA.lessons.filter((item) => item.track === track);
  }

  function isDone(id) {
    return Boolean(state.progress.completed[id]);
  }

  function completeLesson(id) {
    state.progress.completed[id] = Date.now();
    state.progress.last = { type: "lesson", id };
    touchStreak();
    save();
  }

  function completionRate() {
    const total = DATA.lessons.length + DATA.exams.length;
    const examDone = DATA.exams.filter((exam) => bestScore(exam.id) >= exam.pass).length;
    const done = Object.keys(state.progress.completed).length + examDone;
    return Math.round((done / total) * 100);
  }

  function bestScore(examId) {
    const logs = state.progress.examHistory[examId] || [];
    return logs.reduce((max, item) => Math.max(max, item.score), -1);
  }

  function nextLesson() {
    if (state.progress.last?.type === "lesson") {
      const current = lessonById(state.progress.last.id);
      if (current && !isDone(current.id)) return current;
    }
    return DATA.lessons.find((item) => !isDone(item.id)) || DATA.lessons[0];
  }

  function parseHash() {
    const raw = (location.hash || "#/home").replace(/^#\/?/, "");
    const [path, query] = raw.split("?");
    const parts = path.split("/").filter(Boolean);
    const params = {};
    new URLSearchParams(query || "").forEach((value, key) => { params[key] = value; });
    if (!parts.length || parts[0] === "home") return { name: "home" };
    if (parts[0] === "learn") return { name: "learn", type: params.type || "all" };
    if (parts[0] === "exams") return { name: "exams" };
    if (parts[0] === "me") return { name: "me" };
    if (parts[0] === "lesson" && parts[1]) return { name: "lesson", id: parts[1] };
    if (parts[0] === "exam" && parts[1] && parts[2] === "result") return { name: "result", id: parts[1] };
    if (parts[0] === "exam" && parts[1]) return { name: "exam", id: parts[1] };
    return { name: "home" };
  }

  function go(hash) {
    location.hash = hash;
  }

  function setTheme(theme) {
    state.theme = theme;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("app-theme", theme);
    const color = document.querySelector("meta[name='theme-color']");
    if (color) color.content = theme === "dark" ? "#0b0d12" : "#f4f5f7";
    const btn = document.getElementById("theme-btn");
    if (btn) btn.title = theme === "dark" ? "切换到白天" : "切换到黑夜";
  }

  function svgIcon(name) {
    const icons = {
      back: '<path d="M15 6 9 12l6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M2 12h2m16 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
      moon: '<path d="M20 12.6A8 8 0 1 1 11.4 4 6.2 6.2 0 0 0 20 12.6Z"/>',
      home: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8Z"/>',
      learn: '<path d="M4 7.5 12 4l8 3.5M4 7.5v9L12 20l8-3.5v-9M4 7.5 12 11l8-3.5"/>',
      exam: '<path d="M8 4h8v16H8z"/><path d="M10.5 9h5M10.5 13h3"/>',
      me: '<circle cx="12" cy="8" r="3"/><path d="M5 19c1.4-3 3.8-4.5 7-4.5S17.6 16 19 19"/>'
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;");
  }

  function minutesLabel(n) {
    return `${n} 分钟`;
  }

  function progressRing(percent) {
    const r = 26;
    const c = 2 * Math.PI * r;
    const offset = c - (percent / 100) * c;
    return `<div class="ring-wrap" aria-label="总进度 ${percent}%">
      <svg viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".12" stroke-width="6"/>
        <circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--accent)" stroke-width="6" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
      </svg>
      <span>${percent}%</span>
    </div>`;
  }

  function figure(kind) {
    if (kind === "day-flow") {
      return `<div class="figure">${["开店", "高峰", "订货", "打烊"].map((label, i) =>
        `<div style="display:flex;align-items:center;gap:10px;padding:8px 4px">
          <b style="width:22px;height:22px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;font-size:12px">${i + 1}</b>
          <span>${label}</span>
          ${i < 3 ? "<span class='muted'>→</span>" : ""}
        </div>`).join("")}</div>`;
    }
    if (kind === "html-tree") {
      return `<div class="figure"><pre class="pre" style="margin:0">&lt;html&gt;
  &lt;head&gt;  给浏览器的信息
  &lt;body&gt;  给人看的内容
    &lt;h1&gt; 标题
    &lt;p&gt;  段落</pre></div>`;
    }
    if (kind === "tools") {
      return `<div class="figure" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${[["后厨订货", "每日补货"], ["今岭笔记", "交接短句"], ["流水可视化", "看高峰"], ["实时记账", "发生即记"]].map(([t, d]) =>
          `<div style="padding:10px;border-radius:12px;background:var(--surface-2)"><b>${t}</b><div class="muted">${d}</div></div>`).join("")}
      </div>`;
    }
    if (kind === "box") {
      return `<div class="box-visual"><div class="m"><div class="b" style="border-width:6px"><div class="p"><div class="c">content</div></div></div></div></div>`;
    }
    return "";
  }

  function renderBlocks(blocks) {
    return blocks.map((block) => {
      if (block.type === "lead") return `<p class="lead">${escapeHtml(block.text)}</p>`;
      if (block.type === "h") return `<h3>${escapeHtml(block.text)}</h3>`;
      if (block.type === "p") return `<p>${escapeHtml(block.text)}</p>`;
      if (block.type === "ul") return `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
      if (block.type === "ol") return `<ol>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`;
      if (block.type === "callout") return `<div class="callout ${block.tone === "warn" ? "warn" : ""}"><b>${escapeHtml(block.title)}</b>${escapeHtml(block.text)}</div>`;
      if (block.type === "code") return `<pre class="pre">${escapeHtml(block.text)}</pre>`;
      if (block.type === "figure") return figure(block.kind);
      if (block.type === "table") {
        return `<table class="table"><thead><tr>${block.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${
          block.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")
        }</tbody></table>`;
      }
      return "";
    }).join("");
  }

  function setTop(title, back) {
    document.getElementById("top-title").textContent = title;
    const backBtn = document.getElementById("back-btn");
    backBtn.hidden = !back;
    document.querySelector(".app").classList.toggle("focus", Boolean(back));
  }

  function setTab(name) {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === name);
    });
  }

  function renderHome() {
    setTop("今岭学堂", false);
    setTab("home");
    const next = nextLesson();
    const percent = completionRate();
    const hour = new Date().getHours();
    const hello = hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
    const date = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date());

    view().innerHTML = `
      <div class="hello">
        <div>
          <p>${hello} · ${date}</p>
          <h2>先把该过的课过完</h2>
        </div>
        ${progressRing(percent)}
      </div>
      <button class="card continue" data-act="open-lesson" data-id="${next.id}">
        <div class="kicker">继续学习</div>
        <strong>${escapeHtml(next.title)}</strong>
        <div class="meta">${TYPE_LABEL[next.type]} · ${minutesLabel(next.minutes)}</div>
        <div class="bar"><i style="width:${isDone(next.id) ? 100 : 18}%"></i></div>
      </button>
      <div class="modes">
        <button class="mode" data-act="go" data-hash="#/learn?type=article"><span class="dot">文</span>图文</button>
        <button class="mode" data-act="go" data-hash="#/learn?type=video"><span class="dot">播</span>视频</button>
        <button class="mode" data-act="go" data-hash="#/learn?type=game"><span class="dot">玩</span>互动</button>
        <button class="mode" data-act="go" data-hash="#/exams"><span class="dot">考</span>考试</button>
      </div>
      ${DATA.tracks.map((track) => {
        const items = lessonsIn(track.id);
        const exam = DATA.exams.find((item) => item.track === track.id);
        const done = items.filter((item) => isDone(item.id)).length;
        return `<section>
          <div class="sec-title"><h3>${track.title}</h3><span>${done}/${items.length}</span></div>
          <div class="card track">
            <header><span>${track.hint}</span><span class="muted">${exam ? exam.title : ""}</span></header>
            ${items.map((lesson) => `
              <button class="row" data-act="open-lesson" data-id="${lesson.id}">
                <span class="badge ${isDone(lesson.id) ? "done" : ""}">${isDone(lesson.id) ? "✓" : TYPE_ICON[lesson.type]}</span>
                <span class="body"><b>${escapeHtml(lesson.title)}</b><span class="muted">${TYPE_LABEL[lesson.type]} · ${minutesLabel(lesson.minutes)}</span></span>
              </button>`).join("")}
            ${exam ? `<button class="row" data-act="go" data-hash="#/exam/${exam.id}">
              <span class="badge ${bestScore(exam.id) >= exam.pass ? "done" : ""}">${bestScore(exam.id) >= 0 ? bestScore(exam.id) : "考"}</span>
              <span class="body"><b>${escapeHtml(exam.title)}</b><span class="muted">${exam.questions.length} 题 · ${exam.pass} 分过关</span></span>
            </button>` : ""}
          </div>
        </section>`;
      }).join("")}
    `;
  }

  function renderLearn(type) {
    setTop("课程", false);
    setTab("learn");
    const chips = [["all", "全部"], ["article", "图文"], ["video", "视频"], ["game", "互动"]];
    const items = DATA.lessons.filter((item) => type === "all" || item.type === type);
    view().innerHTML = `
      <div class="chips">
        ${chips.map(([id, label]) => `<button class="chip ${type === id ? "on" : ""}" data-act="go" data-hash="#/learn?type=${id}">${label}</button>`).join("")}
      </div>
      ${items.map((lesson) => `
        <button class="card lesson-card" data-act="open-lesson" data-id="${lesson.id}">
          <div class="top"><span class="tag">${TYPE_LABEL[lesson.type]}</span><span>${isDone(lesson.id) ? "已完成" : minutesLabel(lesson.minutes)}</span></div>
          <strong>${escapeHtml(lesson.title)}</strong>
          <p class="muted">${escapeHtml(lesson.summary)}</p>
        </button>`).join("")}
    `;
  }

  function renderExams() {
    setTop("考试", false);
    setTab("exams");
    view().innerHTML = DATA.exams.map((exam) => {
      const best = bestScore(exam.id);
      return `<button class="card lesson-card" data-act="go" data-hash="#/exam/${exam.id}">
        <div class="top"><span class="tag">${exam.questions.length} 题</span><span>${best >= 0 ? `最高 ${best} 分` : minutesLabel(exam.minutes)}</span></div>
        <strong>${escapeHtml(exam.title)}</strong>
        <p class="muted">${escapeHtml(exam.summary)}</p>
      </button>`;
    }).join("");
  }

  function renderMe() {
    setTop("我的", false);
    setTab("me");
    const done = Object.keys(state.progress.completed).length;
    const passed = DATA.exams.filter((exam) => bestScore(exam.id) >= exam.pass).length;
    view().innerHTML = `
      <div class="hello">
        <div>
          <p>学习档案</p>
          <h2>进度留在这台设备</h2>
        </div>
        ${progressRing(completionRate())}
      </div>
      <div class="stats">
        <div class="stat"><b>${done}</b><span>已完成课程</span></div>
        <div class="stat"><b>${passed}</b><span>通过考试</span></div>
        <div class="stat"><b>${state.progress.streak}</b><span>连续学习</span></div>
      </div>
      <div class="sec-title"><h3>错题本</h3><span>${state.progress.wrong.length}</span></div>
      ${state.progress.wrong.length ? state.progress.wrong.slice(0, 8).map((item, index) =>
        `<button class="card lesson-card wrong-item" data-act="practice-wrong" data-index="${index}">
          <strong>${escapeHtml(item.stem)}</strong>
          <p class="muted">${escapeHtml(item.explain)}</p>
        </button>`).join("") : `<p class="empty">还没有错题。考试里答错的会出现在这里。</p>`}
      <div class="actions">
        <button class="ghost" data-act="reset">清除本机学习记录</button>
      </div>
    `;
  }

  function openLesson(id) {
    const lesson = lessonById(id);
    if (!lesson) return go("#/home");
    state.progress.last = { type: "lesson", id };
    save();
    touchStreak();
    if (lesson.type === "article") return renderArticle(lesson);
    if (lesson.type === "video") return startVideo(lesson);
    return startGame(lesson);
  }

  function renderArticle(lesson) {
    setTop(lesson.title, true);
    view().innerHTML = `
      <article class="article">
        <p class="muted">${TYPE_LABEL.article} · ${minutesLabel(lesson.minutes)}</p>
        ${renderBlocks(lesson.blocks)}
        <div class="actions">
          <button class="primary" data-act="complete" data-id="${lesson.id}">${isDone(lesson.id) ? "已完成，返回" : "完成本课"}</button>
        </div>
      </article>
    `;
  }

  function sceneHtml(scene) {
    const stage = scene.stage || { kind: "callout", kicker: "", text: scene.caption };
    if (stage.kind === "steps") {
      return `<div>${stage.items.map((item, i) => `<div class="demo-row ${i === 0 ? "on" : ""}"><b>${i + 1}</b><span>${escapeHtml(item)}</span></div>`).join("")}</div>`;
    }
    if (stage.kind === "browser") {
      return `<div class="muted" style="margin-bottom:10px">${escapeHtml(stage.bar)}</div>${stage.html}`;
    }
    if (stage.kind === "split") {
      return `<div class="split"><pre>${escapeHtml(stage.code)}</pre><div class="pane">${stage.preview}</div></div>`;
    }
    if (stage.kind === "figure") return figure(stage.name);
    return `<div class="kicker">${escapeHtml(stage.kicker || "要点")}</div><div style="font-size:22px;font-weight:700;letter-spacing:-.04em;white-space:pre-line;margin-top:12px">${escapeHtml(stage.text)}</div>`;
  }

  function videoTotal(lesson) {
    return lesson.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  }

  function sceneIndexAt(lesson, t) {
    let acc = 0;
    for (let i = 0; i < lesson.scenes.length; i += 1) {
      acc += lesson.scenes[i].duration;
      if (t < acc) return i;
    }
    return lesson.scenes.length - 1;
  }

  function startVideo(lesson) {
    state.video = { id: lesson.id, t: 0, playing: true, speed: 1, last: performance.now() };
    renderVideo();
  }

  function renderVideo() {
    const lesson = lessonById(state.video.id);
    const total = videoTotal(lesson);
    const index = sceneIndexAt(lesson, state.video.t);
    const scene = lesson.scenes[index];
    setTop(lesson.title, true);
    view().innerHTML = `
      <div class="player">
        <div class="stage">
          <div class="scene-title">${index + 1}/${lesson.scenes.length} · ${escapeHtml(scene.title)}</div>
          ${sceneHtml(scene)}
        </div>
        <p class="caption">${escapeHtml(scene.caption)}</p>
        <div class="bar" data-act="scrub" style="height:8px;cursor:pointer"><i style="width:${(state.video.t / total) * 100}%"></i></div>
        <div class="controls">
          <button class="chip" data-act="video-skip" data-delta="-8" aria-label="后退 8 秒">−8s</button>
          <button class="primary" style="width:auto;min-width:88px" data-act="video-toggle">${state.video.playing ? "暂停" : "播放"}</button>
          <button class="chip" data-act="video-speed">${state.video.speed}x</button>
          <span class="time">${Math.floor(state.video.t)} / ${total}s</span>
        </div>
        <div class="chapters">
          ${lesson.scenes.map((item, i) => `
            <button class="chapter ${i === index ? "on" : ""}" data-act="video-scene" data-index="${i}">
              <span>${escapeHtml(item.title)}</span><span class="muted">${item.duration}s</span>
            </button>`).join("")}
        </div>
        <button class="primary" data-act="complete" data-id="${lesson.id}" ${state.video.t >= total - 0.4 || isDone(lesson.id) ? "" : "disabled"}>${state.video.t >= total - 0.4 || isDone(lesson.id) ? "完成本课" : "看到最后再完成"}</button>
      </div>
    `;
  }

  function tickVideo(now) {
    if (!state.video || !state.video.playing) return;
    if (state.route.name !== "lesson") return;
    const lesson = lessonById(state.video.id);
    if (!lesson || lesson.type !== "video") return;
    const dt = Math.min(0.25, (now - state.video.last) / 1000) * state.video.speed;
    state.video.last = now;
    const total = videoTotal(lesson);
    const prev = sceneIndexAt(lesson, state.video.t);
    state.video.t = Math.min(total, state.video.t + dt);
    if (state.video.t >= total) state.video.playing = false;
    const nextIndex = sceneIndexAt(lesson, state.video.t);
    if (prev !== nextIndex || state.video.t >= total) {
      renderVideo();
      return;
    }
    const bar = view().querySelector(".bar > i");
    const time = view().querySelector(".time");
    if (bar) bar.style.width = `${(state.video.t / total) * 100}%`;
    if (time) time.textContent = `${Math.floor(state.video.t)} / ${total}s`;
  }

  function startGame(lesson) {
    if (lesson.game === "tags") {
      state.game = { id: lesson.id, kind: "tags", n: 0, score: 0, locked: false, queue: shuffle(TAG_PAIRS).slice(0, 10) };
    } else if (lesson.game === "card") {
      state.game = { id: lesson.id, kind: "card", parts: [] };
    } else if (lesson.game === "fix") {
      state.game = { id: lesson.id, kind: "fix", round: 0, pickedLine: -1, solved: [] };
    } else if (lesson.game === "box") {
      state.game = { id: lesson.id, kind: "box", round: 0, values: { content: 140, padding: 8, border: 2, margin: 8 } };
    }
    renderGame();
  }

  function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function renderGame() {
    const lesson = lessonById(state.game.id);
    setTop(lesson.title, true);
    const g = state.game;
    if (g.kind === "tags") return renderTagGame(lesson, g);
    if (g.kind === "card") return renderCardGame(lesson, g);
    if (g.kind === "fix") return renderFixGame(lesson, g);
    return renderBoxGame(lesson, g);
  }

  function renderTagGame(lesson, g) {
    if (g.n >= g.queue.length) {
      const pass = g.score >= 8;
      view().innerHTML = `
        <div class="result">
          <div class="kicker">标签对对碰</div>
          <div class="score">${g.score}/10</div>
          <div class="pass" style="color:${pass ? "var(--ok)" : "var(--bad)"}">${pass ? "通关" : "再练一轮"}</div>
          <p class="muted">看到标签，立刻反应它在页面里干什么。</p>
        </div>
        <button class="primary" data-act="${pass ? "complete" : "retry-game"}" data-id="${lesson.id}">${pass ? "完成本课" : "再来一次"}</button>
      `;
      return;
    }
    const current = g.queue[g.n];
    const options = shuffle([current.meaning, ...shuffle(TAG_PAIRS.filter((item) => item.tag !== current.tag)).slice(0, 3).map((item) => item.meaning)]);
    view().innerHTML = `
      <div class="game-head">
        <p class="muted">${g.n + 1}/10 · 对 ${g.score}</p>
        <h2>${escapeHtml(lesson.goal)}</h2>
      </div>
      <div class="prompt">${escapeHtml(current.tag)}<small>这个标签的职责是？</small></div>
      <div class="choices">
        ${options.map((opt) => `<button class="choice" data-act="tag-answer" data-value="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`).join("")}
      </div>
    `;
  }

  function renderCardGame(lesson, g) {
    const html = g.parts.join("");
    const has = {
      h2: /<h2[\s>]/.test(html),
      p: /<p[\s>]/.test(html),
      price: /class="price"/.test(html),
      btn: /<button[\s>]/.test(html)
    };
    const pass = has.h2 && has.p && has.price && has.btn;
    view().innerHTML = `
      <div class="game-head">
        <p class="muted">拼一张卡片</p>
        <h2>${escapeHtml(lesson.goal)}</h2>
      </div>
      <div class="builder">
        <div>
          <div class="tools">
            ${CARD_TOOLS.map((tool) => `<button data-act="card-add" data-id="${tool.id}">${tool.label}</button>`).join("")}
            <button data-act="card-undo">撤销</button>
          </div>
          <ul class="check">
            <li class="${has.h2 ? "done" : ""}">${has.h2 ? "✓" : "○"} 标题</li>
            <li class="${has.p ? "done" : ""}">${has.p ? "✓" : "○"} 介绍</li>
            <li class="${has.price ? "done" : ""}">${has.price ? "✓" : "○"} 价格</li>
            <li class="${has.btn ? "done" : ""}">${has.btn ? "✓" : "○"} 按钮</li>
          </ul>
        </div>
        <div class="preview-card">${html || "<p class='muted'>从左侧点标签，右边实时出现结构。</p>"}</div>
      </div>
      <div class="actions">
        <button class="primary" data-act="complete" data-id="${lesson.id}" ${pass ? "" : "disabled"}>${pass ? "结构齐全，完成本课" : "还差几块"}</button>
      </div>
    `;
  }

  function renderFixGame(lesson, g) {
    if (g.round >= FIX_ROUNDS.length) {
      view().innerHTML = `
        <div class="result">
          <div class="kicker">找出坏标签</div>
          <div class="score">4/4</div>
          <div class="pass" style="color:var(--ok)">四处都修好了</div>
        </div>
        <button class="primary" data-act="complete" data-id="${lesson.id}">完成本课</button>
      `;
      return;
    }
    const round = FIX_ROUNDS[g.round];
    view().innerHTML = `
      <div class="game-head">
        <p class="muted">${g.round + 1}/4 · ${escapeHtml(round.title)}</p>
        <h2>先点出坏掉的那一行</h2>
      </div>
      <div class="card" style="padding:8px;margin-bottom:12px">
        ${round.lines.map((line, i) => `
          <button class="code-line ${g.pickedLine === i ? "on" : ""}" data-act="fix-line" data-index="${i}">
            <span class="n">${i + 1}</span><code>${escapeHtml(line)}</code>
          </button>`).join("")}
      </div>
      ${g.pickedLine === round.bad ? `
        <p class="muted" style="margin-bottom:8px">选一个修法</p>
        <div class="choices">
          ${round.options.map((opt, i) => `<button class="choice" data-act="fix-answer" data-index="${i}">${escapeHtml(opt)}</button>`).join("")}
        </div>` : g.pickedLine >= 0 ? `<p class="empty">这行没问题。再找找嵌套、属性和列表。</p>` : ""}
    `;
  }

  function renderBoxGame(lesson, g) {
    if (g.round >= BOX_CHALLENGES.length) {
      view().innerHTML = `
        <div class="result">
          <div class="kicker">盒模型实验室</div>
          <div class="score">3/3</div>
          <div class="pass" style="color:var(--ok)">尺寸已经对齐</div>
        </div>
        <button class="primary" data-act="complete" data-id="${lesson.id}">完成本课</button>
      `;
      return;
    }
    const challenge = BOX_CHALLENGES[g.round];
    const v = g.values;
    const outer = v.content + v.padding * 2 + v.border * 2 + v.margin * 2;
    const matched = ["content", "padding", "border", "margin"].every((key) => Math.abs(v[key] - challenge.target[key]) <= 1);
    view().innerHTML = `
      <div class="game-head">
        <p class="muted">${g.round + 1}/3 · ${escapeHtml(challenge.title)}</p>
        <h2>目标 ${challenge.target.content}+${challenge.target.padding}+${challenge.target.border}+${challenge.target.margin}</h2>
      </div>
      <div class="lab">
        <div class="box-visual" style="padding:${v.margin}px">
          <div class="b" style="border-width:${v.border}px">
            <div class="p" style="padding:${v.padding}px">
              <div class="c" style="width:${v.content}px;margin:0 auto">${v.content} / 外沿 ${outer}</div>
            </div>
          </div>
        </div>
        <div class="sliders">
          ${[["content", "内容", 80, 200], ["padding", "内边距", 0, 32], ["border", "边框", 0, 12], ["margin", "外边距", 0, 32]].map(([key, label, min, max]) => `
            <label>${label}<input type="range" min="${min}" max="${max}" value="${v[key]}" data-act="box-set" data-key="${key}"><span>${v[key]}</span></label>
          `).join("")}
        </div>
      </div>
      <button class="primary" data-act="box-next" ${matched ? "" : "disabled"}>${matched ? "对齐了，下一题" : "还没对齐目标"}</button>
    `;
  }

  function startExam(id) {
    const exam = examById(id);
    if (!exam) return go("#/exams");
    state.exam = {
      id,
      index: 0,
      answers: {},
      remaining: exam.minutes * 60,
      submitted: false,
      last: performance.now()
    };
    renderExam();
  }

  function currentQuestion() {
    const exam = examById(state.exam.id);
    return exam.questions[state.exam.index];
  }

  function selectedSet(question) {
    const value = state.exam.answers[question.id];
    if (question.type === "multi") return new Set(value || []);
    if (value === undefined) return new Set();
    return new Set([value]);
  }

  function renderExam() {
    const exam = examById(state.exam.id);
    const q = currentQuestion();
    const selected = selectedSet(q);
    const mm = String(Math.floor(state.exam.remaining / 60)).padStart(2, "0");
    const ss = String(state.exam.remaining % 60).padStart(2, "0");
    setTop(exam.title, true);
    const options = q.type === "judge" ? ["正确", "错误"] : q.options;
    const picked = (i) => {
      if (q.type === "multi") return selected.has(i);
      if (q.type === "judge") return (state.exam.answers[q.id] === true && i === 0) || (state.exam.answers[q.id] === false && i === 1);
      return selected.has(i);
    };
    view().innerHTML = `
      <div class="exam-top">
        <span>${state.exam.index + 1} / ${exam.questions.length}${q.type === "multi" ? " · 多选" : ""}</span>
        <span>${mm}:${ss}</span>
      </div>
      <div class="bar"><i style="width:${((state.exam.index) / exam.questions.length) * 100}%"></i></div>
      <h2 class="stem">${escapeHtml(q.stem)}</h2>
      <div>
        ${options.map((opt, i) => `
          <button class="opt ${picked(i) ? "on" : ""}" data-act="pick" data-index="${i}">
            <i>${LETTERS[i]}</i><span>${escapeHtml(opt)}</span>
          </button>`).join("")}
      </div>
      <div class="actions">
        <button class="primary" data-act="exam-next">${state.exam.index === exam.questions.length - 1 ? "交卷" : "下一题"}</button>
        ${state.exam.index ? `<button class="ghost" data-act="exam-prev">上一题</button>` : ""}
      </div>
    `;
  }

  function judgeAnswer(question, value) {
    if (question.type === "multi") {
      const a = (value || []).slice().sort().join(",");
      const b = question.answer.slice().sort().join(",");
      return a === b;
    }
    if (question.type === "judge") return value === question.answer;
    return value === question.answer;
  }

  function gradeExam() {
    const exam = examById(state.exam.id);
    let correct = 0;
    const wrong = [];
    exam.questions.forEach((question) => {
      const ok = judgeAnswer(question, state.exam.answers[question.id]);
      if (ok) correct += 1;
      else wrong.push({ examId: exam.id, id: question.id, stem: question.stem, explain: question.explain });
    });
    const score = Math.round((correct / exam.questions.length) * 100);
    const record = { score, at: Date.now(), correct, total: exam.questions.length };
    const logs = state.progress.examHistory[exam.id] || [];
    logs.unshift(record);
    state.progress.examHistory[exam.id] = logs.slice(0, 8);
    const map = new Map(state.progress.wrong.map((item) => [item.id, item]));
    wrong.forEach((item) => map.set(item.id, item));
    if (score >= exam.pass) {
      wrong.forEach((item) => map.delete(item.id));
    }
    state.progress.wrong = Array.from(map.values());
    state.exam.result = { score, correct, total: exam.questions.length, pass: score >= exam.pass, wrong };
    touchStreak();
    save();
    go(`#/exam/${exam.id}/result`);
  }

  function renderResult() {
    const exam = examById(state.route.id);
    const result = state.exam?.id === exam.id ? state.exam.result : null;
    const best = bestScore(exam.id);
    const score = result?.score ?? best;
    const pass = score >= exam.pass;
    setTop(exam.title, true);
    view().innerHTML = `
      <div class="result">
        <div class="kicker">${pass ? "通过" : "未通过"}</div>
        <div class="score">${score < 0 ? "--" : score}</div>
        <div class="pass" style="color:${pass ? "var(--ok)" : "var(--bad)"}">${pass ? `达到 ${exam.pass} 分` : `还需 ${exam.pass} 分`}</div>
        <p class="muted">${result ? `对 ${result.correct} / ${result.total}` : "这是历史最好成绩。点下方重考。"}</p>
      </div>
      ${result?.wrong?.length ? `<div class="sec-title"><h3>错题解析</h3></div>${result.wrong.map((item) =>
        `<div class="card lesson-card"><strong>${escapeHtml(item.stem)}</strong><p class="muted">${escapeHtml(item.explain)}</p></div>`).join("")}` : ""}
      <button class="primary" data-act="go" data-hash="#/exam/${exam.id}">再考一次</button>
      <button class="ghost" data-act="go" data-hash="#/exams">返回考试列表</button>
    `;
  }

  function pickOption(index) {
    const q = currentQuestion();
    const i = Number(index);
    if (q.type === "multi") {
      const cur = new Set(state.exam.answers[q.id] || []);
      if (cur.has(i)) cur.delete(i);
      else cur.add(i);
      state.exam.answers[q.id] = Array.from(cur);
    } else if (q.type === "judge") {
      state.exam.answers[q.id] = i === 0;
    } else {
      state.exam.answers[q.id] = i;
    }
    renderExam();
  }

  function render() {
    if (state.video && state.route.name !== "lesson") state.video.playing = false;
    const route = state.route;
    if (route.name === "home") return renderHome();
    if (route.name === "learn") return renderLearn(route.type);
    if (route.name === "exams") return renderExams();
    if (route.name === "me") return renderMe();
    if (route.name === "lesson") return openLesson(route.id);
    if (route.name === "exam") return startExam(route.id);
    if (route.name === "result") return renderResult();
    renderHome();
  }

  function onRoute() {
    const prev = state.route;
    state.route = parseHash();
    if (prev.name === "exam" && state.route.name === "exam" && prev.id === state.route.id && state.exam) {
      renderExam();
      return;
    }
    if (state.route.name !== "exam") state.exam = state.route.name === "result" ? state.exam : null;
    render();
  }

  function onClick(event) {
    const btn = event.target.closest("[data-act]");
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    if (act === "go") return go(btn.dataset.hash);
    if (act === "open-lesson") return go(`#/lesson/${btn.dataset.id}`);
    if (act === "complete") {
      const lesson = lessonById(btn.dataset.id);
      if (lesson?.type === "video") {
        const total = videoTotal(lesson);
        if (state.video && state.video.t < total - 0.8 && !isDone(lesson.id)) return;
      }
      if (lesson?.type === "game" && lesson.game === "card") {
        const html = state.game.parts.join("");
        if (!(/<h2/.test(html) && /<p/.test(html) && /price/.test(html) && /<button/.test(html))) return;
      }
      completeLesson(btn.dataset.id);
      const items = lessonsIn(lesson.track);
      const following = items[items.findIndex((item) => item.id === lesson.id) + 1];
      if (following) return go(`#/lesson/${following.id}`);
      const exam = DATA.exams.find((item) => item.track === lesson.track);
      if (exam && bestScore(exam.id) < exam.pass) return go(`#/exam/${exam.id}`);
      return go("#/home");
    }
    if (act === "video-toggle" && state.video) {
      state.video.playing = !state.video.playing;
      state.video.last = performance.now();
      return renderVideo();
    }
    if (act === "video-speed" && state.video) {
      const speeds = [1, 1.5, 2, 0.75];
      state.video.speed = speeds[(speeds.indexOf(state.video.speed) + 1) % speeds.length];
      return renderVideo();
    }
    if (act === "video-skip" && state.video) {
      const lesson = lessonById(state.video.id);
      state.video.t = Math.max(0, Math.min(videoTotal(lesson), state.video.t + Number(btn.dataset.delta)));
      return renderVideo();
    }
    if (act === "video-scene" && state.video) {
      const lesson = lessonById(state.video.id);
      let t = 0;
      for (let i = 0; i < Number(btn.dataset.index); i += 1) t += lesson.scenes[i].duration;
      state.video.t = t;
      return renderVideo();
    }
    if (act === "scrub" && state.video) {
      const rect = btn.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      state.video.t = ratio * videoTotal(lessonById(state.video.id));
      return renderVideo();
    }
    if (act === "tag-answer" && state.game?.kind === "tags" && !state.game.locked) {
      const current = state.game.queue[state.game.n];
      const ok = btn.dataset.value === current.meaning;
      if (ok) state.game.score += 1;
      state.game.locked = true;
      btn.classList.add(ok ? "ok" : "bad");
      setTimeout(() => {
        state.game.n += 1;
        state.game.locked = false;
        renderGame();
      }, 260);
      return;
    }
    if (act === "retry-game") return startGame(lessonById(btn.dataset.id));
    if (act === "card-add") {
      const tool = CARD_TOOLS.find((item) => item.id === btn.dataset.id);
      if (tool) state.game.parts.push(tool.html);
      return renderGame();
    }
    if (act === "card-undo") {
      state.game.parts.pop();
      return renderGame();
    }
    if (act === "fix-line") {
      state.game.pickedLine = Number(btn.dataset.index);
      return renderGame();
    }
    if (act === "fix-answer") {
      const round = FIX_ROUNDS[state.game.round];
      if (Number(btn.dataset.index) === round.answer) {
        state.game.round += 1;
        state.game.pickedLine = -1;
      } else {
        btn.classList.add("bad");
        return;
      }
      return renderGame();
    }
    if (act === "box-next") {
      state.game.round += 1;
      return renderGame();
    }
    if (act === "pick") return pickOption(btn.dataset.index);
    if (act === "exam-next") {
      const exam = examById(state.exam.id);
      if (state.exam.index >= exam.questions.length - 1) return gradeExam();
      state.exam.index += 1;
      return renderExam();
    }
    if (act === "exam-prev") {
      state.exam.index = Math.max(0, state.exam.index - 1);
      return renderExam();
    }
    if (act === "practice-wrong") {
      const item = state.progress.wrong[Number(btn.dataset.index)];
      if (item?.examId) return go(`#/exam/${item.examId}`);
      return;
    }
    if (act === "reset") {
      if (!confirm("清除本机学习进度、考试记录和错题本？")) return;
      state.progress = defaults();
      save();
      return renderMe();
    }
  }

  function onInput(event) {
    const el = event.target.closest("[data-act='box-set']");
    if (!el || !state.game || state.game.kind !== "box") return;
    state.game.values[el.dataset.key] = Number(el.value);
    const v = state.game.values;
    const outer = v.content + v.padding * 2 + v.border * 2 + v.margin * 2;
    const label = el.parentElement.querySelector("span");
    if (label) label.textContent = el.value;
    const visual = view().querySelector(".box-visual");
    if (visual) {
      visual.style.padding = `${v.margin}px`;
      const border = visual.querySelector(".b");
      const pad = visual.querySelector(".p");
      const content = visual.querySelector(".c");
      if (border) border.style.borderWidth = `${v.border}px`;
      if (pad) pad.style.padding = `${v.padding}px`;
      if (content) {
        content.style.width = `${v.content}px`;
        content.textContent = `${v.content} / 外沿 ${outer}`;
      }
    }
    const challenge = BOX_CHALLENGES[state.game.round];
    const matched = ["content", "padding", "border", "margin"].every((key) => Math.abs(v[key] - challenge.target[key]) <= 1);
    const next = view().querySelector("[data-act='box-next']");
    if (next) {
      next.disabled = !matched;
      next.textContent = matched ? "对齐了，下一题" : "还没对齐目标";
    }
  }

  function onKey(event) {
    if (state.route.name !== "exam" || !state.exam) return;
    const q = currentQuestion();
    const max = (q.type === "judge" ? 2 : q.options.length) - 1;
    if (event.key >= "1" && event.key <= "4") {
      const i = Number(event.key) - 1;
      if (i <= max) pickOption(i);
    }
    if (event.key === "Enter") {
      const exam = examById(state.exam.id);
      if (state.exam.index >= exam.questions.length - 1) gradeExam();
      else {
        state.exam.index += 1;
        renderExam();
      }
    }
  }

  function loop(now) {
    if (state.exam && state.route.name === "exam") {
      const dt = (now - state.exam.last) / 1000;
      if (dt >= 1) {
        state.exam.remaining = Math.max(0, state.exam.remaining - Math.floor(dt));
        state.exam.last = now;
        if (state.exam.remaining === 0) gradeExam();
        else {
          const clock = view().querySelector(".exam-top span:last-child");
          if (clock) {
            const mm = String(Math.floor(state.exam.remaining / 60)).padStart(2, "0");
            const ss = String(state.exam.remaining % 60).padStart(2, "0");
            clock.textContent = `${mm}:${ss}`;
          }
        }
      }
    }
    tickVideo(now);
    requestAnimationFrame(loop);
  }

  function init() {
    setTheme(state.theme);
    document.getElementById("back-btn").innerHTML = svgIcon("back");
    document.getElementById("theme-btn").innerHTML = state.theme === "dark" ? svgIcon("sun") : svgIcon("moon");
    document.getElementById("tab-home").innerHTML = `${svgIcon("home")}<span>首页</span>`;
    document.getElementById("tab-learn").innerHTML = `${svgIcon("learn")}<span>课程</span>`;
    document.getElementById("tab-exams").innerHTML = `${svgIcon("exam")}<span>考试</span>`;
    document.getElementById("tab-me").innerHTML = `${svgIcon("me")}<span>我的</span>`;

    document.getElementById("back-btn").addEventListener("click", () => history.back());
    document.getElementById("theme-btn").addEventListener("click", () => {
      const next = state.theme === "dark" ? "light" : "dark";
      setTheme(next);
      document.getElementById("theme-btn").innerHTML = next === "dark" ? svgIcon("sun") : svgIcon("moon");
    });
    document.getElementById("app").addEventListener("click", onClick);
    document.getElementById("app").addEventListener("input", onInput);
    window.addEventListener("hashchange", onRoute);
    window.addEventListener("keydown", onKey);
    onRoute();
    Live.connect();
    requestAnimationFrame(loop);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
