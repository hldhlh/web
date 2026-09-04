(() => {
  const DATA = window.ACADEMY_CONTENT;
  const Auth = window.AcademyAuth;
  const Gate = window.AcademyGate;

  const LETTERS = "ABCDEFGH";

  const TYPE_LABEL = { article: "图文", video: "视频" };
  const DROPPED_LESSON_IDS = new Set(["a-html-what", "g-tags", "v-html-page", "a-tags", "g-card", "g-fix", "v-css", "g-box"]);
  const DROPPED_EXAM_IDS = new Set(["e-html"]);
  const BUNDLED_LESSON_IDS = new Set(["a-day", "a-product", "v-order", "a-safety", "a-tools"]);
  const BUNDLED_EXAM_IDS = new Set(["e-onboard", "e-mix"]);

  const state = {
    route: { name: "home" },
    theme: localStorage.getItem("app-theme") || "light",
    progress: loadProgress(),
    exam: null,
    video: null,
    game: null,
    tick: 0
  };
  const OPS_STORAGE_KEY = "academy-ops-content-v1";
  const OPS_LESSON_DRAFT_KEY = "academy-ops-lesson-draft-v1";
  const OPS_TABS = ["lessons", "exams", "notices", "staff"];
  const NAVIGATION_STATE_KEY = "academyNavigation";
  let contentRevision = 0;

  const view = () => document.getElementById("view");

  function coerceId(prefix, value) {
    const raw = String(value || "").trim();
    if (raw) return raw;
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function coerceNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, n) : fallback;
  }

  function coerceString(value, fallback) {
    const text = String(value || "").trim();
    return text || fallback;
  }

  function normalizeTrack(track) {
    return DATA.tracks.some((item) => item.id === track) ? track : "onboard";
  }

  function normalizeLessonType(type) {
    return ["article", "video"].includes(type) ? type : "article";
  }

  function defaultCourseGroups() {
    return DATA.tracks.map((track, index) => ({
      id: coerceId("group", track.id),
      name: coerceString(track.title, `课程分组 ${index + 1}`)
    }));
  }

  function normalizeCourseGroups(items) {
    const source = Array.isArray(items) && items.length ? items : defaultCourseGroups();
    const seen = new Set();
    return source.map((item, index) => ({
      id: coerceId("group", item?.id),
      name: coerceString(item?.name || item?.title, `课程分组 ${index + 1}`)
    })).filter((item) => !seen.has(item.id) && seen.add(item.id));
  }

  function normalizeLessonGroupIds(groupIds, fallbackTrack = "onboard") {
    const source = Array.isArray(groupIds) && groupIds.length ? groupIds : [fallbackTrack];
    return Array.from(new Set(source.map((id) => coerceString(id, "")).filter(Boolean)));
  }

  function defaultBlocks(summary) {
    return [{ type: "lead", text: coerceString(summary, "本课内容正在准备中。"), }];
  }

  function defaultScenes(mediaUrl) {
    const mediaStage = mediaUrl ? {
      kind: "media",
      src: mediaUrl,
      caption: "课程视频",
      text: "看完视频，掌握本课重点"
    } : {
      kind: "callout",
      kicker: "准备中",
      text: "本课内容正在准备中"
    };
    return [{ duration: 120, title: "课程内容", caption: "本课内容正在准备中。", stage: mediaStage }];
  }

  function normalizeLesson(item) {
    const type = normalizeLessonType(item.type);
    const track = normalizeTrack(item.track);
    const blocks = (Array.isArray(item.blocks) && item.blocks.length)
      ? item.blocks
      : defaultBlocks(item.summary);
    const scenes = (Array.isArray(item.scenes) && item.scenes.length)
      ? item.scenes
      : (type === "video" ? defaultScenes(item.mediaUrl) : []);
    return {
      id: coerceId("lesson", item.id),
      type,
      track,
      groupIds: normalizeLessonGroupIds(item.groupIds, track),
      title: coerceString(item.title, "未命名课程"),
      minutes: Math.max(1, Math.round(coerceNumber(item.minutes, 3))),
      summary: coerceString(item.summary, "课程内容待完善。"),
      access: item.access === "basic" ? "basic" : "full",
      mediaUrl: coerceString(item.mediaUrl, ""),
      publishedAt: coerceNumber(item.publishedAt, 0),
      notify: item.notify !== false,
      requiredExamId: coerceString(item.requiredExamId, ""),
      requireConfirmation: item.requireConfirmation !== false,
      blocks,
      scenes
    };
  }

  function parseJSONArray(raw) {
    try {
      const list = JSON.parse(coerceString(raw, "[]"));
      return Array.isArray(list) ? list : null;
    } catch {
      return null;
    }
  }

  function validateVideoFile(file) {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      throw new Error("只能上传视频文件（MP4、MOV、WebM 等）。");
    }
    if (file.size > 200 * 1024 * 1024) {
      throw new Error("视频超过 200MB，请先压缩后再上传。");
    }
  }

  function storagePublicUrl(path, version = Date.now()) {
    const cfg = window.ACADEMY_CONFIG;
    const encodedPath = String(path).split("/").map(encodeURIComponent).join("/");
    return `${cfg.url}/storage/v1/object/public/${encodeURIComponent(cfg.bucket)}/${encodedPath}?v=${version}`;
  }

  function uploadLessonVideo(file, lessonId, onProgress) {
    validateVideoFile(file);
    const cfg = window.ACADEMY_CONFIG;
    if (!cfg?.url || !cfg?.key || !cfg?.bucket) throw new Error("视频服务暂不可用，请稍后重试。");
    if (!window.tus?.Upload) throw new Error("上传服务尚未就绪，请刷新页面后重试。");

    const safeLessonId = String(lessonId || "lesson").replace(/[^a-zA-Z0-9_-]/g, "-");
    const objectPath = `academy/videos/${safeLessonId}`;
    const uploadOrigin = window.APP_NETWORK?.origin || cfg.url;
    return new Promise((resolve, reject) => {
      const upload = new window.tus.Upload(file, {
        endpoint: `${uploadOrigin}/storage/v1/upload/resumable`,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        headers: {
          apikey: cfg.key,
          authorization: `Bearer ${cfg.key}`,
          "x-upsert": "true"
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024,
        metadata: {
          bucketName: cfg.bucket,
          objectName: objectPath,
          contentType: file.type || "video/mp4",
          cacheControl: 3600
        },
        onProgress(bytesUploaded, bytesTotal) {
          const percent = bytesTotal ? Math.min(100, Math.round((bytesUploaded / bytesTotal) * 100)) : 0;
          onProgress?.(percent, bytesUploaded, bytesTotal);
        },
        onError(error) {
          reject(new Error(error?.message || "视频上传失败，请检查网络后重试。"));
        },
        onSuccess() {
          resolve(storagePublicUrl(objectPath));
        }
      });
      upload.start();
    });
  }

  function normalizeQuestion(question, index) {
    const type = ["single", "judge", "multi"].includes(question.type) ? question.type : "single";
    const stem = coerceString(question.stem, `第 ${index + 1} 题请补充内容`);
    const explain = coerceString(question.explain, "暂无解析。");
    if (type === "judge") {
      return {
        id: coerceId("q", question.id),
        type,
        stem,
        answer: typeof question.answer === "boolean" ? question.answer : true,
        explain
      };
    }
    const options = Array.isArray(question.options) && question.options.length ? question.options.map((option) => coerceString(option, "选项")) : ["是", "否"];
    return {
      id: coerceId("q", question.id),
      type,
      stem,
      options,
      answer: type === "multi" ? (Array.isArray(question.answer) ? question.answer : [0]) : Math.min(options.length - 1, Math.max(0, Number(question.answer) || 0)),
      explain
    };
  }

  function normalizeExam(item) {
    const questions = Array.isArray(item.questions) ? item.questions.map(normalizeQuestion) : [];
    return {
      id: coerceId("exam", item.id),
      title: coerceString(item.title, "未命名考试"),
      track: normalizeTrack(item.track),
      minutes: Math.max(1, Math.round(coerceNumber(item.minutes, 8))),
      pass: Math.max(1, Math.min(100, Math.round(coerceNumber(item.pass, 80)))),
      summary: coerceString(item.summary, "考试内容正在准备中。"),
      publishedAt: coerceNumber(item.publishedAt, 0),
      notify: item.notify !== false,
      questions
    };
  }

  function normalizeNoticeAudience(audience) {
    const mode = ["all", "staff", "manager", "selected"].includes(audience?.mode) ? audience.mode : "all";
    const userIds = Array.isArray(audience?.userIds)
      ? Array.from(new Set(audience.userIds.map((id) => coerceString(id, "")).filter(Boolean)))
      : [];
    return { mode, userIds };
  }

  function noticeVisibleTo(notice, user = Auth.session) {
    if (!user || user.access === "blocked") return false;
    const audience = normalizeNoticeAudience(notice?.audience);
    if (audience.mode === "all") return true;
    if (audience.mode === "staff") return user.role !== "manager";
    if (audience.mode === "manager") return user.role === "manager";
    return audience.userIds.includes(user.id);
  }

  function noticeAudienceLabel(notice) {
    const audience = normalizeNoticeAudience(notice?.audience);
    if (audience.mode === "all") return "全体成员";
    if (audience.mode === "staff") return "普通员工";
    if (audience.mode === "manager") return "店长";
    const names = Auth.list()
      .filter((user) => audience.userIds.includes(user.id))
      .map((user) => user.name);
    return names.length ? names.join("、") : "指定成员";
  }

  function normalizeNotice(item) {
    return {
      id: coerceId("notice", item.id),
      tone: item.tone === "urgent" ? "urgent" : "info",
      kicker: coerceString(item.kicker, "运营通知"),
      title: coerceString(item.title, "新消息"),
      detail: coerceString(item.detail || item.content, "请尽快查看。"),
      createdAt: coerceNumber(item.createdAt, Date.now()),
      notify: item.notify !== false,
      audience: normalizeNoticeAudience(item.audience)
    };
  }

  function isDroppedLesson(item) {
    if (!item) return true;
    if (item.track === "html") return true;
    if (item.type === "game") return true;
    return DROPPED_LESSON_IDS.has(item.id);
  }

  function isDroppedExam(item) {
    if (!item) return true;
    if (item.track === "html") return true;
    if (String(item.title || "").trim() === "测试" && /开发者使用/.test(String(item.summary || ""))) return true;
    return DROPPED_EXAM_IDS.has(item.id);
  }

  function isOffTopicQuestion(question) {
    const text = `${question?.stem || ""} ${(question?.options || []).join(" ")} ${question?.explain || ""}`;
    return /\bHTML\b|\bCSS\b|盒模型|DOCTYPE|语义标签|标签的职责|<\/?(html|head|body|div|span|h[1-6]|p|a|img|button|ul|ol|li|input|label|header)\b/i.test(text);
  }

  function rebuildMixExam(exams) {
    const mix = exams.find((item) => item.id === "e-mix");
    if (!mix) return exams;
    const source = exams.filter((item) => item.id !== "e-mix");
    mix.summary = "开市、锅底、出品、卫生、门店工具。按正式考试节奏计时。";
    const extras = (DATA.exams.find((item) => item.id === "e-mix")?.questions || []).filter((question) => /^m\d/.test(question.id));
    const fromSource = source.flatMap((exam) => exam.questions || []);
    mix.questions = fromSource.concat(extras.filter((extra) => !fromSource.some((question) => question.id === extra.id)));
    return exams;
  }

  function stripUnrelatedCurriculum(snapshot) {
    const lessons = snapshot.lessons.filter((item) => !isDroppedLesson(item));
    const exams = rebuildMixExam(
      snapshot.exams
        .filter((item) => !isDroppedExam(item))
        .map((exam) => ({
          ...exam,
          questions: (exam.questions || []).filter((question) => !isOffTopicQuestion(question))
        }))
    );
    return { ...snapshot, lessons, exams };
  }

  function loadOpsStore() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(OPS_STORAGE_KEY) || "null"); } catch (_) { }
    contentRevision = Number(raw?.rev) || 0;
    const courseGroups = normalizeCourseGroups(raw?.courseGroups || DATA.courseGroups);
    const fallbackLessons = DATA.lessons.filter((item) => !isDroppedLesson(item)).map(normalizeLesson);
    const fallbackExams = rebuildMixExam(DATA.exams.filter((item) => !isDroppedExam(item)).map(normalizeExam));
    const lessons = Array.isArray(raw?.lessons)
      ? raw.lessons.filter((item) => !isDroppedLesson(item)).map(normalizeLesson)
      : fallbackLessons;
    const exams = Array.isArray(raw?.exams)
      ? raw.exams
        .filter((item) => !isDroppedExam(item))
        .map(normalizeExam)
        .map((exam) => ({
          ...exam,
          questions: (exam.questions || []).filter((question) => !isOffTopicQuestion(question))
        }))
      : fallbackExams;
    const notices = Array.isArray(raw?.notices) ? raw.notices.map(normalizeNotice) : [];
    return {
      courseGroups,
      lessons,
      exams: rebuildMixExam(exams),
      notices
    };
  }

  function hydrateContentStore() {
    const before = (() => {
      try { return localStorage.getItem(OPS_STORAGE_KEY) || ""; } catch (_) { return ""; }
    })();
    const snapshot = stripUnrelatedCurriculum(loadOpsStore());
    DATA.courseGroups = snapshot.courseGroups;
    DATA.lessons = snapshot.lessons;
    DATA.exams = snapshot.exams;
    DATA.notices = snapshot.notices;
    if (before) {
      const afterIds = JSON.stringify({
        lessons: DATA.lessons.map((item) => item.id),
        exams: DATA.exams.map((item) => item.id)
      });
      let beforeIds = "";
      try {
        const parsed = JSON.parse(before);
        beforeIds = JSON.stringify({
          lessons: (parsed.lessons || []).map((item) => item.id),
          exams: (parsed.exams || []).map((item) => item.id)
        });
      } catch (_) { }
      if (beforeIds !== afterIds) saveOpsStore();
    }
  }

  function saveOpsStore() {
    const payload = {
      rev: contentRevision,
      updatedAt: Date.now(),
      courseGroups: DATA.courseGroups,
      lessons: DATA.lessons,
      exams: DATA.exams,
      notices: DATA.notices
    };
    localStorage.setItem(OPS_STORAGE_KEY, JSON.stringify(payload));
  }

  function canonicalOpsSection(section) {
    return OPS_TABS.includes(section) ? section : "lessons";
  }

  function canonicalOpsMode(mode) {
    return mode === "add" || mode === "edit" ? mode : "list";
  }

  function opsStore(section) {
    if (section === "lessons") return DATA.lessons;
    if (section === "exams") return DATA.exams;
    if (section === "notices") return DATA.notices;
    return [];
  }

  function currentOpsRoute() {
    return {
      section: canonicalOpsSection(state.route?.section),
      mode: canonicalOpsMode(state.route?.mode),
      id: coerceString(state.route?.id, "")
    };
  }

  function lessonDraftIdentity() {
    const route = currentOpsRoute();
    if (state.route?.name !== "ops" || route.section !== "lessons" || !["add", "edit"].includes(route.mode)) return "";
    return `${Auth.session?.id || "anonymous"}:${route.mode}:${route.id || "new"}`;
  }

  function loadLessonDraft() {
    const identity = lessonDraftIdentity();
    if (!identity) return null;
    try {
      const draft = JSON.parse(sessionStorage.getItem(OPS_LESSON_DRAFT_KEY) || "null");
      return draft?.identity === identity && draft.data && typeof draft.data === "object" ? draft.data : null;
    } catch (_) {
      return null;
    }
  }

  function saveLessonDraft() {
    const identity = lessonDraftIdentity();
    const form = document.getElementById("ops-editor");
    if (!identity || !form?.classList.contains("lesson-editor")) return;
    const blocks = collectLessonBlocksFromBuilder();
    const scenes = parseLessonScenes(document.getElementById("ops-lesson-scenes")?.value);
    if (blocks === null || scenes === null) return;
    const data = {
      title: document.getElementById("ops-lesson-title")?.value || "",
      summary: document.getElementById("ops-lesson-summary")?.value || "",
      type: document.getElementById("ops-lesson-type")?.value || "article",
      track: document.getElementById("ops-lesson-track")?.value || "onboard",
      groupIds: Array.from(document.querySelectorAll('input[name="ops-lesson-groups"]:checked')).map((input) => input.value),
      minutes: document.getElementById("ops-lesson-minutes")?.value || "3",
      access: document.getElementById("ops-lesson-access")?.value || "full",
      mediaUrl: document.getElementById("ops-lesson-media-url")?.value || "",
      requiredExamId: document.getElementById("ops-lesson-required-exam")?.value || "",
      requireConfirmation: Boolean(document.getElementById("ops-lesson-require-confirmation")?.checked),
      notify: document.getElementById("ops-lesson-notify")?.checked !== false,
      blocks,
      scenes
    };
    try { sessionStorage.setItem(OPS_LESSON_DRAFT_KEY, JSON.stringify({ identity, data })); } catch (_) { }
  }

  function clearLessonDraft() {
    try { sessionStorage.removeItem(OPS_LESSON_DRAFT_KEY); } catch (_) { }
  }

  hydrateContentStore();

  function defaults() {
    return {
      completed: {},
      examHistory: {},
      wrong: [],
      minutes: 0,
      onlineSeconds: 0,
      lastSeenAt: 0,
      last: null,
      streakDate: "",
      streak: 0,
      readMessages: {}
    };
  }

  function progressTable() {
    return window.ACADEMY_CONFIG?.table || "academy_progress";
  }

  function loadProgress() {
    try {
      const id = Auth.session?.id;
      if (!id) return defaults();
      return normalizeProgress(JSON.parse(localStorage.getItem(`academy-progress-cache-${id}`) || "{}"));
    } catch (_) {
      return defaults();
    }
  }

  function normalizeProgress(raw) {
    const next = Object.assign(defaults(), raw && typeof raw === "object" ? raw : {});
    next.onlineSeconds = Math.max(Number(next.onlineSeconds) || 0, (Number(next.minutes) || 0) * 60);
    next.minutes = Math.floor(next.onlineSeconds / 60);
    next.lastSeenAt = Number(next.lastSeenAt) || 0;
    next.streak = Number(next.streak) || 0;
    if (!next.completed || typeof next.completed !== "object") next.completed = {};
    if (!next.examHistory || typeof next.examHistory !== "object") next.examHistory = {};
    if (!Array.isArray(next.wrong)) next.wrong = [];
    if (!next.readMessages || typeof next.readMessages !== "object" || Array.isArray(next.readMessages)) next.readMessages = {};
    return next;
  }

  const Live = {
    sb: null,
    channel: null,
    skipUntil: 0,
    timer: 0,
    poll: 0,
    rev: 0,
    socketLive: false,
    reconnectTimer: 0,
    reconnectAttempt: 0,
    connecting: false,
    hydrated: false,
    statusTimer: 0,
    setStatus(name, label) {
      const el = document.getElementById("live-status");
      if (!el) return;
      el.dataset.state = name;
      el.textContent = label;
      if (name !== "connecting") {
        clearTimeout(this.statusTimer);
        this.statusTimer = 0;
        return;
      }
      if (this.statusTimer) return;
      this.statusTimer = setTimeout(() => {
        this.statusTimer = 0;
        const current = document.getElementById("live-status");
        if (current?.dataset.state === "connecting") {
          this.setStatus(navigator.onLine ? "online" : "offline", navigator.onLine ? "在线同步" : "离线可用");
          this.startPoll();
          this.scheduleReconnect();
        }
      }, 6000);
    },
    realtimeOrigin() {
      return window.APP_NETWORK?.projectOrigin || window.ACADEMY_CONFIG.url;
    },
    table() {
      return progressTable();
    },
    applyRow(row) {
      if (!row || typeof row !== "object") return false;
      const ts = Number(row.ts) || 0;
      if (ts && ts < this.rev) return false;
      const next = row.payload && typeof row.payload === "object" ? row.payload : null;
      if (!next) return false;
      this.rev = ts || Date.now();
      state.progress = normalizeProgress(next);
      try { localStorage.setItem(`academy-progress-cache-${Auth.session?.id}`, JSON.stringify(state.progress)); } catch (_) { }
      return true;
    },
    ingestStaff(row) {
      if (!row?.user_id) return;
      const progress = normalizeProgress(row.payload);
      StaffProgress.rows.set(row.user_id, {
        progress,
        lastSeenAt: Number(progress.lastSeenAt) || Number(row.ts) || 0,
        available: true
      });
      if (state.route?.name === "ops" && currentOpsRoute().section === "staff") renderOps();
    },
    refreshView() {
      const stay = state.route?.name;
      const editingOps = stay === "ops" && ["add", "edit"].includes(currentOpsRoute().mode);
      if (editingOps) {
        updateNotificationButton();
        return;
      }
      if (stay === "home" || stay === "messages" || stay === "learn" || stay === "exams" || stay === "me" || stay === "result" || stay === "ops") {
        render();
      } else {
        updateNotificationButton();
      }
    },
    async pull() {
      const id = Auth.session?.id;
      if (!id) return false;
      const rows = await window.AcademyStore.restSelect(this.table(), {
        select: "user_id,payload,ts,updated_at",
        user_id: `eq.${id}`
      });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return true;
      if (this.applyRow(row)) this.refreshView();
      return true;
    },
    async persist(row) {
      return window.AcademyStore.restUpsert(this.table(), row, "user_id");
    },
    push() {
      if (!this.hydrated || !Auth.session?.id) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), 50);
    },
    async flush() {
      const id = Auth.session?.id;
      if (!this.hydrated || !id) return;
      const ts = Date.now();
      this.skipUntil = ts + 800;
      this.rev = ts;
      try {
        const ok = await this.persist({
          user_id: id,
          payload: state.progress,
          ts,
          updated_at: new Date().toISOString()
        });
        try { localStorage.setItem(`academy-progress-cache-${id}`, JSON.stringify(state.progress)); } catch (_) { }
        if (this.socketLive) this.setStatus("live", "实时在线");
        else if (ok) this.setStatus("online", "在线同步");
        else this.setStatus(navigator.onLine ? "connecting" : "offline", navigator.onLine ? "正在重连" : "离线可用");
      } catch (_) {
        this.setStatus(this.socketLive ? "live" : navigator.onLine ? "connecting" : "offline", this.socketLive ? "实时在线" : navigator.onLine ? "正在重连" : "离线可用");
        if (!this.socketLive) this.scheduleReconnect();
      }
    },
    startPoll() {
      if (this.poll) return;
      const check = () => this.pull().then((ok) => {
        if (!this.socketLive) {
          this.setStatus(ok ? "online" : navigator.onLine ? "connecting" : "offline", ok ? "在线同步" : navigator.onLine ? "正在重连" : "离线可用");
          this.scheduleReconnect();
        }
      }).catch(() => {
        if (!this.socketLive) {
          this.setStatus(navigator.onLine ? "connecting" : "offline", navigator.onLine ? "正在重连" : "离线可用");
          this.scheduleReconnect();
        }
      });
      check();
      this.poll = setInterval(check, 5000);
    },
    stopPoll() {
      if (!this.poll) return;
      clearInterval(this.poll);
      this.poll = 0;
    },
    scheduleReconnect(immediate) {
      if (!Auth.session || this.socketLive || this.reconnectTimer) return;
      const delay = immediate
        ? 180
        : Math.min(30000, 700 * (2 ** Math.min(this.reconnectAttempt, 5))) + Math.round(Math.random() * 300);
      this.reconnectAttempt += 1;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = 0;
        this.connect();
      }, delay);
    },
    subscribe() {
      const channel = this.sb.channel("academy-progress-live");
      this.channel = channel;
      channel.on("postgres_changes", { event: "*", schema: "public", table: this.table() }, ({ eventType, new: row, old: prev }) => {
        const record = row && Object.keys(row).length ? row : prev;
        if (!record) return;
        this.ingestStaff(record);
        if (record.user_id !== Auth.session?.id) return;
        if (eventType === "DELETE") {
          state.progress = defaults();
          this.rev = Date.now();
          this.refreshView();
          return;
        }
        if (Date.now() < this.skipUntil) return;
        if (this.applyRow(record)) {
          this.setStatus("live", "实时在线");
          this.refreshView();
        }
      });
      channel.subscribe((status) => {
        if (this.channel !== channel) return;
        if (status === "SUBSCRIBED") {
          this.socketLive = true;
          this.reconnectAttempt = 0;
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = 0;
          this.setStatus("live", "实时在线");
          this.stopPoll();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          this.socketLive = false;
          this.setStatus(navigator.onLine ? "connecting" : "offline", navigator.onLine ? "正在重连" : "离线可用");
          this.startPoll();
          this.scheduleReconnect();
        }
      });
      setTimeout(() => {
        if (this.channel === channel && !this.socketLive) {
          this.setStatus(navigator.onLine ? "online" : "offline", navigator.onLine ? "在线同步" : "离线可用");
          this.startPoll();
          this.scheduleReconnect();
        }
      }, 3500);
    },
    async connect() {
      if (this.connecting || !Auth.session) return;
      this.connecting = true;
      this.hydrated = false;
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = 0;
      this.setStatus(navigator.onLine ? "connecting" : "offline", navigator.onLine ? "正在连接" : "离线可用");
      this.stopPoll();
      if (this.channel && this.sb) {
        const oldChannel = this.channel;
        this.channel = null;
        this.socketLive = false;
        this.sb.removeChannel(oldChannel);
      }
      try {
        const ok = await this.pull();
        this.hydrated = true;
        this.setStatus(ok ? "connecting" : navigator.onLine ? "connecting" : "offline", ok ? "正在建立实时连接" : navigator.onLine ? "正在重连" : "离线可用");
      } catch (_) {
        this.hydrated = true;
        this.setStatus(navigator.onLine ? "connecting" : "offline", navigator.onLine ? "正在重连" : "离线可用");
      }
      const cfg = window.ACADEMY_CONFIG;
      if (!window.supabase?.createClient || !cfg) {
        this.connecting = false;
        this.startPoll();
        this.scheduleReconnect();
        return;
      }
      this.sb = window.supabase.createClient(this.realtimeOrigin(), cfg.key, {
        appNetworkRealtimeDirect: true,
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 20 } }
      });
      this.connecting = false;
      this.subscribe();
    }
  };

  const ContentSync = {
    path: "academy/content.json",
    channel: null,
    pullPromise: null,
    poll: 0,
    snapshot() {
      return {
        rev: contentRevision,
        updatedAt: Date.now(),
        courseGroups: DATA.courseGroups,
        lessons: DATA.lessons,
        exams: DATA.exams,
        notices: DATA.notices || []
      };
    },
    apply(payload) {
      const source = payload?.data && typeof payload.data === "object" ? payload.data : payload;
      if (!source || !Array.isArray(source.lessons) || !Array.isArray(source.exams)) return false;
      const rev = Number(payload?.rev || source.rev) || 0;
      if (rev && rev <= contentRevision) return false;
      const courseGroups = normalizeCourseGroups(source.courseGroups);
      const normalized = stripUnrelatedCurriculum({
        courseGroups,
        lessons: source.lessons.map(normalizeLesson),
        exams: source.exams.map(normalizeExam),
        notices: Array.isArray(source.notices) ? source.notices.map(normalizeNotice) : []
      });
      DATA.courseGroups = normalized.courseGroups;
      DATA.lessons = normalized.lessons;
      DATA.exams = normalized.exams;
      DATA.notices = normalized.notices;
      contentRevision = rev || Date.now();
      saveOpsStore();
      const editing = state.route?.name === "ops" && ["add", "edit"].includes(currentOpsRoute().mode);
      if (Auth.session && !editing && state.route?.name !== "exam") render();
      return true;
    },
    async pull() {
      if (this.pullPromise) return this.pullPromise;
      this.pullPromise = (async () => {
        const payload = await window.AcademyStore.getJSON(this.path);
        if (!payload) {
          if (Auth.isManager(Auth.session)) await this.publish();
          return false;
        }
        return this.apply(payload);
      })();
      try {
        return await this.pullPromise;
      } finally {
        this.pullPromise = null;
      }
    },
    async publish() {
      contentRevision = Date.now();
      saveOpsStore();
      const payload = { rev: contentRevision, data: this.snapshot() };
      try {
        await window.AcademyStore.putJSON(this.path, payload);
      } catch (routeError) {
        const cfg = window.ACADEMY_CONFIG;
        if (!cfg?.url || !cfg?.key || !cfg?.bucket) throw routeError;
        const response = await window.fetch(`${cfg.url}/storage/v1/object/${cfg.bucket}/${this.path}`, {
          method: "POST",
          headers: {
            apikey: cfg.key,
            Authorization: `Bearer ${cfg.key}`,
            Accept: "application/json",
            "Content-Type": "application/json",
            "x-upsert": "true",
            "cache-control": "max-age=0"
          },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      }
      if (this.channel) {
        this.channel.send({
          type: "broadcast",
          event: "content-version",
          payload: { rev: contentRevision }
        });
      }
      return true;
    },
    connect() {
      if (!this.channel) {
        this.channel = window.AcademyStore.channel("academy-content-live", {
          "content-version": (payload) => {
            if (Number(payload?.rev) > contentRevision) this.pull().catch(() => { });
          }
        });
      }
      this.pull().catch(() => { });
      if (!this.poll) this.poll = setInterval(() => this.pull().catch(() => { }), 30000);
      return this.channel;
    }
  };

  const Presence = {
    timer: 0,
    userId: "",
    lastTick: 0,
    active: false,
    capture(sync) {
      if (!Auth.session || !this.userId || this.userId !== Auth.session.id) return;
      const now = Date.now();
      if (this.active && this.lastTick) {
        const elapsed = Math.max(0, Math.floor((now - this.lastTick) / 1000));
        state.progress.onlineSeconds = (Number(state.progress.onlineSeconds) || 0) + elapsed;
        state.progress.minutes = Math.floor(state.progress.onlineSeconds / 60);
      }
      this.lastTick = now;
      state.progress.lastSeenAt = now;
      if (sync) Live.push();
    },
    start() {
      const id = Auth.session?.id || "";
      if (!id) return;
      if (this.timer && this.userId === id) return;
      this.stop();
      this.userId = id;
      this.lastTick = Date.now();
      this.active = document.visibilityState !== "hidden";
      state.progress.onlineSeconds = Math.max(Number(state.progress.onlineSeconds) || 0, (Number(state.progress.minutes) || 0) * 60);
      state.progress.lastSeenAt = Date.now();
      Live.push();
      this.timer = setInterval(() => this.capture(true), 30000);
    },
    visibility() {
      if (!this.timer) return;
      this.capture(true);
      this.active = document.visibilityState !== "hidden";
      this.lastTick = Date.now();
    },
    stop() {
      if (this.timer) this.capture(true);
      clearInterval(this.timer);
      this.timer = 0;
      this.userId = "";
      this.lastTick = 0;
      this.active = false;
    }
  };

  const StaffProgress = {
    rows: new Map(),
    loading: false,
    loadedAt: 0,
    async load(force) {
      if (!Auth.isManager(Auth.session) || this.loading) return;
      if (!force && this.loadedAt && Date.now() - this.loadedAt < 30000) return;
      this.loading = true;
      if (force) this.rows.clear();
      const people = Auth.list();
      try {
        const rows = await window.AcademyStore.restSelect(progressTable(), {
          select: "user_id,payload,ts,updated_at"
        });
        const byId = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.user_id, row]));
        people.forEach((user) => {
          if (user.id === Auth.session.id) return;
          const row = byId.get(user.id);
          if (!row) {
            this.rows.set(user.id, { progress: defaults(), lastSeenAt: 0, available: false });
            return;
          }
          const progress = normalizeProgress(row.payload);
          this.rows.set(user.id, {
            progress,
            lastSeenAt: Number(progress.lastSeenAt) || Number(row.ts) || 0,
            available: true
          });
        });
      } catch (_) {
        people.forEach((user) => {
          if (user.id === Auth.session.id) return;
          if (!this.rows.has(user.id)) this.rows.set(user.id, { progress: defaults(), lastSeenAt: 0, available: false });
        });
      }
      this.loading = false;
      this.loadedAt = Date.now();
      if (state.route?.name === "ops" && currentOpsRoute().section === "staff") renderOps();
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
    const lesson = lessonById(id);
    return lesson ? lessonCompletedForProgress(lesson, state.progress) : Boolean(state.progress.completed[id]);
  }

  function progressBestScore(progress, examId) {
    const logs = progress?.examHistory?.[examId] || [];
    return logs.reduce((max, item) => Math.max(max, Number(item?.score ?? item) || 0), -1);
  }

  function lessonCompletedForProgress(lesson, progress) {
    if (!lesson) return false;
    if (progress?.completed?.[lesson.id]) return true;
    if (!lesson.requiredExamId) return false;
    const exam = examById(lesson.requiredExamId);
    return Boolean(exam && progressBestScore(progress, exam.id) >= exam.pass);
  }

  function completeLesson(id) {
    const lesson = lessonById(id);
    if (lesson?.requiredExamId && !lessonCompletedForProgress(lesson, state.progress)) return false;
    state.progress.completed[id] = Date.now();
    state.progress.last = { type: "lesson", id };
    touchStreak();
    save();
    updateNotificationButton();
    return true;
  }

  function completionRate() {
    const total = DATA.lessons.length + DATA.exams.length;
    const examDone = DATA.exams.filter((exam) => bestScore(exam.id) >= exam.pass).length;
    const done = DATA.lessons.filter((lesson) => isDone(lesson.id)).length + examDone;
    return Math.round((done / total) * 100);
  }

  function bestScore(examId) {
    return progressBestScore(state.progress, examId);
  }

  function nextLesson() {
    const available = DATA.lessons.filter((item) => Gate.canLesson(item) && !isDone(item.id));
    if (state.progress.last?.type === "lesson") {
      const current = lessonById(state.progress.last.id);
      if (current && Gate.canLesson(current) && !isDone(current.id)) return current;
    }
    return available[0] || null;
  }

  function isUrgentTrack(trackId) {
    return Boolean(DATA.tracks.find((track) => track.id === trackId)?.urgent);
  }

  function examPassed(exam) {
    return bestScore(exam.id) >= exam.pass;
  }

  function contentMessageKey(kind, id, publishedAt) {
    const timestamp = Math.max(0, Number(publishedAt) || 0);
    return timestamp ? `${kind}:${id}:${timestamp}` : "";
  }

  function messageUnread(message) {
    return Boolean(message?.key && !state.progress.readMessages[message.key]);
  }

  function markMessageRead(key) {
    if (!key || state.progress.readMessages[key]) return false;
    state.progress.readMessages[key] = Date.now();
    save();
    updateNotificationButton();
    return true;
  }

  function markPublishedContentRead(kind, item) {
    if (item?.notify === false) return false;
    return markMessageRead(contentMessageKey(kind, item?.id, item?.publishedAt || item?.createdAt));
  }

  function inbox() {
    const pendingLessons = DATA.lessons.filter((item) => Gate.canLesson(item) && !isDone(item.id));
    const urgentLessons = pendingLessons.filter((item) => isUrgentTrack(item.track));
    const pendingExams = DATA.exams.filter((exam) => Gate.canExam(exam) && !examPassed(exam));
    const notices = [];

    DATA.lessons.filter((lesson) => Gate.canLesson(lesson) && lesson.notify !== false && lesson.publishedAt > 0).forEach((lesson) => {
      notices.push({
        key: contentMessageKey("lesson", lesson.id, lesson.publishedAt),
        tone: "info",
        kicker: "新课程",
        title: lesson.title,
        detail: `${lesson.summary} · ${minutesLabel(lesson.minutes)}`,
        act: "open-lesson",
        id: lesson.id,
        createdAt: lesson.publishedAt
      });
    });

    DATA.exams.filter((exam) => Gate.canExam(exam) && exam.notify !== false && exam.publishedAt > 0).forEach((exam) => {
      notices.push({
        key: contentMessageKey("exam", exam.id, exam.publishedAt),
        tone: "info",
        kicker: "新考试",
        title: exam.title,
        detail: `${exam.summary} · ${exam.questions.length} 题`,
        act: "go",
        hash: `#/exam/${exam.id}`,
        createdAt: exam.publishedAt
      });
    });

    const posted = (DATA.notices || []).filter((notice) => notice.notify !== false && noticeVisibleTo(notice)).map((notice) => ({
      key: contentMessageKey("notice", notice.id, notice.createdAt),
      tone: notice.tone === "urgent" ? "urgent" : "info",
      kicker: coerceString(notice.kicker, "运营通知"),
      title: coerceString(notice.title, "新通知"),
      detail: coerceString(notice.detail, "请尽快查看"),
      act: "go",
      id: notice.id,
      createdAt: coerceNumber(notice.createdAt, Date.now()),
      hash: `#/notice/${notice.id}`
    }));
    notices.push(...posted);
    notices.sort((a, b) => b.createdAt - a.createdAt);
    const unreadNotices = notices.filter(messageUnread);
    return { pendingLessons, urgentLessons, pendingExams, notices, unreadNotices };
  }

  function parseHash() {
    const raw = (location.hash || "#/home").replace(/^#\/?/, "");
    const [path, query] = raw.split("?");
    const parts = path.split("/").filter(Boolean);
    const params = {};
    new URLSearchParams(query || "").forEach((value, key) => { params[key] = value; });
    if (!parts.length || parts[0] === "home") return { name: "home" };
    if (parts[0] === "messages") return { name: "messages" };
    if (parts[0] === "apps" && ["notes", "jlhcdh"].includes(parts[1])) return { name: "embedded-app", app: parts[1] };
    if (parts[0] === "learn") return { name: "learn", type: params.type || "all", group: params.group || "all" };
    if (parts[0] === "exams") return { name: "exams" };
    if (parts[0] === "me") return { name: "me" };
    if (parts[0] === "ops") return {
      name: "ops",
      section: canonicalOpsSection(params.section),
      mode: canonicalOpsMode(params.mode),
      id: params.id
    };
    if (parts[0] === "lesson" && parts[1]) return { name: "lesson", id: parts[1] };
    if (parts[0] === "notice" && parts[1]) return { name: "notice", id: parts[1] };
    if (parts[0] === "exam" && parts[1] && parts[2] === "result") return { name: "result", id: parts[1], at: Number(params.at) || 0 };
    if (parts[0] === "exam" && parts[1]) return { name: "exam", id: parts[1] };
    return { name: "home" };
  }

  function currentHash() {
    return location.hash?.startsWith("#/") ? location.hash : "#/home";
  }

  function navigationState() {
    const current = history.state;
    return current && typeof current === "object" ? current : {};
  }

  function hasNavigationParent(current = navigationState()) {
    return Boolean(
      current[NAVIGATION_STATE_KEY]
      && Number(current.academyDepth) > 0
      && typeof current.academyFrom === "string"
      && current.academyFrom.startsWith("#/")
      && current.academyFrom !== currentHash()
    );
  }

  function initializeNavigationState() {
    const current = navigationState();
    const depth = Number(current.academyDepth);
    const valid = current[NAVIGATION_STATE_KEY]
      && Number.isInteger(depth)
      && depth >= 0
      && typeof current.academyFrom === "string"
      && (depth === 0 || current.academyFrom.startsWith("#/"));
    if (valid) return;
    history.replaceState({
      ...current,
      [NAVIGATION_STATE_KEY]: true,
      academyDepth: 0,
      academyFrom: ""
    }, "", currentHash());
  }

  function go(hash, options = {}) {
    const target = hash?.startsWith("#/") ? hash : "#/home";
    const source = currentHash();
    if (source === target) {
      onRoute();
      return;
    }

    const current = navigationState();
    const depth = Number(current.academyDepth) || 0;
    if (!options.replace && current[NAVIGATION_STATE_KEY] && depth > 0 && current.academyFrom === target) {
      history.back();
      return;
    }

    const next = {
      ...current,
      [NAVIGATION_STATE_KEY]: true,
      academyDepth: options.replace ? depth : depth + 1,
      academyFrom: options.replace ? (current.academyFrom || "") : source
    };
    if (options.replace) history.replaceState(next, "", target);
    else history.pushState(next, "", target);
    onRoute();
  }

  function parentHashForRoute(route) {
    if (!route) return "#/home";
    if (route.name === "lesson") return "#/learn";
    if (route.name === "notice") return "#/messages";
    if (route.name === "embedded-app") return "#/home";
    if (route.name === "exam" || route.name === "result") return "#/exams";
    if (route.name === "ops") {
      if (route.mode === "add" || route.mode === "edit") return `#/ops?section=${route.section}`;
      return "#/home";
    }
    if (route.name === "learn" || route.name === "exams" || route.name === "me" || route.name === "messages") return "#/home";
    return "#/home";
  }

  function goToParentPage() {
    const current = navigationState();
    if (hasNavigationParent(current)) {
      history.back();
      return;
    }
    go(parentHashForRoute(state.route), { replace: true });
  }

  function setTheme(theme) {
    state.theme = theme;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("app-theme", theme);
    const color = document.querySelector("meta[name='theme-color']");
    if (color) color.content = theme === "dark" ? "#000000" : "#f2f2f7";
  }

  function svgIcon(name) {
    const icons = {
      back: '<path d="M15 6 9 12l6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M2 12h2m16 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
      moon: '<path d="M20 12.6A8 8 0 1 1 11.4 4 6.2 6.2 0 0 0 20 12.6Z"/>',
      bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/>',
      home: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8Z"/>',
      learn: '<path d="M4 7.5 12 4l8 3.5M4 7.5v9L12 20l8-3.5v-9M4 7.5 12 11l8-3.5"/>',
      exam: '<path d="M8 4h8v16H8z"/><path d="M10.5 9h5M10.5 13h3"/>',
      me: '<circle cx="12" cy="8" r="3"/><path d="M5 19c1.4-3 3.8-4.5 7-4.5S17.6 16 19 19"/>',
      add: '<path d="M12 5v14M5 12h14"/>',
      group: '<rect x="4" y="5" width="16" height="5" rx="2"/><rect x="4" y="14" width="16" height="5" rx="2"/>'
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

  function truncateNoticeText(value, limit = 96) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    const chars = Array.from(text);
    if (chars.length <= limit) return text;
    return `${chars.slice(0, limit).join("").replace(/[，。；、,;\s]+$/u, "")}…`;
  }

  function numberedNoticeItems(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    const matches = Array.from(text.matchAll(/(?:^|\s)(\d{1,2})[.、]\s*([\s\S]*?)(?=(?:\s+\d{1,2}[.、]\s*)|$)/g));
    if (matches.length < 2 || (matches[0].index || 0) > 2) return [];
    return matches.map((match) => ({ number: match[1], text: match[2].trim() })).filter((item) => item.text);
  }

  function renderNoticePreview(detail) {
    const items = numberedNoticeItems(detail);
    if (items.length) {
      const visible = items.slice(0, 2);
      return `<div class="notice-preview-list">${visible.map((item) => `
        <span class="notice-preview-line"><b>${item.number}</b><span>${escapeHtml(truncateNoticeText(item.text, 76))}</span></span>
      `).join("")}</div>
      <div class="notice-preview-footer"><span>${items.length > visible.length ? `还有 ${items.length - visible.length} 项` : `${items.length} 项内容`}</span><b>查看全文 <i aria-hidden="true">›</i></b></div>`;
    }
    return `<p class="notice-preview-text">${escapeHtml(truncateNoticeText(detail, 120))}</p>
      <div class="notice-preview-footer"><span></span><b>查看详情 <i aria-hidden="true">›</i></b></div>`;
  }

  function renderNoticeDetail(detail) {
    const items = numberedNoticeItems(detail);
    if (!items.length) return `<p class="notice-detail-text">${escapeHtml(detail)}</p>`;
    return `<ol class="notice-detail-list">${items.map((item) => `
      <li><span>${item.number}</span><p>${escapeHtml(item.text)}</p></li>
    `).join("")}</ol>`;
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
      return `<div class="figure">${["开炉", "高峰", "补货", "收档"].map((label, i) =>
        `<div style="display:flex;align-items:center;gap:10px;padding:8px 4px">
          <b style="width:22px;height:22px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;font-size:12px">${i + 1}</b>
          <span>${label}</span>
          ${i < 3 ? "<span class='muted'>→</span>" : ""}
        </div>`).join("")}</div>`;
    }
    if (kind === "tools") {
      return `<div class="figure" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${[["锅底备货", "每日补货"], ["翻台笔记", "交接短句"], ["翻台流水", "看高峰"], ["门店记账", "发生即记"]].map(([t, d]) =>
          `<div style="padding:10px;border-radius:12px;background:var(--surface-2)"><b>${t}</b><div class="muted">${d}</div></div>`).join("")}
      </div>`;
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

  function greetingForHour(hour) {
    if (hour < 5) return { text: "晚上好", rest: true };
    if (hour < 11) return { text: "早上好", rest: false };
    if (hour < 13) return { text: "中午好", rest: false };
    if (hour < 18) return { text: "下午好", rest: false };
    if (hour < 22) return { text: "晚上好", rest: false };
    return { text: "晚上好", rest: true };
  }

  function renderHome() {
    setTop("运营事务看板", false);
    setTab("home");
    const box = inbox();
    const next = box.urgentLessons[0] || nextLesson();
    const now = new Date();
    const greeting = greetingForHour(now.getHours());
    const date = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(now);
    const dateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const memberName = escapeHtml(Auth.session?.name || "学员");
    const learnableLessons = DATA.lessons.filter((item) => Gate.canLesson(item));
    const learnedCount = learnableLessons.filter((item) => isDone(item.id)).length;
    const unlearnedCount = learnableLessons.length - learnedCount;
    const importantExams = DATA.exams
      .filter((exam) => Gate.canExam(exam) && (isUrgentTrack(exam.track) || bestScore(exam.id) < exam.pass))
      .sort((a, b) => Number(isUrgentTrack(b.track)) - Number(isUrgentTrack(a.track)));
    const importantMessages = box.unreadNotices.slice(0, 5);
    const tracks = [];
    [...DATA.lessons, ...DATA.exams].forEach((item) => {
      if (!tracks.includes(item.track)) tracks.push(item.track);
    });
    const trackNames = Object.fromEntries(DATA.tracks.map((track) => [track.id, track.title]));
    const stages = tracks.map((track, index) => {
      const tasks = [
        ...DATA.lessons.filter((lesson) => lesson.track === track).map((lesson) => ({ kind: "lesson", data: lesson })),
        ...DATA.exams.filter((exam) => exam.track === track).map((exam) => ({ kind: "exam", data: exam }))
      ];
      const done = tasks.filter((task) => task.kind === "lesson" ? isDone(task.data.id) : bestScore(task.data.id) >= task.data.pass).length;
      const available = tasks.some((task) => task.kind === "lesson" ? Gate.canLesson(task.data) : Gate.canExam(task.data));
      return {
        track,
        tasks,
        done,
        available,
        title: trackNames[track] || `学习阶段 ${index + 1}`,
        percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0
      };
    });
    const activeStage = Math.max(0, stages.findIndex((stage) => stage.available && stage.done < stage.tasks.length));

    view().innerHTML = `
      <header class="hello home-hello">
        <div class="home-hello-copy">
          <h2>${greeting.text}，${memberName}</h2>
          ${greeting.rest ? `<p class="home-rest-reminder">夜深了，早点休息</p>` : ""}
          <time datetime="${dateTime}">${date}</time>
        </div>
        ${progressRing(completionRate())}
      </header>
      <section class="home-shortcuts" aria-labelledby="home-shortcuts-title">
        <header class="home-shortcuts-head">
          <div><h3 id="home-shortcuts-title">快捷访问</h3></div>
        </header>
        <div class="home-shortcut-grid">
          <button type="button" class="home-app-shortcut" data-act="go" data-hash="#/apps/notes" aria-label="在 Auto Office 内打开今岭笔记">
            <img src="https://hldhlh.github.io/web/apps/notes/icon.svg" width="54" height="54" alt="">
            <span class="home-app-shortcut-copy"><strong>今岭笔记</strong><small>快速记录和查找门店笔记</small></span>
            <span class="home-app-shortcut-action">打开</span>
          </button>
          <button type="button" class="home-app-shortcut" data-act="go" data-hash="#/apps/jlhcdh" aria-label="在 Auto Office 内打开今岭每日订货表">
            <img src="https://hldhlh.github.io/web/apps/jlhcdh/icon.svg" width="54" height="54" alt="">
            <span class="home-app-shortcut-copy"><strong>今岭每日订货表</strong><small>完成每日订货与采购核对</small></span>
            <span class="home-app-shortcut-action">打开</span>
          </button>
        </div>
      </section>
      <div class="ops-kpi">
        <button class="ops-card" data-act="go" data-hash="#/learn">
          <span class="ops-tag">学习进度</span>
          <b>${learnedCount} / ${learnableLessons.length}</b>
          <small>已学习课程 · 还差 ${unlearnedCount} 课</small>
        </button>
        <button class="ops-card" data-act="go" data-hash="#/exams">
          <span class="ops-tag">考试跟踪</span>
          <b>${box.pendingExams.length}</b>
          <small>待完成考试（含需补考）</small>
        </button>
        <button class="ops-card" data-act="${next ? "open-lesson" : "go"}" ${next ? `data-id="${next.id}"` : 'data-hash="#/learn"'}>
          <span class="ops-tag">待学习课程</span>
          <b>${box.pendingLessons.length}</b>
          <small>${box.pendingLessons.length ? "今日有课程可继续学习" : "当前课程已全部完成"}</small>
        </button>
        <button class="ops-card" data-act="go" data-hash="#/messages">
          <span class="ops-tag">重要消息</span>
          <b>${box.unreadNotices.length}</b>
          <small>未读发布消息</small>
        </button>
      </div>
      <section class="learning-plan">
        <header class="learning-plan-head">
          <h3>任务面板</h3>
          <strong><small>已完成</small><b>${learnedCount}/${learnableLessons.length}</b></strong>
        </header>
        <div class="stage-tabs" role="tablist" aria-label="学习阶段">
          ${stages.map((stage, index) => `
            <button type="button" class="stage-tab ${index === activeStage ? "on" : ""} ${!stage.available ? "locked" : ""}" id="academy-stage-tab-${index}" role="tab" aria-label="阶段 ${index + 1}，${escapeHtml(stage.title)}，已完成 ${stage.done}/${stage.tasks.length} 项" aria-selected="${index === activeStage}" aria-controls="academy-stage-${index}" tabindex="${index === activeStage ? "0" : "-1"}" data-stage-target="academy-stage-${index}">
              <span>阶段 ${index + 1}</span>
            </button>`).join("")}
        </div>
        <div class="learning-stages">
          ${stages.map((stage, stageIndex) => `
            <section class="learning-stage" id="academy-stage-${stageIndex}" role="tabpanel" aria-labelledby="academy-stage-tab-${stageIndex}" ${stageIndex === activeStage ? "" : "hidden"}>
              <div class="learning-stage-head">
                <div class="learning-stage-copy"><h4>${escapeHtml(stage.title)}</h4><small>已完成 ${stage.done}/${stage.tasks.length} 项</small></div>
              </div>
              <div class="stage-progress" role="progressbar" aria-label="阶段进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${stage.percent}"><i style="width:${stage.percent}%"></i></div>
              <div class="task-list">
                ${stage.tasks.map((task) => {
                  const item = task.data;
                  const isExam = task.kind === "exam";
                  const locked = isExam ? !Gate.canExam(item) : !Gate.canLesson(item);
                  const done = isExam ? bestScore(item.id) >= item.pass : isDone(item.id);
                  const score = isExam ? bestScore(item.id) : -1;
                  const action = locked ? "locked" : isExam ? "go" : "open-lesson";
                  const attrs = isExam ? `data-hash="#/exam/${item.id}"` : `data-id="${item.id}"`;
                  const meta = isExam ? `考试 · ${score >= 0 ? `${score} 分` : minutesLabel(item.minutes)}` : `${TYPE_LABEL[item.type]} · ${minutesLabel(item.minutes)}`;
                  const result = done ? "已完成" : locked ? "待授权" : isExam ? "去考试" : "去学习";
                  return `<button class="learning-task ${done ? "done" : ""} ${locked ? "locked" : ""}" data-act="${action}" ${attrs} aria-label="${escapeHtml(`${item.title}，${meta}，${result}`)}">
                    <span class="task-status" aria-hidden="true">${done ? "✓" : locked ? "锁" : ""}</span>
                    <span class="task-main">
                      <strong>${escapeHtml(item.title)}</strong>
                      <small>${meta}</small>
                    </span>
                    <span class="task-result">${done ? "" : locked ? "待授权" : `<i aria-hidden="true">›</i>`}</span>
                  </button>`;
                }).join("")}
              </div>
            </section>`).join("")}
        </div>
      </section>
      <div class="sec-title"><h3>重要消息</h3><span>${importantMessages.length}</span></div>
      ${importantMessages.length ? importantMessages.map((item) => `
        <button class="card notice unread-message ${item.tone === "urgent" ? "urgent" : ""}" data-act="${item.act}" data-message-key="${escapeHtml(item.key)}" ${item.id ? `data-id="${item.id}"` : ""} ${item.hash ? `data-hash="${item.hash}"` : ""}>
          <div class="kicker"><span class="message-alarm">${svgIcon("bell")}</span>${escapeHtml(item.kicker)}</div>
          <strong>${escapeHtml(item.title)}</strong>
          <p class="muted">${escapeHtml(item.detail)}</p>
        </button>`).join("") : `<div class="card notice clear"><strong>当前无待处理消息</strong><p class="muted">新消息和考试更新会推送到这里。</p></div>`}
      <div class="sec-title"><h3>重要考试</h3><span>${importantExams.length}</span></div>
      ${importantExams.length ? importantExams.slice(0, 4).map((exam) => {
          const best = bestScore(exam.id);
          return `<button class="card lesson-card" data-act="go" data-hash="#/exam/${exam.id}">
            <div class="top"><span class="ops-tag">${isUrgentTrack(exam.track) ? "关键考核" : "待复查"}${best >= 0 ? ` · ${best}分` : ""}</span><span>${minutesLabel(exam.minutes)}</span></div>
            <strong>${escapeHtml(exam.title)}</strong>
            <p class="muted">${escapeHtml(exam.summary)}</p>
          </button>`;
        }).join("") : `<div class="card notice clear"><strong>重要考试项已完成</strong><p class="muted">当前暂无关键考试待过。</p></div>`}
    `;
    view().querySelectorAll("[data-stage-target]").forEach((button) => {
      button.addEventListener("click", () => {
        view().querySelectorAll(".stage-tab").forEach((item) => {
          const selected = item === button;
          item.classList.toggle("on", selected);
          item.setAttribute("aria-selected", String(selected));
          item.tabIndex = selected ? 0 : -1;
        });
        view().querySelectorAll(".learning-stage").forEach((stage) => {
          stage.hidden = stage.id !== button.dataset.stageTarget;
        });
      });
      button.addEventListener("keydown", (event) => {
        const tabs = [...view().querySelectorAll(".stage-tab")];
        const index = tabs.indexOf(button);
        const targetIndex = event.key === "ArrowRight" ? (index + 1) % tabs.length
          : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
            : event.key === "Home" ? 0
              : event.key === "End" ? tabs.length - 1
                : -1;
        if (targetIndex < 0) return;
        event.preventDefault();
        tabs[targetIndex].focus();
        tabs[targetIndex].click();
      });
    });
  }

  const CourseSearch = {
    cache: new Map(),
    loading: null,
    normalize(value) {
      return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s\-_·，。！？、：；（）()]/g, "");
    },
    ensure() {
      if (window.pinyinPro?.pinyin) return Promise.resolve(true);
      if (this.loading) return this.loading;
      this.loading = new Promise((resolve) => {
        const existing = document.querySelector("script[data-academy-pinyin]");
        if (existing) {
          existing.addEventListener("load", () => resolve(Boolean(window.pinyinPro?.pinyin)), { once: true });
          existing.addEventListener("error", () => resolve(false), { once: true });
          return;
        }
        const script = document.createElement("script");
        script.src = "../vendor/pinyin-pro.min.js";
        script.async = true;
        script.dataset.academyPinyin = "true";
        script.onload = () => resolve(Boolean(window.pinyinPro?.pinyin));
        script.onerror = () => resolve(false);
        document.head.appendChild(script);
      });
      return this.loading;
    },
    phonetic(text) {
      const source = String(text || "");
      if (this.cache.has(source)) return this.cache.get(source);
      let result = { full: "", initial: "" };
      if (window.pinyinPro?.pinyin && source) {
        try {
          result = {
            full: this.normalize(window.pinyinPro.pinyin(source, { toneType: "none", type: "array" }).join("")),
            initial: this.normalize(window.pinyinPro.pinyin(source, { pattern: "first", toneType: "none" }))
          };
        } catch (_) { }
      }
      this.cache.set(source, result);
      return result;
    },
    sequence(text, query) {
      if (query.length < 2 || query.length > text.length) return false;
      let cursor = 0;
      for (const char of text) {
        if (char === query[cursor]) cursor += 1;
        if (cursor === query.length) return true;
      }
      return false;
    },
    fieldScore(text, query, weight) {
      const normalized = this.normalize(text);
      if (!normalized) return 0;
      if (normalized === query) return 180 * weight;
      if (normalized.startsWith(query)) return 150 * weight;
      if (normalized.includes(query)) return 125 * weight;
      const phonetic = this.phonetic(text);
      if (phonetic.initial === query) return 145 * weight;
      if (phonetic.initial.startsWith(query)) return 130 * weight;
      if (phonetic.initial.includes(query)) return 115 * weight;
      if (phonetic.full.startsWith(query)) return 120 * weight;
      if (phonetic.full.includes(query)) return 105 * weight;
      if (this.sequence(normalized, query)) return 60 * weight;
      if (this.sequence(phonetic.initial, query)) return 52 * weight;
      if (this.sequence(phonetic.full, query)) return 45 * weight;
      return 0;
    },
    rank(lesson, keyword) {
      const query = this.normalize(keyword);
      if (!query) return 1;
      const blockText = Array.isArray(lesson.blocks)
        ? lesson.blocks.map((block) => [block.text, block.title, ...(block.items || [])].filter(Boolean).join(" ")).join(" ")
        : "";
      return Math.max(
        this.fieldScore(lesson.title, query, 4),
        this.fieldScore(lesson.summary, query, 2),
        this.fieldScore(lesson.track, query, 1.4),
        this.fieldScore(blockText, query, 1)
      );
    }
  };

  function renderCourseCards(items, keyword) {
    if (!items.length) return `
      <div class="course-search-empty">
        <strong>没有找到相关课程</strong>
        <p>换个关键词试试，例如课程名称、内容关键词或拼音首字母。</p>
      </div>`;
    return items.map((lesson) => {
      const locked = !Gate.canLesson(lesson);
      const done = isDone(lesson.id);
      const groupBadges = lessonGroupNames(lesson).map((name) => `<span>${escapeHtml(name)}</span>`).join("");
      const accessibleState = done ? "已学习" : locked ? "需授权" : `${TYPE_LABEL[lesson.type]}，${minutesLabel(lesson.minutes)}`;
      return `<button class="card lesson-card course-result ${done ? "is-complete" : ""}" data-act="open-lesson" data-id="${lesson.id}" ${done ? 'data-course-learned="true"' : ""} aria-label="${escapeHtml(`${lesson.title}，${accessibleState}`)}">
        <div class="course-result-body">
          <div class="top"><span class="tag">${locked ? "需授权" : TYPE_LABEL[lesson.type]}</span>${done ? "" : `<span>${minutesLabel(lesson.minutes)}</span>`}</div>
          ${groupBadges ? `<div class="course-group-badges" aria-label="课程分组">${groupBadges}</div>` : ""}
          <strong>${escapeHtml(lesson.title)}</strong>
          <p class="muted">${locked ? "店长授权后可学" : escapeHtml(lesson.summary)}</p>
          ${keyword ? `<small class="course-match-hint">匹配“${escapeHtml(keyword)}”</small>` : ""}
        </div>
      </button>`;
    }).join("");
  }

  function renderLearn(type, groupId) {
    setTop("课程", false);
    setTab("learn");
    if (type !== "article" && type !== "video") type = "all";
    if (groupId !== "all" && !DATA.courseGroups.some((group) => group.id === groupId)) groupId = "all";
    const chips = [["all", "全部"], ["article", "图文"], ["video", "视频"]];
    const items = DATA.lessons.filter((item) => (type === "all" || item.type === type) && (groupId === "all" || item.groupIds?.includes(groupId)));
    view().innerHTML = `
      <div class="course-search" role="search">
        <span class="course-search-icon" aria-hidden="true"></span>
        <input id="course-search-input" type="search" inputmode="search" autocomplete="off" placeholder="搜索课程、内容或拼音简写" aria-label="搜索课程">
        <button type="button" id="course-search-clear" hidden>清空</button>
      </div>
      <div class="course-search-meta"><span id="course-search-count">共 ${items.length} 门课程</span></div>
      <div class="chips">
        ${chips.map(([id, label]) => `<button class="chip ${type === id ? "on" : ""}" data-act="go" data-hash="#/learn?type=${id}&group=${encodeURIComponent(groupId)}">${label}</button>`).join("")}
      </div>
      <div class="chips course-group-filters" aria-label="课程分组筛选">
        <button class="chip ${groupId === "all" ? "on" : ""}" data-act="go" data-hash="#/learn?type=${type}&group=all">全部分组</button>
        ${DATA.courseGroups.map((group) => `<button class="chip ${groupId === group.id ? "on" : ""}" data-act="go" data-hash="#/learn?type=${type}&group=${encodeURIComponent(group.id)}">${escapeHtml(group.name)}</button>`).join("")}
      </div>
      ${!Auth.canFull(Auth.session) ? `<p class="muted" style="margin-bottom:12px">当前是基本权限。视频和进阶课需要店长授权。</p>` : ""}
      <div id="course-search-results">${renderCourseCards(items, "")}</div>
    `;
    const input = document.getElementById("course-search-input");
    const clear = document.getElementById("course-search-clear");
    const results = document.getElementById("course-search-results");
    const count = document.getElementById("course-search-count");
    const updateResults = () => {
      const keyword = input.value.trim();
      const matches = keyword
        ? items.map((lesson, index) => ({ lesson, index, score: CourseSearch.rank(lesson, keyword) }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score || a.index - b.index)
          .map((item) => item.lesson)
        : items;
      results.innerHTML = renderCourseCards(matches, keyword);
      count.textContent = keyword ? `找到 ${matches.length} 门课程` : `共 ${items.length} 门课程`;
      clear.hidden = !keyword;
    };
    input.addEventListener("input", updateResults);
    input.addEventListener("search", updateResults);
    clear.addEventListener("click", () => {
      input.value = "";
      updateResults();
      input.focus();
    });
    CourseSearch.ensure().then(() => {
      CourseSearch.cache.clear();
      if (state.route?.name === "learn" && input.isConnected && input.value.trim()) updateResults();
    });
  }

  function renderExams() {
    setTop("考试", false);
    setTab("exams");
    view().innerHTML = DATA.exams.map((exam) => {
      const best = bestScore(exam.id);
      const passed = best >= exam.pass;
      const locked = !Gate.canExam(exam);
      const accessibleState = passed ? `已通过，成绩 ${best} 分` : locked ? "需授权" : `${exam.questions.length} 题`;
      return `<button class="card lesson-card" data-act="${locked ? "locked" : "go"}" data-hash="#/exam/${exam.id}" ${passed ? 'data-exam-passed="true"' : ""} aria-label="${escapeHtml(`${exam.title}，${accessibleState}，${minutesLabel(exam.minutes)}`)}">
        <div class="top"><span class="tag">${locked ? "需授权" : `${exam.questions.length} 题`}</span><span>${minutesLabel(exam.minutes)}</span></div>
        <strong>${escapeHtml(exam.title)}</strong>
        <p class="muted">${locked ? "店长授权后可考" : escapeHtml(exam.summary)}</p>
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
          <p>${escapeHtml(Auth.session?.name || "学员")} · ${Auth.canFull(Auth.session) ? "全部权限" : "基本权限"}</p>
          <h2>${Auth.canFull(Auth.session) ? "可以学全部课程" : "等待店长授权全部权限"}</h2>
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
      <section class="account-settings" aria-label="设置与账号">
        <div class="account-setting-group">
          <button class="account-setting-row" data-act="theme-toggle" role="switch" aria-checked="${state.theme === "dark"}">
            <span class="account-setting-icon">${svgIcon(state.theme === "dark" ? "moon" : "sun")}</span>
            <span class="account-setting-copy"><strong>深色模式</strong><small>当前为${state.theme === "dark" ? "深色" : "浅色"}外观</small></span>
            <span class="account-switch" aria-hidden="true"><i></i></span>
          </button>
          ${Auth.isManager(Auth.session) ? `<button class="account-setting-row" data-act="go" data-hash="#/ops">
            <span class="account-setting-icon">${svgIcon("group")}</span>
            <span class="account-setting-copy"><strong>运营事务管理</strong><small>管理课程、考试与员工</small></span>
            <span class="account-setting-chevron" aria-hidden="true">›</span>
          </button>` : ""}
        </div>
        <div class="account-setting-group account-session-group">
          <button class="account-logout" data-act="logout">退出账号</button>
        </div>
      </section>
    `;
  }

  function staffAccessLabel(user) {
    if (user.access === "full") return "全部权限";
    if (user.access === "blocked") return "已停用";
    return "仅基本";
  }

  function renderOpsTabs(section) {
    const sections = [
      { key: "lessons", icon: "learn", label: "课程", fullLabel: "课程内容", count: DATA.lessons.length },
      { key: "exams", icon: "exam", label: "考试", fullLabel: "考试题库", count: DATA.exams.length },
      { key: "notices", icon: "bell", label: "通知", fullLabel: "事务通知", count: (DATA.notices || []).length },
      { key: "staff", icon: "me", label: "员工", fullLabel: "员工与权限", count: Auth.list().length }
    ];
    return `<nav class="ops-subtabs" aria-label="运营事务导航">${sections.map((item) => `
      <button class="${section === item.key ? "on" : ""}" data-act="ops-tab" data-section="${item.key}" aria-label="${item.fullLabel}，${item.count} 项" ${section === item.key ? 'aria-current="page"' : ""}>
        <span class="ops-nav-mark">${svgIcon(item.icon)}</span>
        <span class="ops-nav-label">${item.label}</span>
        <small>${item.count}</small>
      </button>
    `).join("")}</nav>`;
  }

  function lessonForEditor(raw) {
    const blocks = Array.isArray(raw?.blocks) ? raw.blocks : [];
    const track = normalizeTrack(raw?.track);
    const availableGroupIds = new Set((DATA.courseGroups || []).map((group) => group.id));
    const groupIds = normalizeLessonGroupIds(raw?.groupIds, track).filter((id) => availableGroupIds.has(id));
    return {
      id: raw?.id || "",
      title: coerceString(raw?.title, ""),
      track,
      groupIds: groupIds.length ? groupIds : (DATA.courseGroups?.[0] ? [DATA.courseGroups[0].id] : []),
      type: normalizeLessonType(raw?.type),
      minutes: Math.max(1, Math.round(coerceNumber(raw?.minutes, 3))),
      summary: coerceString(raw?.summary, ""),
      access: raw?.access === "basic" ? "basic" : "full",
      mediaUrl: coerceString(raw?.mediaUrl, ""),
      requiredExamId: coerceString(raw?.requiredExamId, ""),
      requireConfirmation: raw?.id ? raw?.requireConfirmation !== false : Boolean(raw?.requireConfirmation),
      notify: raw?.notify !== false,
      blocks: blocks.length ? blocks : defaultBlocks(coerceString(raw?.summary, "课程内容待完善。")),
      scenes: Array.isArray(raw?.scenes) && raw.scenes.length ? raw.scenes : []
    };
  }

  function lessonCompletionLabel(lesson) {
    if (lesson.requiredExamId) {
      const exam = examById(lesson.requiredExamId);
      return exam ? `通过「${exam.title}」` : "关联考试不可用";
    }
    return lesson.requireConfirmation ? "员工确认完成" : "阅读或观看结束自动完成";
  }

  function examForEditor(raw) {
    return {
      id: raw?.id || "",
      title: coerceString(raw?.title, ""),
      track: normalizeTrack(raw?.track),
      pass: Math.max(1, Math.min(100, Math.round(coerceNumber(raw?.pass, 80)))),
      minutes: Math.max(1, Math.round(coerceNumber(raw?.minutes, 8))),
      summary: coerceString(raw?.summary, ""),
      notify: raw?.notify !== false,
      questions: Array.isArray(raw?.questions) ? raw.questions : []
    };
  }

  function noticeForEditor(raw) {
    return {
      id: raw?.id || "",
      title: coerceString(raw?.title, ""),
      kicker: coerceString(raw?.kicker, "运营通知"),
      detail: coerceString(raw?.detail, ""),
      tone: raw?.tone === "urgent" ? "urgent" : "info",
      createdAt: coerceNumber(raw?.createdAt, Date.now()),
      notify: raw?.notify !== false,
      audience: normalizeNoticeAudience(raw?.audience)
    };
  }

  function renderDateTimeInput(ms) {
    const date = new Date(coerceNumber(ms, Date.now()));
    const pad = (num) => String(num).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function renderDateLabel(ms) {
    const date = new Date(coerceNumber(ms, Date.now()));
    const pad = (num) => String(num).padStart(2, "0");
    return `${date.getMonth() + 1}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function renderPublishToggle(id, checked, title, hint) {
    return `<label class="publish-option" for="${id}">
      <input id="${id}" type="checkbox" ${checked ? "checked" : ""}>
      <span><b>${title}</b><small>${hint}</small></span>
      <i aria-hidden="true"></i>
    </label>`;
  }

  function courseGroupName(groupId) {
    return DATA.courseGroups?.find((group) => group.id === groupId)?.name || "未命名分组";
  }

  function lessonGroupNames(lesson) {
    return normalizeLessonGroupIds(lesson?.groupIds, lesson?.track)
      .map(courseGroupName)
      .filter((name, index, names) => names.indexOf(name) === index);
  }

  function renderLessonGroupOptions(selectedIds) {
    const selected = new Set(normalizeLessonGroupIds(selectedIds, ""));
    if (!DATA.courseGroups?.length) return `<p class="empty group-empty">请先返回课程管理创建分组。</p>`;
    return `<fieldset class="lesson-group-options">
      <legend>选择发布分组</legend>
      <p>课程会显示在所有勾选的分组中，至少选择一个。</p>
      <div>${DATA.courseGroups.map((group) => {
        const id = `ops-lesson-group-${group.id}`;
        return `<label for="${escapeHtml(id)}">
          <input id="${escapeHtml(id)}" name="ops-lesson-groups" type="checkbox" value="${escapeHtml(group.id)}" ${selected.has(group.id) ? "checked" : ""}>
          <span aria-hidden="true"></span><b>${escapeHtml(group.name)}</b>
        </label>`;
      }).join("")}</div>
    </fieldset>`;
  }

  function lessonBlockTemplates(kind) {
    if (kind === "lead") return { type: "lead", text: "请先说清本课目标，再进入实操。" };
    if (kind === "h") return { type: "h", text: "关键知识点" };
    if (kind === "p") return { type: "p", text: "补充说明一段完整的话。可写执行标准、注意事项等。" };
    if (kind === "ul") return { type: "ul", items: ["需要员工记住的要点"] };
    if (kind === "ol") return { type: "ol", items: ["第一步要执行的操作"] };
    if (kind === "callout") return { type: "callout", tone: "key", title: "重点提醒", text: "将重要结论用简短句先说清。再给动作步骤。" };
    if (kind === "figure") return { type: "figure", kind: "day-flow" };
    if (kind === "table") return { type: "table", headers: ["名称", "标准"], rows: [["", ""]] };
    return null;
  }

  const LESSON_BLOCK_META = {
    lead: { label: "课程引导", hint: "先告诉员工这节课要学会什么", placeholder: "例如：完成本课后，你将掌握开炉前的检查流程。" },
    h: { label: "小标题", hint: "为接下来的内容划分章节", placeholder: "例如：第一步，检查设备" },
    p: { label: "正文", hint: "填写操作方法、标准或说明", placeholder: "直接填写员工需要阅读的内容……" },
    ul: { label: "要点清单", hint: "并列展示需要记住的事项" },
    ol: { label: "操作步骤", hint: "按顺序展示员工需要执行的动作" },
    callout: { label: "重点提示", hint: "突出容易遗漏或必须记住的内容", placeholder: "填写重点提醒……" },
    figure: { label: "课程图示", hint: "用图形帮助员工快速理解" },
    table: { label: "数据表格", hint: "适合配方、标准和对照信息" }
  };

  function renderLessonListEditor(block) {
    const items = Array.isArray(block.items) && block.items.length ? block.items : [""];
    return `<div class="lesson-list-editor">${items.map((item, index) => `
      <div class="lesson-list-row"><span>${index + 1}</span><input data-block-field="item" value="${escapeHtml(item)}" placeholder="填写一项内容"><button type="button" data-act="ops-lesson-remove-list-item" title="删除此项">×</button></div>
    `).join("")}</div><button type="button" class="inline-add" data-act="ops-lesson-add-list-item">+ 新增一项</button>`;
  }

  function renderLessonTableEditor(block) {
    const headers = Array.isArray(block.headers) && block.headers.length ? block.headers : ["名称", "标准"];
    const rows = Array.isArray(block.rows) && block.rows.length ? block.rows : [["", ""]];
    const columns = headers.length;
    return `<div class="lesson-table-actions">
      <span>直接填写表格内容</span>
      <div><button type="button" data-act="ops-lesson-add-table-column">+ 增加一列</button><button type="button" data-act="ops-lesson-remove-table-column">减少一列</button></div>
    </div>
    <div class="lesson-table-editor" style="--table-columns:${columns}">
      <div class="lesson-table-head">${headers.map((header) => `<input data-block-field="header" value="${escapeHtml(header)}" placeholder="列标题">`).join("")}</div>
      <div class="lesson-table-rows">${rows.map((row) => `
        <div class="lesson-table-row">${headers.map((_, index) => `<input data-block-field="cell" value="${escapeHtml(row[index] || "")}" placeholder="填写内容">`).join("")}<button type="button" data-act="ops-lesson-remove-table-row" title="删除此行">×</button></div>
      `).join("")}</div>
    </div>
    <button type="button" class="inline-add" data-act="ops-lesson-add-table-row">+ 增加一行</button>`;
  }

  function renderLessonBlockItem(block, index) {
    const type = LESSON_BLOCK_META[block?.type] ? block.type : "p";
    const meta = LESSON_BLOCK_META[type];
    const content = type === "callout" ? `
      <div class="wysiwyg-callout ${block.tone === "warn" ? "warn" : ""}">
        <div class="ops-grid">
          <label class="editor-field wysiwyg-callout-title"><span>提示标题</span><input data-block-field="title" value="${escapeHtml(block.title || "")}" placeholder="例如：必须确认"></label>
          <label class="editor-field wysiwyg-tone"><span>提示类型</span>
          <select data-block-field="tone">
            <option value="key" ${block.tone !== "warn" ? "selected" : ""}>重点</option>
            <option value="warn" ${block.tone === "warn" ? "selected" : ""}>警告</option>
          </select>
          </label>
        </div>
        <label class="editor-field wysiwyg-callout-text"><span>提示内容</span><textarea data-block-field="text" placeholder="${meta.placeholder}">${escapeHtml(block.text || "")}</textarea></label>
      </div>
    ` : type === "ul" || type === "ol" ? renderLessonListEditor(block) : type === "figure" ? `
      <div class="wysiwyg-figure-preview">${figure(block.kind || "day-flow")}</div>
      <label class="editor-field"><span>选择图示样式</span>
        <select data-block-field="kind">
          <option value="day-flow" ${block.kind === "day-flow" ? "selected" : ""}>门店一天流程</option>
          <option value="tools" ${block.kind === "tools" ? "selected" : ""}>门店工具箱</option>
        </select>
      </label>
      <p class="field-help">保存后会在课程中显示对应图示。</p>
    ` : type === "table" ? renderLessonTableEditor(block) : `
      <label class="editor-field wysiwyg-text-field wysiwyg-${type}">
        <span class="wysiwyg-field-label">${meta.label}内容</span>
        <textarea data-block-field="text" placeholder="${meta.placeholder}">${escapeHtml(block.text || "")}</textarea>
      </label>
    `;
    return `
      <article class="lesson-block-card wysiwyg-block" data-block-type="${type}">
        <header class="lesson-block-head">
          <div><button type="button" class="block-drag-handle" draggable="true" aria-label="拖拽调整${meta.label}顺序" title="按住拖拽排序"><span aria-hidden="true">⋮⋮</span><em>拖拽</em></button><span class="block-number">${index + 1}</span><strong>${meta.label}</strong><small>${meta.hint}</small></div>
          <div class="block-tools" aria-label="调整内容模块">
            <button type="button" data-act="ops-lesson-move-block" data-direction="up" title="上移">↑</button>
            <button type="button" data-act="ops-lesson-move-block" data-direction="down" title="下移">↓</button>
            <button type="button" class="danger-text" data-act="ops-lesson-remove-block" title="删除">删除</button>
          </div>
        </header>
        <div class="lesson-block-body wysiwyg-block-body">${content}</div>
      </article>
    `;
  }

  function collectLessonBlocksFromBuilder() {
    const cards = Array.from(document.querySelectorAll("#ops-lesson-block-builder .lesson-block-card"));
    const blocks = [];
    for (const card of cards) {
      const type = card.dataset.blockType;
      if (type === "ul" || type === "ol") {
        const items = Array.from(card.querySelectorAll("[data-block-field='item']")).map((input) => input.value.trim()).filter(Boolean);
        blocks.push({ type, items });
        continue;
      }
      if (type === "figure") {
        blocks.push({ type, kind: card.querySelector("[data-block-field='kind']")?.value || "day-flow" });
        continue;
      }
      if (type === "table") {
        const headers = Array.from(card.querySelectorAll("[data-block-field='header']")).map((input) => input.value.trim());
        const rows = Array.from(card.querySelectorAll(".lesson-table-row")).map((row) =>
          Array.from(row.querySelectorAll("[data-block-field='cell']")).map((input) => input.value.trim())
        );
        blocks.push({ type, headers, rows });
        continue;
      }
      const text = String(card.querySelector("[data-block-field='text']")?.value || "").trim();
      if (type === "callout") {
        blocks.push({
          type,
          tone: card.querySelector("[data-block-field='tone']")?.value === "warn" ? "warn" : "key",
          title: String(card.querySelector("[data-block-field='title']")?.value || "").trim(),
          text
        });
      } else {
        blocks.push({ type, text });
      }
    }
    return blocks;
  }

  function syncLessonBlocksJson() {
    const blocks = collectLessonBlocksFromBuilder();
    const area = document.getElementById("ops-lesson-blocks");
    if (blocks !== null && area) area.value = JSON.stringify(blocks, null, 2);
    if (blocks !== null) saveLessonDraft();
    return blocks;
  }

  function refreshLessonBlockNumbers() {
    document.querySelectorAll("#ops-lesson-block-builder .lesson-block-card").forEach((card, index) => {
      const number = card.querySelector(".block-number");
      if (number) number.textContent = index + 1;
    });
  }

  function resizeLessonEditorFields(root = document) {
    root.querySelectorAll?.("textarea").forEach((area) => {
      area.style.height = "auto";
      area.style.height = `${Math.max(44, area.scrollHeight)}px`;
    });
  }

  let draggedLessonBlock = null;
  let touchLessonBlockDrag = null;

  function placeDraggedLessonBlock(clientY) {
    const builder = document.getElementById("ops-lesson-block-builder");
    if (!builder || !draggedLessonBlock) return;
    const siblings = Array.from(builder.querySelectorAll(".lesson-block-card")).filter((card) => card !== draggedLessonBlock);
    const before = siblings.find((card) => {
      const rect = card.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2;
    });
    if (before) builder.insertBefore(draggedLessonBlock, before);
    else builder.appendChild(draggedLessonBlock);
  }

  function finishLessonBlockDrag() {
    if (!draggedLessonBlock) return;
    draggedLessonBlock.classList.remove("is-dragging");
    document.getElementById("ops-lesson-block-builder")?.classList.remove("is-sorting");
    draggedLessonBlock = null;
    touchLessonBlockDrag = null;
    refreshLessonBlockNumbers();
    syncLessonBlocksJson();
  }

  function onLessonBlockDragStart(event) {
    const handle = event.target.closest(".block-drag-handle");
    const card = handle?.closest(".lesson-block-card");
    if (!handle || !card) return;
    draggedLessonBlock = card;
    card.classList.add("is-dragging");
    card.parentElement?.classList.add("is-sorting");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", card.dataset.blockType || "content-block");
    }
  }

  function onLessonBlockDragOver(event) {
    if (!draggedLessonBlock || !event.target.closest("#ops-lesson-block-builder")) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    placeDraggedLessonBlock(event.clientY);
  }

  function onLessonBlockDrop(event) {
    if (!draggedLessonBlock) return;
    event.preventDefault();
    finishLessonBlockDrag();
  }

  function onLessonBlockPointerDown(event) {
    if (event.pointerType === "mouse") return;
    const handle = event.target.closest(".block-drag-handle");
    const card = handle?.closest(".lesson-block-card");
    if (!handle || !card) return;
    draggedLessonBlock = card;
    touchLessonBlockDrag = { pointerId: event.pointerId, handle };
    handle.setPointerCapture?.(event.pointerId);
    card.classList.add("is-dragging");
    card.parentElement?.classList.add("is-sorting");
    event.preventDefault();
  }

  function onLessonBlockPointerMove(event) {
    if (!touchLessonBlockDrag || event.pointerId !== touchLessonBlockDrag.pointerId) return;
    event.preventDefault();
    if (event.clientY < 90) window.scrollBy(0, -10);
    else if (event.clientY > window.innerHeight - 90) window.scrollBy(0, 10);
    placeDraggedLessonBlock(event.clientY);
  }

  function onLessonBlockPointerEnd(event) {
    if (!touchLessonBlockDrag || event.pointerId !== touchLessonBlockDrag.pointerId) return;
    touchLessonBlockDrag.handle.releasePointerCapture?.(event.pointerId);
    finishLessonBlockDrag();
  }

  function refreshLessonListNumbers(card) {
    card?.querySelectorAll(".lesson-list-row").forEach((row, index) => {
      const number = row.querySelector("span");
      if (number) number.textContent = index + 1;
    });
  }

  function refreshLessonTableGrid(table) {
    const columns = table?.querySelectorAll("[data-block-field='header']").length || 1;
    if (table) table.style.setProperty("--table-columns", columns);
  }

  function emptyExamQuestion(index) {
    return normalizeQuestion({
      id: `q-${index + 1}-${Date.now()}`,
      type: "single",
      stem: `第 ${index + 1} 题`,
      options: ["是", "否"],
      answer: 0,
      explain: "暂无解析。"
    }, index);
  }

  function renderExamQuestionItem(question, index) {
    const data = normalizeQuestion(question, index);
    const questionType = data.type;
    const options = questionType === "judge" ? [] : Array.isArray(data.options) && data.options.length ? data.options : ["是", "否"];
    const safeStem = escapeHtml(data.stem);
    const answerSingleOptions = options.map((option, optionIndex) =>
      `<option value="${optionIndex}" ${optionIndex === data.answer ? "selected" : ""}>${escapeHtml(option)} (${optionIndex + 1})</option>`).join("");
    const answerMultiOptions = options.map((option, optionIndex) =>
      `<label class="ops-answer-item"><input type="checkbox" data-q="multi-answer" value="${optionIndex}" ${Array.isArray(data.answer) && data.answer.includes(optionIndex) ? "checked" : ""}>${escapeHtml(option)}</label>`).join("");
    const optionItems = options.map((option) =>
      `<div class="ops-option-row">
        <input type="text" data-q="option" value="${escapeHtml(option)}" placeholder="选项内容">
      </div>`).join("");
    const answerArea = questionType === "judge" ? `
      <label>标准答案
        <select data-q="judge-answer">
          <option value="true" ${data.answer === true ? "selected" : ""}>正确</option>
          <option value="false" ${data.answer === false ? "selected" : ""}>错误</option>
        </select>
      </label>` : questionType === "single" ? `
      <label>标准答案（单选）
        <select data-q="single-answer">${answerSingleOptions}</select>
      </label>` : `
      <label>标准答案（多选）
        <div class="ops-answer-box">${answerMultiOptions}</div>
      </label>`;
    return `
      <div class="ops-question" data-question-index="${index}">
        <div class="ops-question-head">
          <strong>题目 ${index + 1}</strong>
          <button type="button" class="ghost" data-act="ops-exam-remove-question">删除题目</button>
        </div>
        <label>题干<textarea data-q="stem" placeholder="请输入题干">${safeStem}</textarea></label>
        <div class="ops-grid">
          <label>题型
            <select data-q="type">
              <option value="single" ${questionType === "single" ? "selected" : ""}>单选</option>
              <option value="multi" ${questionType === "multi" ? "selected" : ""}>多选</option>
              <option value="judge" ${questionType === "judge" ? "selected" : ""}>判断</option>
            </select>
          </label>
          ${answerArea}
        </div>
        <label>选项
          <div class="ops-options" data-q="options">
            ${optionItems}
          </div>
          ${questionType === "judge" ? "<div class='muted'>判断题不需要选项</div>" : "<div class='muted'>直接修改选项内容，再选择正确答案</div>"}
        </label>
        <label>解析<textarea data-q="explain" placeholder="题目解析">${escapeHtml(data.explain)}</textarea></label>
      </div>
    `;
  }

  function renderExamQuestionBuilder(questions) {
    const list = Array.isArray(questions) && questions.length ? questions : [emptyExamQuestion(0)];
    return `<div id="ops-exam-question-builder" class="ops-question-builder">${list.map(renderExamQuestionItem).join("")}</div>`;
  }

  function collectExamQuestionsFromBuilder() {
    const wrapper = document.getElementById("ops-exam-question-builder");
    if (!wrapper) return [];
    const nodes = Array.from(wrapper.querySelectorAll(".ops-question"));
    const result = [];
    nodes.forEach((node, index) => {
      const type = coerceString(node.querySelector('[data-q="type"]')?.value, "single");
      const stem = coerceString(node.querySelector('[data-q="stem"]')?.value, `第 ${index + 1} 题请补充内容`);
      const explain = coerceString(node.querySelector('[data-q="explain"]')?.value, "暂无解析。");
      if (type === "judge") {
        result.push({
          id: `q-${index + 1}`,
          type,
          stem,
          answer: node.querySelector('[data-q="judge-answer"]')?.value === "true",
          explain
        });
        return;
      }
      const options = Array.from(node.querySelectorAll('[data-q="option"]')).map((input) => coerceString(input.value, ""));
      const cleanOptions = options.filter(Boolean);
      const finalOptions = cleanOptions.length ? cleanOptions : ["是", "否"];
      if (type === "multi") {
        const answers = Array.from(node.querySelectorAll('[data-q="multi-answer"]')).filter((box) => box.checked).map((box) => Number(box.value));
        result.push({
          id: `q-${index + 1}`,
          type,
          stem,
          options: finalOptions,
          answer: answers.length ? answers : [0],
          explain
        });
        return;
      }
      const singleAnswer = Math.max(0, Math.min(finalOptions.length - 1, Number(node.querySelector('[data-q="single-answer"]')?.value || 0)));
      result.push({
        id: `q-${index + 1}`,
        type,
        stem,
        options: finalOptions,
        answer: singleAnswer,
        explain
      });
    });
    return result.map((question, index) => normalizeQuestion(question, index));
  }

  function parseQuestionSource(sectionItem) {
    const source = parseJSONArray(sectionItem);
    if (source === null) return null;
    return source.map((question, index) => normalizeQuestion(question, index));
  }

  function parseLessonBlocks(sectionItem) {
    const source = parseJSONArray(sectionItem);
    if (source === null) return null;
    return source.length ? source : [];
  }

  function parseLessonScenes(sectionItem) {
    const source = parseJSONArray(sectionItem);
    if (source === null) return null;
    return source;
  }

  function renderOpsNoticeEditor(item) {
    const data = noticeForEditor(item);
    const timeValue = renderDateTimeInput(data.createdAt);
    const members = Auth.list().filter((user) => user.access !== "blocked");
    const audienceOptions = [
      { value: "all", title: "全体成员", hint: "默认，所有店长和员工都能收到" },
      { value: "staff", title: "普通员工", hint: "发送给所有非店长成员" },
      { value: "manager", title: "店长", hint: "仅店长可见" },
      { value: "selected", title: "指定成员", hint: "只发送给下方勾选的人" }
    ];
    return `
      <form class="card ops-editor" id="ops-editor">
        <p class="kicker">${data.id ? "编辑通知" : "新增通知"}</p>
        <label>标题<input id="ops-notice-title" value="${escapeHtml(data.title)}"></label>
        <label>标签<input id="ops-notice-kicker" value="${escapeHtml(data.kicker)}"></label>
        <label>内容<textarea id="ops-notice-detail">${escapeHtml(data.detail)}</textarea></label>
        <fieldset class="notice-audience">
          <legend>发送给 <span>必选，默认全体成员</span></legend>
          <div class="audience-options">
            ${audienceOptions.map((option) => `<label class="audience-option">
              <input type="radio" name="ops-notice-audience" value="${option.value}" ${data.audience.mode === option.value ? "checked" : ""}>
              <span><b>${option.title}</b><small>${option.hint}</small></span>
            </label>`).join("")}
          </div>
          <div class="audience-members">
            <p>指定成员 <small>选择“指定成员”后生效</small></p>
            ${members.length ? members.map((user) => `<label class="audience-member">
              <input type="checkbox" name="ops-notice-recipient" value="${escapeHtml(user.id)}" ${data.audience.userIds.includes(user.id) ? "checked" : ""}>
              <span><b>${escapeHtml(user.name)}</b><small>${user.role === "manager" ? "店长" : "员工"}</small></span>
            </label>`).join("") : `<p class="muted">暂无可选择成员</p>`}
          </div>
        </fieldset>
        <label>发布时间<input id="ops-notice-createdAt" type="datetime-local" value="${timeValue}"></label>
        <label>重要程度
          <select id="ops-notice-tone">
            <option value="info" ${data.tone === "info" ? "selected" : ""}>一般</option>
            <option value="urgent" ${data.tone === "urgent" ? "selected" : ""}>重要</option>
          </select>
        </label>
        <fieldset class="publish-options">
          <legend>消息提醒</legend>
          ${renderPublishToggle("ops-notice-notify", data.notify, "发送铃铛消息", "发布后进入成员消息列表并显示未读铃铛")}
        </fieldset>
        <div class="actions">
          <button class="primary" type="button" data-act="ops-save" data-section="notices" data-id="${data.id}">${data.id ? "保存通知" : "发布通知"}</button>
          <button class="ghost" type="button" data-act="ops-cancel" data-section="notices">取消</button>
        </div>
      </form>
    `;
  }

  function renderOpsNoticeList() {
    const items = (DATA.notices || []).slice().sort((a, b) => b.createdAt - a.createdAt);
    return `
      <section class="ops-list" aria-label="通知列表">
        <header class="ops-list-head"><div><h3>全部通知</h3><span>共 ${items.length} 条，按发布时间排序</span></div></header>
        ${items.length ? items.map((notice) => `
          <article class="card ops-item-card ${notice.tone === "urgent" ? "is-urgent" : ""}">
            <div class="ops-item-main">
              <div class="ops-item-eyebrow"><span class="ops-tag">${notice.tone === "urgent" ? "重要" : "一般"}</span><time>${renderDateLabel(notice.createdAt)}</time></div>
              <h3>${escapeHtml(notice.title)}</h3>
              <p>${escapeHtml(notice.kicker)} · ${escapeHtml(notice.detail)}</p>
              <div class="ops-meta-list"><span>发送给 ${escapeHtml(noticeAudienceLabel(notice))}</span><span>${notice.notify !== false ? "发送消息提醒" : "静默发布"}</span></div>
            </div>
            <div class="ops-item-actions">
              <button data-act="go" data-hash="#/ops?section=notices&mode=edit&id=${notice.id}">编辑</button>
              <button class="danger-text" data-act="ops-delete" data-section="notices" data-id="${notice.id}">删除</button>
            </div>
          </article>
        `).join("") : `<p class="empty ops-empty">暂无通知。使用右上角“新建通知”发布第一条消息。</p>`}
      </section>
    `;
  }

  function renderOpsLessonEditor(item) {
    const savedDraft = loadLessonDraft();
    const data = lessonForEditor(savedDraft ? { ...item, ...savedDraft, id: item?.id || "" } : item);
    const hasMedia = Boolean(data.mediaUrl);
    return `
      <form class="ops-editor lesson-editor" id="ops-editor">
        <header class="lesson-editor-title">
          <div><p class="kicker">课程编辑</p><h2>${data.id ? "完善课程内容" : "创建一门新课程"}</h2></div>
          <span class="editor-status">草稿自动保留在当前页面</span>
        </header>

        <section class="card editor-section">
          <div class="editor-section-head"><span>01</span><div><h3>基本信息</h3><p>员工在课程列表中首先看到这些内容</p></div></div>
          <label class="editor-field editor-field-main"><span>课程标题</span><input id="ops-lesson-title" value="${escapeHtml(data.title)}" placeholder="例如：火锅店开炉标准流程" autocomplete="off"></label>
          <label class="editor-field"><span>课程简介</span><textarea id="ops-lesson-summary" placeholder="用一两句话说明这门课讲什么、学完能做什么">${escapeHtml(data.summary)}</textarea></label>
          <div class="ops-grid">
            <label class="editor-field"><span>课程形式</span>
              <select id="ops-lesson-type">
                <option value="article" ${data.type === "article" ? "selected" : ""}>图文课程</option>
                <option value="video" ${data.type === "video" ? "selected" : ""}>视频课程</option>
              </select>
            </label>
            <label class="editor-field"><span>学习轨道</span><select id="ops-lesson-track">${DATA.tracks.map((track) => `<option value="${track.id}" ${track.id === data.track ? "selected" : ""}>${escapeHtml(track.title)}</option>`).join("")}</select></label>
            <label class="editor-field"><span>预计学习时长</span><div class="input-suffix"><input id="ops-lesson-minutes" type="number" min="1" value="${data.minutes}"><span>分钟</span></div></label>
            <label class="editor-field"><span>可学习员工</span>
              <select id="ops-lesson-access">
                <option value="full" ${data.access === "full" ? "selected" : ""}>全部员工</option>
                <option value="basic" ${data.access === "basic" ? "selected" : ""}>仅基础权限员工</option>
              </select>
            </label>
          </div>
        </section>

        <section class="card editor-section">
          <div class="editor-section-head"><span>02</span><div><h3>课程正文</h3><p>编辑内容即为最终效果，按住拖拽手柄可调整顺序</p></div></div>
          <div class="lesson-block-builder" id="ops-lesson-block-builder">
            ${data.blocks.map((block, index) => renderLessonBlockItem(block, index)).join("")}
          </div>
          <div class="block-add">
            <p>添加内容</p>
            <div>
              <button type="button" data-act="ops-lesson-insert-block" data-block="p"><b>+</b> 正文</button>
              <button type="button" data-act="ops-lesson-insert-block" data-block="h"><b>+</b> 小标题</button>
              <button type="button" data-act="ops-lesson-insert-block" data-block="callout"><b>+</b> 重点提示</button>
              <button type="button" data-act="ops-lesson-insert-block" data-block="lead"><b>+</b> 课程引导</button>
              <button type="button" data-act="ops-lesson-insert-block" data-block="ul"><b>+</b> 要点清单</button>
              <button type="button" data-act="ops-lesson-insert-block" data-block="ol"><b>+</b> 操作步骤</button>
              <button type="button" data-act="ops-lesson-insert-block" data-block="figure"><b>+</b> 课程图示</button>
              <button type="button" data-act="ops-lesson-insert-block" data-block="table"><b>+</b> 数据表格</button>
            </div>
          </div>
        </section>

        <section class="card editor-section video-editor-section" data-video-panel ${data.type === "video" ? "" : "hidden"}>
          <div class="editor-section-head"><span>03</span><div><h3>课程视频</h3><p>支持 MP4、MOV、WebM，建议单个文件不超过 200MB</p></div></div>
          <label class="video-dropzone" for="ops-lesson-media">
            <span class="video-drop-icon">↑</span>
            <strong>${hasMedia ? "更换视频" : "选择本地视频"}</strong>
            <small class="lesson-media-status">${hasMedia ? "当前课程已有视频，可预览或重新上传" : "点击此处选择文件"}</small>
            <input id="ops-lesson-media" type="file" accept="video/*">
          </label>
          <div class="media-preview" ${hasMedia ? "" : "hidden"}>${hasMedia ? `<video src="${escapeHtml(data.mediaUrl)}" controls></video>` : ""}</div>
          <input type="hidden" id="ops-lesson-media-url" value="${escapeHtml(data.mediaUrl)}">
          <button type="button" class="remove-media" data-act="ops-lesson-clear-media" ${hasMedia ? "" : "hidden"}>移除当前视频</button>
        </section>

        <section class="card editor-section lesson-group-editor">
          <div class="editor-section-head"><span data-lesson-step="group">${data.type === "video" ? "04" : "03"}</span><div><h3>发布分组</h3><p>勾选这门课程需要出现在哪些分组</p></div></div>
          ${renderLessonGroupOptions(data.groupIds)}
        </section>

        <section class="card editor-section lesson-completion-editor">
          <div class="editor-section-head"><span data-lesson-step="completion">${data.type === "video" ? "05" : "04"}</span><div><h3>完成与通知</h3><p>设置员工完成本课的条件，以及发布后是否提醒</p></div></div>
          <label class="editor-field"><span>衔接考试</span>
            <select id="ops-lesson-required-exam">
              <option value="">不关联考试</option>
              ${DATA.exams.map((exam) => `<option value="${escapeHtml(exam.id)}" ${exam.id === data.requiredExamId ? "selected" : ""}>${escapeHtml(exam.title)} · ${exam.pass} 分通过</option>`).join("")}
            </select>
            <small>选择后，员工必须通过这场考试，本教程才会显示为已完成。</small>
          </label>
          <div class="publish-options">
            ${renderPublishToggle("ops-lesson-require-confirmation", data.requireConfirmation, "阅读后需要确认", "不关联考试时，正文末尾显示“确认完成本课”按钮；关闭后阅读即完成")}
            ${renderPublishToggle("ops-lesson-notify", data.notify, "发送铃铛消息", "发布后进入成员消息列表并显示未读铃铛")}
          </div>
        </section>

        <textarea id="ops-lesson-blocks" hidden>${escapeHtml(JSON.stringify(data.blocks))}</textarea>
        <textarea id="ops-lesson-scenes" hidden>${escapeHtml(JSON.stringify(data.scenes))}</textarea>

        <div class="editor-actions">
          <button class="ghost" type="button" data-act="ops-cancel" data-section="lessons">取消</button>
          <button class="primary" type="button" data-act="ops-save" data-section="lessons" data-id="${data.id}">${data.id ? "保存修改" : "发布课程"}</button>
        </div>
      </form>
    `;
  }

  function renderOpsLessonList() {
    return `
      <details class="card course-group-manager">
        <summary class="course-group-summary">
          <span class="course-group-symbol" aria-hidden="true">${svgIcon("group")}</span>
          <span><strong>课程分组</strong><small>${DATA.courseGroups.length} 个分组 · 管理课程的发布范围</small></span>
          <i aria-hidden="true"></i>
        </summary>
        <div class="course-group-panel">
          <div class="course-group-head">
            <div><h3>管理发布分组</h3><span>分组可自定义名称；一门课程可以发布到多个分组。</span></div>
            <div class="course-group-create"><input id="ops-group-new-name" maxlength="30" placeholder="新分组名称" aria-label="新分组名称"><button type="button" class="primary" data-act="ops-group-add">新增分组</button></div>
          </div>
          <div class="course-group-list">${DATA.courseGroups.map((group) => {
          const count = DATA.lessons.filter((lesson) => lesson.groupIds?.includes(group.id)).length;
          return `<div class="course-group-row" data-group-id="${escapeHtml(group.id)}">
            <input data-group-name value="${escapeHtml(group.name)}" maxlength="30" aria-label="分组名称">
            <span>${count} 门课程</span>
            <button type="button" data-act="ops-group-rename" data-id="${escapeHtml(group.id)}">保存名称</button>
            <button type="button" class="danger" data-act="ops-group-delete" data-id="${escapeHtml(group.id)}">删除</button>
          </div>`;
        }).join("")}</div></div>
      </details>
      <section class="ops-list" aria-label="课程列表">
        <header class="ops-list-head"><div><h3>全部课程</h3><span>共 ${DATA.lessons.length} 门课程</span></div></header>
        ${DATA.lessons.length ? DATA.lessons.map((lesson) => `
          <article class="card ops-item-card">
            <div class="ops-item-main">
              <div class="ops-item-eyebrow"><span class="ops-tag">${TYPE_LABEL[lesson.type] || lesson.type}</span><span>${minutesLabel(lesson.minutes)}</span></div>
              <h3>${escapeHtml(lesson.title)}</h3>
              <p>${escapeHtml(lesson.summary)}</p>
              <div class="ops-meta-list"><span>${escapeHtml(lessonGroupNames(lesson).join("、") || "未分组")}</span><span>${escapeHtml(lessonCompletionLabel(lesson))}</span><span>${lesson.notify !== false ? "发布后提醒" : "静默发布"}</span></div>
            </div>
            <div class="ops-item-actions">
              <button data-act="go" data-hash="#/ops?section=lessons&mode=edit&id=${lesson.id}">编辑</button>
              <button class="danger-text" data-act="ops-delete" data-section="lessons" data-id="${lesson.id}">删除</button>
            </div>
          </article>
        `).join("") : `<p class="empty ops-empty">暂无课程。使用右上角“新建课程”开始创建。</p>`}
      </section>
    `;
  }

  function renderOpsExamEditor(item) {
    const data = examForEditor(item);
    const questionDrafts = data.questions.length ? data.questions : [emptyExamQuestion(0)];
    return `
      <form class="card ops-editor" id="ops-editor">
        <p class="kicker">${data.id ? "编辑考试" : "新增考试"}</p>
        <label>标题<input id="ops-exam-title" value="${escapeHtml(data.title)}" placeholder="考试标题"></label>
        <div class="ops-grid">
          <label>轨道
            <select id="ops-exam-track">
              ${DATA.tracks.map((track) => `<option value="${track.id}" ${track.id === data.track ? "selected" : ""}>${escapeHtml(track.title)}</option>`).join("")}
            </select>
          </label>
          <label>及格分
            <input id="ops-exam-pass" type="number" min="1" max="100" value="${data.pass}">
          </label>
          <label>时长（分钟）
            <input id="ops-exam-minutes" type="number" min="1" value="${data.minutes}">
          </label>
        </div>
        <label>简介<textarea id="ops-exam-summary">${escapeHtml(data.summary)}</textarea></label>
        <fieldset class="publish-options">
          <legend>消息提醒</legend>
          ${renderPublishToggle("ops-exam-notify", data.notify, "发送铃铛消息", "发布后进入成员消息列表并显示未读铃铛")}
        </fieldset>
        <label>题目（可视化编辑）
          <div class="actions">
            <button type="button" class="ghost" data-act="ops-exam-add-question">新增题目</button>
          </div>
          ${renderExamQuestionBuilder(questionDrafts)}
        </label>
        <textarea id="ops-exam-questions" hidden>${escapeHtml(JSON.stringify(questionDrafts))}</textarea>
        <div class="actions">
          <button class="primary" type="button" data-act="ops-save" data-section="exams" data-id="${data.id}">${data.id ? "保存考试" : "发布考试"}</button>
          <button class="ghost" type="button" data-act="ops-cancel" data-section="exams">取消</button>
        </div>
      </form>
    `;
  }

  function renderOpsExamList() {
    return `
      <section class="ops-list" aria-label="考试列表">
        <header class="ops-list-head"><div><h3>全部考试</h3><span>共 ${DATA.exams.length} 场考试</span></div></header>
        ${DATA.exams.length ? DATA.exams.map((exam) => `
          <article class="card ops-item-card">
            <div class="ops-item-main">
              <div class="ops-item-eyebrow"><span class="ops-tag">${exam.pass} 分及格</span><span>${minutesLabel(exam.minutes)}</span></div>
              <h3>${escapeHtml(exam.title)}</h3>
              <p>${escapeHtml(exam.summary)}</p>
              <div class="ops-meta-list"><span>${exam.questions?.length || 0} 道题</span><span>${exam.notify !== false ? "发布后提醒" : "静默发布"}</span></div>
            </div>
            <div class="ops-item-actions">
              <button data-act="go" data-hash="#/ops?section=exams&mode=edit&id=${exam.id}">编辑</button>
              <button class="danger-text" data-act="ops-delete" data-section="exams" data-id="${exam.id}">删除</button>
            </div>
          </article>
        `).join("") : `<p class="empty ops-empty">暂无考试。使用右上角“新建考试”开始创建。</p>`}
      </section>
    `;
  }

  function renderOpsStaff() {
    const people = Auth.list().sort((a, b) => Number(a.access !== "basic") - Number(b.access !== "basic") || a.name.localeCompare(b.name, "zh"));
    const pending = people.filter((user) => user.access === "basic" && user.role !== "manager").length;
    const memberData = people.map((user) => {
      const cached = user.id === Auth.session.id
        ? { progress: state.progress, lastSeenAt: Number(state.progress.lastSeenAt) || Date.now(), available: true }
        : StaffProgress.rows.get(user.id);
      if (!cached) return { user, loading: true };
      const progress = cached.progress;
      const lessonDone = DATA.lessons.filter((lesson) => lessonCompletedForProgress(lesson, progress));
      const examDone = DATA.exams.filter((exam) => {
        const attempts = Array.isArray(progress.examHistory?.[exam.id]) ? progress.examHistory[exam.id] : [];
        const best = attempts.reduce((score, attempt) => Math.max(score, Number(attempt?.score ?? attempt) || 0), 0);
        return best >= exam.pass;
      });
      const total = DATA.lessons.length + DATA.exams.length;
      const percent = total ? Math.round(((lessonDone.length + examDone.length) / total) * 100) : 0;
      const lastSeenAt = Number(progress.lastSeenAt) || cached.lastSeenAt || 0;
      return { user, progress, lessonDone, examDone, percent, lastSeenAt, available: cached.available };
    });
    const completeValues = memberData.filter((item) => !item.loading).map((item) => item.percent);
    const average = completeValues.length ? Math.round(completeValues.reduce((sum, value) => sum + value, 0) / completeValues.length) : 0;
    const onlineNow = memberData.filter((item) => item.lastSeenAt && Date.now() - item.lastSeenAt < 90000).length;
    const formatDuration = (seconds) => {
      const value = Math.max(0, Number(seconds) || 0);
      if (value < 60) return value ? "不足 1 分钟" : "0 分钟";
      const hours = Math.floor(value / 3600);
      const minutes = Math.floor((value % 3600) / 60);
      return hours ? `${hours} 小时${minutes ? ` ${minutes} 分钟` : ""}` : `${minutes} 分钟`;
    };
    const formatSeen = (value) => value
      ? new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
      : "尚未产生记录";
    return `
      <div class="staff-toolbar">
        <span class="staff-sync-note"><i aria-hidden="true"></i>学习状态每 30 秒自动更新</span>
        <button type="button" class="ghost" data-staff-refresh>刷新</button>
      </div>
      <div class="counts staff-counts" aria-label="成员数据摘要">
        <div class="count"><span>注册成员</span><b>${people.length}</b></div>
        <div class="count ${pending ? "hot" : ""}"><span>待授权</span><b>${pending}</b></div>
        <div class="count"><span>当前在线</span><b>${onlineNow}</b></div>
        <div class="count"><span>平均完成度</span><b>${average}%</b></div>
      </div>
      <div class="staff-list-title">
        <div><strong>成员</strong><span>${people.length} 人</span></div>
        <span>学习进度与权限</span>
      </div>
      <div class="staff-list">
        ${memberData.map((item) => {
          const user = item.user;
          if (item.loading) return `
            <article class="staff-member is-loading">
              <div class="staff-member-head"><span class="staff-avatar">${escapeHtml(user.name.slice(0, 1))}</span><div><strong>${escapeHtml(user.name)}</strong><small>正在读取学习数据...</small></div></div>
              <div class="staff-loading-line"></div>
            </article>`;
          const isOnline = item.lastSeenAt && Date.now() - item.lastSeenAt < 90000;
          const pendingLessons = DATA.lessons.filter((lesson) => !lessonCompletedForProgress(lesson, item.progress));
          const passedExamIds = new Set(item.examDone.map((exam) => exam.id));
          const pendingExams = DATA.exams.filter((exam) => !passedExamIds.has(exam.id));
          return `
            <article class="staff-member ${user.access === "blocked" ? "is-blocked" : ""}">
              <div class="staff-member-head">
                <span class="staff-avatar">${escapeHtml(user.name.slice(0, 1))}</span>
                <div class="staff-identity">
                  <div><strong>${escapeHtml(user.name)}</strong><span class="staff-role">${user.role === "manager" ? "店长" : "员工"}</span></div>
                  <small><i class="staff-presence ${isOnline ? "on" : ""}"></i>${isOnline ? "当前在线" : `最后在线 ${formatSeen(item.lastSeenAt)}`}</small>
                </div>
                <div class="staff-percent" style="--percent:${item.percent * 3.6}deg"><b>${item.percent}%</b><span>完成度</span></div>
              </div>
              <div class="staff-progress-track"><i style="width:${item.percent}%"></i></div>
              <div class="staff-metrics">
                <div><b>${item.lessonDone.length}<small> / ${DATA.lessons.length}</small></b><span>完成课程</span></div>
                <div><b>${item.examDone.length}<small> / ${DATA.exams.length}</small></b><span>通过考试</span></div>
                <div><b>${formatDuration(item.progress.onlineSeconds)}</b><span>累计在线学习</span></div>
              </div>
              <details class="staff-detail">
                <summary>查看学习明细 <span>${pendingLessons.length + pendingExams.length ? `${pendingLessons.length + pendingExams.length} 项待完成` : "已全部完成"}</span></summary>
                <div class="staff-detail-body">
                  <section><strong>待学习课程</strong><p>${pendingLessons.length ? pendingLessons.map((lesson) => escapeHtml(lesson.title)).join("、") : "课程已全部完成"}</p></section>
                  <section><strong>待通过考试</strong><p>${pendingExams.length ? pendingExams.map((exam) => escapeHtml(exam.title)).join("、") : "考试已全部通过"}</p></section>
                  <section><strong>账号权限</strong><p>${staffAccessLabel(user)}${user.approvedBy ? ` · 由 ${escapeHtml(user.approvedBy)} 授权` : ""}</p></section>
                  <div class="tools staff-actions">
                    ${user.access !== "full" && user.access !== "blocked" ? `<button data-act="ops-staff-auth" data-id="${user.id}" data-access="full">开放全部学习内容</button>` : ""}
                    ${user.access === "full" && user.id !== Auth.session.id ? `<button data-act="ops-staff-auth" data-id="${user.id}" data-access="basic">改为基础权限</button>` : ""}
                    ${user.access !== "blocked" && user.id !== Auth.session.id ? `<button data-act="ops-staff-auth" data-id="${user.id}" data-access="blocked">停用账号</button>` : ""}
                    ${user.access === "blocked" ? `<button data-act="ops-staff-auth" data-id="${user.id}" data-access="basic">恢复账号</button>` : ""}
                  </div>
                </div>
              </details>
            </article>`;
        }).join("")}
      </div>
    `;
  }

  function renderOps() {
    if (!Auth.isManager(Auth.session)) {
      setTop("权限不足", true);
      setTab("me");
      view().innerHTML = `
        <div class="card notice clear">
          <strong>只有店长可以进入运营事务。</strong>
          <p class="muted">请先用店长账号登录后重试。</p>
          <button class="ghost" data-act="back">返回上一页</button>
        </div>
      `;
      return;
    }
    const route = currentOpsRoute();
    const titleMap = {
      lessons: "课程管理",
      exams: "考试管理",
      notices: "通知",
      staff: "员工与权限"
    };
    const subtitleMap = {
      lessons: "创建、更新并安排员工需要学习的课程",
      exams: "维护考试、题目和合格标准",
      notices: "发布门店事务、重要消息与学习提醒",
      staff: "查看成员状态并管理学习权限"
    };
    const actionMap = {
      lessons: { label: "新建课程", hash: "#/ops?section=lessons&mode=add" },
      exams: { label: "新建考试", hash: "#/ops?section=exams&mode=add" },
      notices: { label: "新建通知", hash: "#/ops?section=notices&mode=add" }
    };
    setTop("运营事务", true);
    setTab("me");
    const editId = route.mode === "edit" ? route.id : "";
    const active = route.section;
    const editLesson = editId && active === "lessons" ? DATA.lessons.find((item) => item.id === editId) : null;
    const editExam = editId && active === "exams" ? DATA.exams.find((item) => item.id === editId) : null;
    const editNotice = editId && active === "notices" ? DATA.notices.find((item) => item.id === editId) : null;
    const listMap = {
      lessons: active === "lessons" ? (route.mode === "edit" ? renderOpsLessonEditor(editLesson) : renderOpsLessonList()) : "",
      exams: active === "exams" ? (route.mode === "edit" ? renderOpsExamEditor(editExam) : renderOpsExamList()) : "",
      notices: active === "notices" ? (route.mode === "edit" ? renderOpsNoticeEditor(editNotice) : renderOpsNoticeList()) : "",
      staff: active === "staff" ? renderOpsStaff() : ""
    };
    const content = route.mode === "add"
      ? (active === "lessons" ? renderOpsLessonEditor(null)
        : active === "exams" ? renderOpsExamEditor(null)
        : active === "notices" ? renderOpsNoticeEditor(null)
        : listMap[active])
      : listMap[active];

    const isEditing = route.mode === "add" || route.mode === "edit";
    view().innerHTML = `
      <div class="ops-shell">
        <aside class="ops-sidebar">
          <div class="ops-brand">
            <span>AO</span>
            <div><strong>运营工作台</strong><small>门店学习与事务</small></div>
          </div>
          ${renderOpsTabs(active)}
          <div class="ops-account"><span>${escapeHtml((Auth.session.name || "店长").slice(0, 1))}</span><div><strong>${escapeHtml(Auth.session.name || "店长")}</strong><small>店长账号</small></div></div>
        </aside>
        <main class="ops-workspace ${isEditing ? "is-editing" : ""} ${active === "staff" ? "is-staff" : ""}">
          ${isEditing ? `<div class="ops-breadcrumb"><button data-act="ops-cancel" data-section="${active}">← 返回${titleMap[active]}</button><span>${route.mode === "add" ? "新建" : "编辑"}</span></div>` : `
            <header class="ops-workspace-head">
              <div><p>运营事务</p><h2>${titleMap[active]}</h2><span>${subtitleMap[active]}</span></div>
              ${actionMap[active] ? `<button class="primary ops-header-action" data-act="go" data-hash="${actionMap[active].hash}" aria-label="${actionMap[active].label}">${svgIcon("add")}<span>${actionMap[active].label}</span></button>` : ""}
            </header>
          `}
          <div class="ops-content">${content}</div>
        </main>
      </div>
    `;
    if (isEditing && active === "lessons") resizeLessonEditorFields(view());
    if (active === "staff") {
      StaffProgress.load();
      view().querySelector("[data-staff-refresh]")?.addEventListener("click", (event) => {
        event.currentTarget.disabled = true;
        event.currentTarget.textContent = "刷新中...";
        StaffProgress.load(true);
      });
    }
  }

  function openLesson(id) {
    const lesson = lessonById(id);
    if (!lesson) return go("#/home");
    if (!Gate.canLesson(lesson)) return renderLocked(lesson.title);
    markPublishedContentRead("lesson", lesson);
    state.progress.last = { type: "lesson", id };
    save();
    touchStreak();
    if (lesson.type === "article") return renderArticle(lesson);
    if (lesson.type === "video") return startVideo(lesson);
    return go("#/learn");
  }

  function renderLocked(title) {
    setTop(title || "需要授权", true);
    view().innerHTML = `
      <div class="card lock-card">
        <p class="kicker">权限不足</p>
        <strong>这份内容需要店长授权</strong>
        <p class="muted">当前账号暂未开通这项内容。如需学习，请联系店长。</p>
        <button class="primary" data-act="back">返回上一页</button>
      </div>
    `;
  }

  function lessonCompletionPanel(lesson, unlocked = true) {
    if (isDone(lesson.id)) {
      return `<footer class="lesson-completion-panel is-done"><div><strong>本课已完成</strong><span>学习记录已保存</span></div><button class="primary" data-act="complete" data-id="${lesson.id}">继续学习</button></footer>`;
    }
    const linkedExam = lesson.requiredExamId ? examById(lesson.requiredExamId) : null;
    if (lesson.requiredExamId) {
      if (!linkedExam || !Gate.canExam(linkedExam)) {
        return `<footer class="lesson-completion-panel is-locked"><div><strong>关联考试暂不可用</strong><span>请联系店长检查考试配置或权限</span></div></footer>`;
      }
      return `<footer class="lesson-completion-panel"><div><strong>通过考试后完成本课</strong><span>${escapeHtml(linkedExam.title)} · ${linkedExam.pass} 分通过</span></div><button class="primary" data-act="lesson-exam" data-exam-id="${linkedExam.id}" ${unlocked ? "" : "disabled"}>${unlocked ? "参加考试" : "看完视频后参加考试"}</button></footer>`;
    }
    if (lesson.requireConfirmation) {
      return `<footer class="lesson-completion-panel"><div><strong>确认学习结果</strong><span>${unlocked ? "确认后，本课将计入已完成" : "视频播放结束后即可确认"}</span></div><button class="primary" data-act="complete" data-id="${lesson.id}" ${unlocked ? "" : "disabled"}>${unlocked ? "确认完成本课" : "看完视频后可确认"}</button></footer>`;
    }
    return `<footer class="lesson-completion-panel is-auto" data-auto-complete role="status" aria-live="polite"><div><strong>${unlocked ? "正在记录学习结果" : "看完视频后自动完成"}</strong><span>${unlocked ? "阅读到本页末尾后自动完成，无需再次确认" : "播放结束时会自动保存完成状态"}</span></div><i aria-hidden="true"></i></footer>`;
  }

  function bindArticleAutoCompletion(lesson) {
    const panel = view().querySelector("[data-auto-complete]");
    if (!panel || isDone(lesson.id)) return;
    const finish = () => {
      if (!panel.isConnected || state.route.name !== "lesson" || state.route.id !== lesson.id) {
        window.removeEventListener("scroll", check);
        return;
      }
      if (panel.getBoundingClientRect().bottom > window.innerHeight + 24) return;
      window.removeEventListener("scroll", check);
      completeLesson(lesson.id);
      panel.classList.add("is-done");
      panel.innerHTML = `<div><strong>本课已自动完成</strong><span>学习记录已保存</span></div><span class="lesson-complete-check" aria-hidden="true">✓</span>`;
    };
    const check = () => requestAnimationFrame(finish);
    window.addEventListener("scroll", check, { passive: true });
    requestAnimationFrame(finish);
  }

  function renderArticle(lesson) {
    setTop(lesson.title, true);
    view().innerHTML = `
      <article class="article">
        <p class="muted">${TYPE_LABEL.article} · ${minutesLabel(lesson.minutes)}</p>
        ${renderBlocks(lesson.blocks)}
        ${lessonCompletionPanel(lesson)}
      </article>
    `;
    if (!lesson.requiredExamId && !lesson.requireConfirmation) bindArticleAutoCompletion(lesson);
  }

  function lessonVideoSource(lesson) {
    if (lesson.mediaUrl) return lesson.mediaUrl;
    const mediaScene = lesson.scenes.find((scene) => scene.stage?.kind === "media" && scene.stage.src);
    return mediaScene?.stage?.src || "";
  }

  function videoTimeLabel(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
    const value = Math.floor(seconds);
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const secs = String(value % 60).padStart(2, "0");
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
  }

  function startVideo(lesson) {
    state.video = { id: lesson.id, t: 0, duration: 0, playing: false, speed: 1, watchedToEnd: isDone(lesson.id) };
    renderVideo();
  }

  function updateLessonVideoUi(video) {
    if (!state.video || !video) return;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    const progress = duration ? Math.min(100, (current / duration) * 100) : 0;
    state.video.t = current;
    state.video.duration = duration;
    state.video.playing = !video.paused && !video.ended;

    const player = video.closest(".video-course");
    const fill = player?.querySelector(".video-timeline > i");
    const time = player?.querySelector(".video-time");
    const durationMeta = player?.querySelector("[data-video-duration]");
    const status = player?.querySelector("[data-video-status]");
    const toggle = player?.querySelector('[data-act="video-toggle"]');
    const complete = player?.querySelector('[data-act="complete"], [data-act="lesson-exam"]');
    if (fill) fill.style.width = `${progress}%`;
    if (time) time.textContent = `${videoTimeLabel(current)} / ${videoTimeLabel(duration)}`;
    if (durationMeta) durationMeta.textContent = duration ? `实际时长 ${videoTimeLabel(duration)}` : "正在读取视频";
    if (status) status.textContent = state.video.watchedToEnd ? "已看完" : current > 0 ? `已观看 ${Math.floor(progress)}%` : "尚未开始";
    if (toggle) toggle.textContent = state.video.playing ? "暂停" : current > 0 && !video.ended ? "继续" : "播放";
    if (complete) {
      const unlocked = state.video.watchedToEnd || isDone(state.video.id);
      complete.disabled = !unlocked;
      if (!isDone(state.video.id)) {
        if (lessonById(state.video.id)?.requiredExamId) complete.textContent = unlocked ? "参加考试" : "看完视频后参加考试";
        else complete.textContent = unlocked ? "确认完成本课" : "看完视频后可确认";
      }
    }
  }

  function fitLessonVideoToSquare(video) {
    const width = Number(video?.videoWidth || 0);
    const height = Number(video?.videoHeight || 0);
    if (!video || !width || !height) return;
    const ratio = width / height;
    video.style.aspectRatio = `${width} / ${height}`;
    if (ratio >= 1) {
      video.style.width = "100%";
      video.style.height = `${100 / ratio}%`;
    } else {
      video.style.width = `${ratio * 100}%`;
      video.style.height = "100%";
    }
  }

  function bindLessonVideo() {
    const video = document.getElementById("lesson-video");
    if (!video || !state.video) return;
    video.playbackRate = state.video.speed;
    const update = () => updateLessonVideoUi(video);
    const fitAndUpdate = () => {
      fitLessonVideoToSquare(video);
      update();
    };
    video.addEventListener("loadedmetadata", fitAndUpdate);
    video.addEventListener("loadeddata", fitAndUpdate);
    video.addEventListener("resize", fitAndUpdate);
    video.addEventListener("durationchange", update);
    video.addEventListener("timeupdate", update);
    video.addEventListener("play", update);
    video.addEventListener("pause", update);
    video.addEventListener("ratechange", update);
    video.addEventListener("ended", () => {
      state.video.watchedToEnd = true;
      state.video.playing = false;
      const lesson = lessonById(state.video.id);
      if (lesson && !lesson.requiredExamId && !lesson.requireConfirmation && !isDone(lesson.id)) {
        completeLesson(lesson.id);
        renderVideo();
        return;
      }
      update();
    });
    video.addEventListener("error", () => {
      const status = video.closest(".video-course")?.querySelector("[data-video-status]");
      if (status) status.textContent = "视频加载失败，请检查网络";
    });
    fitAndUpdate();
  }

  function renderVideo() {
    const lesson = lessonById(state.video.id);
    const source = lessonVideoSource(lesson);
    const done = isDone(lesson.id);
    const unlocked = state.video.watchedToEnd || done;
    setTop(lesson.title, true);
    view().innerHTML = `
      <article class="video-course">
        <header class="video-course-head">
          <div><span class="video-course-kicker">视频课程</span><h2>${escapeHtml(lesson.title)}</h2></div>
          <p>${escapeHtml(lesson.summary)}</p>
          <div class="video-course-meta"><span data-video-status>${done ? "已完成" : "尚未开始"}</span><span data-video-duration>${source ? "正在读取视频" : "暂无视频"}</span></div>
        </header>

        <section class="video-player-card">
          <div class="video-frame">
            ${source ? `<video id="lesson-video" src="${escapeHtml(source)}" controls playsinline preload="metadata"></video>` : `<div class="video-empty"><strong>暂时无法播放</strong><span>请稍后再试。</span></div>`}
          </div>
          ${source ? `
          <div class="video-playback">
            <button class="video-timeline" data-act="scrub" aria-label="调整视频播放进度"><i></i></button>
            <div class="video-player-actions">
              <div>
                <button class="video-control" data-act="video-skip" data-delta="-10" aria-label="后退 10 秒">−10</button>
                <button class="video-control video-control-main" data-act="video-toggle">播放</button>
                <button class="video-control" data-act="video-speed">${state.video.speed}×</button>
              </div>
              <span class="video-time">0:00 / --:--</span>
            </div>
          </div>` : ""}
        </section>

        <section class="video-key-card">
          <header><div><span>课程重点</span><h3>边看边掌握关键信息</h3></div><small>${lesson.blocks.length} 项内容</small></header>
          <div class="video-key-content">${renderBlocks(lesson.blocks)}</div>
        </section>

        ${lesson.scenes.length > 1 ? `<section class="video-chapter-card">
          <header><span>内容提要</span><strong>${lesson.scenes.length} 个章节</strong></header>
          <div class="video-chapter-list">${lesson.scenes.map((scene, index) => `<div><b>${String(index + 1).padStart(2, "0")}</b><span><strong>${escapeHtml(scene.title)}</strong><small>${escapeHtml(scene.caption)}</small></span></div>`).join("")}</div>
        </section>` : ""}

        ${lessonCompletionPanel(lesson, unlocked)}
      </article>
    `;
    bindLessonVideo();
  }

  function startExam(id) {
    const exam = examById(id);
    if (!exam) return go("#/exams");
    if (!Gate.canExam(exam)) return renderLocked(exam.title);
    markPublishedContentRead("exam", exam);
    if (!exam.questions.length) {
      alert("这项考试正在准备中，请稍后再试。");
      return go("#/exams");
    }
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
      DATA.lessons
        .filter((lesson) => lesson.requiredExamId === exam.id)
        .forEach((lesson) => {
          if (!state.progress.completed[lesson.id]) state.progress.completed[lesson.id] = record.at;
        });
    }
    state.progress.wrong = Array.from(map.values());
    state.exam.result = { score, correct, total: exam.questions.length, pass: score >= exam.pass, wrong, at: record.at };
    touchStreak();
    save();
    updateNotificationButton();
    go(`#/exam/${exam.id}/result`);
  }

  function renderResult() {
    const exam = examById(state.route.id);
    const currentResult = state.exam?.id === exam.id ? state.exam.result : null;
    const selectedRecord = state.route.at
      ? (state.progress.examHistory[exam.id] || []).find((item) => Number(item?.at) === state.route.at)
      : null;
    const result = selectedRecord
      ? { ...selectedRecord, wrong: currentResult?.at === selectedRecord.at ? currentResult.wrong : [] }
      : currentResult;
    const best = bestScore(exam.id);
    const score = result?.score ?? best;
    const pass = score >= exam.pass;
    const history = (state.progress.examHistory[exam.id] || []).map((record) => ({
      score: Number(record?.score ?? record) || 0,
      correct: Number(record?.correct) || 0,
      total: Number(record?.total) || exam.questions.length,
      at: Number(record?.at) || 0
    }));
    const celebrationToken = result?.at ? `${exam.id}:${result.at}` : "";
    let playCelebrationIntro = false;
    if (pass && currentResult && !state.route.at && celebrationToken) {
      const celebrationKey = "academy-pass-celebration";
      try {
        playCelebrationIntro = sessionStorage.getItem(celebrationKey) !== celebrationToken;
        if (playCelebrationIntro) sessionStorage.setItem(celebrationKey, celebrationToken);
      } catch (_) {
        playCelebrationIntro = true;
      }
    }
    setTop(exam.title, true);
    view().innerHTML = `
      ${pass ? `
        <section class="pass-celebration ${playCelebrationIntro ? "is-intro" : "is-idle"}" aria-label="恭喜通过考试">
          <svg viewBox="0 0 440 330" role="img" aria-labelledby="pass-celebration-title pass-celebration-desc">
            <title id="pass-celebration-title">恭喜你通过考试</title>
            <desc id="pass-celebration-desc">现代环形成绩卡庆祝动画</desc>
            <defs>
              <linearGradient id="pass-bg" x1="24" y1="18" x2="376" y2="386" gradientUnits="userSpaceOnUse">
                <stop stop-color="#07162d"/><stop offset=".52" stop-color="#0a2f68"/><stop offset="1" stop-color="#1255da"/>
              </linearGradient>
              <radialGradient id="pass-glow" cx="0" cy="0" r="1" gradientTransform="translate(286 92) rotate(126) scale(250)">
                <stop stop-color="#3c83ff" stop-opacity=".8"/><stop offset="1" stop-color="#3c83ff" stop-opacity="0"/>
              </radialGradient>
              <linearGradient id="pass-ring" x1="102" y1="101" x2="300" y2="311" gradientUnits="userSpaceOnUse">
                <stop stop-color="#82f7c6"/><stop offset=".5" stop-color="#46dca7"/><stop offset="1" stop-color="#b5ff74"/>
              </linearGradient>
              <linearGradient id="pass-sheen" x1="0" y1="0" x2="1" y2="0">
                <stop stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
              </linearGradient>
              <filter id="pass-shadow" x="-20%" y="-20%" width="140%" height="150%">
                <feDropShadow dx="0" dy="20" stdDeviation="20" flood-color="#00112f" flood-opacity=".3"/>
              </filter>
              <filter id="pass-ring-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="light-burst-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="2.8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <radialGradient id="message-core" cx="50%" cy="48%" r="52%">
                <stop offset="0" stop-color="#0b2650" stop-opacity=".98"/><stop offset=".72" stop-color="#071a35" stop-opacity=".94"/><stop offset="1" stop-color="#071a35" stop-opacity=".25"/>
              </radialGradient>
              <linearGradient id="party-banner" x1="0" y1="0" x2="1" y2="1">
                <stop stop-color="#ffc91a"/><stop offset="1" stop-color="#ff9800"/>
              </linearGradient>
              <linearGradient id="party-card-fill" x1="0" y1="0" x2="0" y2="1">
                <stop stop-color="#fffef4"/><stop offset="1" stop-color="#fff2c7"/>
              </linearGradient>
              <linearGradient id="party-star" x1="0" y1="0" x2="1" y2="1">
                <stop stop-color="#fff46a"/><stop offset=".55" stop-color="#ffc51d"/><stop offset="1" stop-color="#ff8a00"/>
              </linearGradient>
              <radialGradient id="party-medal" cx="38%" cy="28%" r="75%">
                <stop stop-color="#ffffff"/><stop offset=".58" stop-color="#fff9df"/><stop offset="1" stop-color="#ffe39a"/>
              </radialGradient>
              <linearGradient id="party-ribbon-side" x1="0" y1="0" x2="0" y2="1">
                <stop stop-color="#ffb719"/><stop offset="1" stop-color="#e36b00"/>
              </linearGradient>
              <filter id="party-shadow" x="-30%" y="-30%" width="160%" height="180%">
                <feDropShadow dx="0" dy="14" stdDeviation="12" flood-color="#111827" flood-opacity=".28"/>
              </filter>
              <filter id="party-text-shadow" x="-20%" y="-30%" width="140%" height="170%">
                <feDropShadow dx="0" dy="5" stdDeviation="2" flood-color="#b65e00" flood-opacity=".48"/>
              </filter>
            </defs>
            <g class="classic-party-card">
              <g class="party-rays" fill="#ffc928" opacity=".2">
                <path d="M220 70 201 4h38Z"/><path d="m179 73-47-57 35-13Z"/><path d="m261 73 48-57-36-13Z"/><path d="m146 91-80-31 20-29Z"/><path d="m294 91 80-31-20-29Z"/>
              </g>
              <g class="party-side-stars" fill="url(#party-star)" stroke="#d97706" stroke-width="1.2">
                <path d="m57 120 5 10 11 1.5-8 7.8 1.9 11-9.9-5.2-9.9 5.2 1.9-11-8-7.8 11-1.5Z"/>
                <path d="m383 120 5 10 11 1.5-8 7.8 1.9 11-9.9-5.2-9.9 5.2 1.9-11-8-7.8 11-1.5Z"/>
              </g>
              <g class="party-streamers" fill="none" stroke-linecap="round">
                <path d="M64 158c40-38 34 50 75 7s40 34 66 5" stroke="#ff5267" stroke-width="9"/>
                <path d="M376 158c-40-38-34 50-75 7s-40 34-66 5" stroke="#ff5267" stroke-width="9"/>
                <path d="M91 204c-33 28-12 62 13 42s37 8 17 32" stroke="#f7b91c" stroke-width="7"/>
                <path d="M349 204c33 28 12 62-13 42s-37 8-17 32" stroke="#f7b91c" stroke-width="7"/>
                <path d="M105 108c-14 23-14 49 2 73s-1 47-16 58" stroke="#7bc3a4" stroke-width="7"/>
                <path d="M335 108c14 23 14 49-2 73s1 47 16 58" stroke="#7bc3a4" stroke-width="7"/>
                <path d="M48 126c27-21 46-8 40 17s13 35 31 23" stroke="#7d6cf2" stroke-width="5"/>
                <path d="M392 126c-27-21-46-8-40 17s-13 35-31 23" stroke="#7d6cf2" stroke-width="5"/>
                <path d="M53 222c19-12 36-5 34 12s13 26 29 20" stroke="#20b9c2" stroke-width="5"/>
                <path d="M387 222c-19-12-36-5-34 12s-13 26-29 20" stroke="#20b9c2" stroke-width="5"/>
                <path d="M137 287c10-21 28-23 36-7s24 12 31-3" stroke="#ff6f91" stroke-width="5"/>
                <path d="M303 287c-10-21-28-23-36-7s-24 12-31-3" stroke="#ff6f91" stroke-width="5"/>
                <path d="M155 67c-9-18 1-32 17-25s25-3 24-17" stroke="#38cfa2" stroke-width="4"/>
                <path d="M285 67c9-18-1-32-17-25s-25-3-24-17" stroke="#38cfa2" stroke-width="4"/>
              </g>
              <g class="party-card-body" filter="url(#party-shadow)">
                <path d="M80 101c0-15 12-27 27-27h226c15 0 27 12 27 27v174c0 15-12 27-27 27H107c-15 0-27-12-27-27Z" fill="url(#party-card-fill)" stroke="#9b5b11" stroke-width="7"/>
                <path d="M80 101c0-15 12-27 27-27h226c15 0 27 12 27 27v174c0 15-12 27-27 27H107c-15 0-27-12-27-27Z" fill="none" stroke="#ffd34a" stroke-width="3"/>
                <path d="M97 153v116c0 9 7 16 16 16h214" fill="none" stroke="#e7b43e" stroke-opacity=".42" stroke-width="2" stroke-linecap="round"/>
                <path d="M93 105c15-18 29-20 44-1s30 18 45-1 30-18 45 1 30 18 45-1 30-18 45 1 29 17 40 2v30H93Z" fill="#fffaf0"/>
                <g class="party-flags">
                  <path d="M97 115h246" stroke="#efb83f" stroke-width="2"/>
                  <path d="M99 115l12 25 12-25 12 25 12-25 12 25 12-25 12 25 12-25 12 25 12-25 12 25 12-25 12 25 12-25 12 25 12-25 12 25 12-25 12 25 12-25" fill="#18b7b4"/>
                  <path d="m111 115 12 25 12-25m48 0 12 25 12-25m48 0 12 25 12-25" fill="#ff5775"/>
                  <path d="m147 115 12 25 12-25m48 0 12 25 12-25m48 0 12 25 12-25" fill="#ff8a18"/>
                </g>
                <g class="party-score-medal">
                  <circle class="medal-glow" cx="220" cy="194" r="54" fill="#ffc928" fill-opacity=".18"/>
                  <circle cx="220" cy="194" r="47" fill="url(#party-medal)" stroke="#e9a512" stroke-width="4"/>
                  <circle cx="220" cy="194" r="40" fill="none" stroke="#ffd65c" stroke-width="2" stroke-dasharray="2 5"/>
                  <path d="M190 171c12-17 34-24 53-13" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".85"/>
                  <text x="220" y="205" text-anchor="middle" fill="#e85c08" font-size="45" font-weight="900" letter-spacing="-2" font-family="system-ui, sans-serif">${score}</text>
                  <text x="220" y="224" text-anchor="middle" fill="#b45c16" font-size="10" font-weight="800" letter-spacing="1.7" font-family="system-ui, sans-serif">挑战成功</text>
                </g>
                <g class="party-stars" fill="url(#party-star)" stroke="#d97706" stroke-width="1.5">
                  <path d="m185 244 5 10 11 1.6-8 7.8 1.9 11-9.9-5.2-9.9 5.2 1.9-11-8-7.8 11-1.6Z"/>
                  <path d="m220 238 6.2 12.6 13.8 2-10 9.7 2.4 13.7-12.4-6.5-12.4 6.5 2.4-13.7-10-9.7 13.8-2Z"/>
                  <path d="m255 244 5 10 11 1.6-8 7.8 1.9 11-9.9-5.2-9.9 5.2 1.9-11-8-7.8 11-1.6Z"/>
                </g>
              </g>
              <g class="party-poppers">
                <g transform="translate(97 246) rotate(22)">
                  <path d="M0 0 44 12 19 44Z" fill="#ff9d24"/><path d="m8 5 11 32m4-28 10 22" stroke="#ff5a45" stroke-width="5"/>
                  <ellipse cx="6" cy="3" rx="16" ry="9" fill="#ff4f5f"/><ellipse cx="6" cy="3" rx="10" ry="5" fill="#28445b"/>
                </g>
                <g transform="translate(343 246) scale(-1 1) rotate(22)">
                  <path d="M0 0 44 12 19 44Z" fill="#ff9d24"/><path d="m8 5 11 32m4-28 10 22" stroke="#ff5a45" stroke-width="5"/>
                  <ellipse cx="6" cy="3" rx="16" ry="9" fill="#ff4f5f"/><ellipse cx="6" cy="3" rx="10" ry="5" fill="#28445b"/>
                </g>
              </g>
              <g class="party-confetti">
                <rect x="57" y="102" width="7" height="12" rx="2" fill="#16b7b2" transform="rotate(-18 60 108)"/><rect x="378" y="112" width="7" height="12" rx="2" fill="#f7b91c" transform="rotate(18 381 118)"/>
                <rect x="54" y="241" width="7" height="12" rx="2" fill="#ff7950" transform="rotate(30 57 247)"/><rect x="379" y="238" width="7" height="12" rx="2" fill="#ff7950" transform="rotate(-30 382 244)"/>
                <circle cx="70" cy="184" r="5" fill="#ffbf19"/><circle cx="370" cy="184" r="5" fill="#ffbf19"/><circle cx="124" cy="283" r="4" fill="#16b7b2"/><circle cx="316" cy="283" r="4" fill="#16b7b2"/>
                <rect x="39" y="168" width="6" height="10" rx="2" fill="#8a72f4" transform="rotate(44 42 173)"/><rect x="395" y="168" width="6" height="10" rx="2" fill="#8a72f4" transform="rotate(-44 398 173)"/>
                <rect x="82" y="76" width="6" height="11" rx="2" fill="#ff5f7c" transform="rotate(-31 85 81)"/><rect x="352" y="76" width="6" height="11" rx="2" fill="#ff5f7c" transform="rotate(31 355 81)"/>
                <circle cx="45" cy="207" r="3.5" fill="#46d7aa"/><circle cx="395" cy="207" r="3.5" fill="#46d7aa"/><circle cx="150" cy="303" r="3" fill="#ffc928"/><circle cx="290" cy="303" r="3" fill="#ffc928"/>
              </g>
              <g class="party-banner" filter="url(#party-shadow)">
                <path d="m114 63-31 7 13 19-13 22 39 5Z" fill="url(#party-ribbon-side)" stroke="#a85a00" stroke-width="3" stroke-linejoin="round"/>
                <path d="m326 63 31 7-13 19 13 22-39 5Z" fill="url(#party-ribbon-side)" stroke="#a85a00" stroke-width="3" stroke-linejoin="round"/>
                <rect x="112" y="42" width="216" height="83" rx="18" fill="url(#party-banner)" stroke="#a85a00" stroke-width="4"/>
                <rect x="117" y="47" width="206" height="73" rx="14" fill="none" stroke="#ffe67a" stroke-opacity=".65" stroke-width="2"/>
                <path class="party-banner-shine" d="M133 58h91" stroke="#fff" stroke-opacity=".56" stroke-width="4" stroke-linecap="round"/>
                <text x="220" y="94" text-anchor="middle" fill="#fff" font-size="28" font-weight="900" letter-spacing="1" font-family="system-ui, sans-serif" filter="url(#party-text-shadow)">${score === 100 ? "恭喜满分通过" : "恭喜通过考试"}</text>
              </g>
              <g class="party-card-studs" fill="#ffd657" stroke="#b76b09" stroke-width="1.5">
                <circle cx="101" cy="163" r="4"/><circle cx="339" cy="163" r="4"/><circle cx="112" cy="280" r="4"/><circle cx="328" cy="280" r="4"/>
              </g>
            </g>
            <g class="modern-result-card" filter="url(#pass-shadow)">
              <rect x="20" y="20" width="360" height="360" rx="52" fill="url(#pass-bg)"/>
              <rect x="20.75" y="20.75" width="358.5" height="358.5" rx="51.25" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="1.5"/>
              <rect x="20" y="20" width="360" height="360" rx="52" fill="url(#pass-glow)"/>
              <g class="light-burst" fill="none" stroke-linecap="round" filter="url(#light-burst-glow)">
                <path class="light-branch" pathLength="1" d="M200 200C179 170 147 147 86 118c-18-9-31-22-42-39" stroke="#58e8ff" stroke-width="2.4"/>
                <path class="light-branch" pathLength="1" d="M200 200c-8-38-24-78-52-123-9-15-13-28-13-42" stroke="#8d7cff" stroke-width="1.8"/>
                <path class="light-branch" pathLength="1" d="M200 200c18-41 29-82 27-139 0-18 5-30 15-42" stroke="#67a4ff" stroke-width="2.2"/>
                <path class="light-branch" pathLength="1" d="M200 200c39-25 75-41 126-48 17-2 31-9 43-21" stroke="#75f2ca" stroke-width="2.5"/>
                <path class="light-branch" pathLength="1" d="M200 200c43 4 85 17 132 48 14 9 27 12 39 10" stroke="#4cc8ff" stroke-width="1.9"/>
                <path class="light-branch" pathLength="1" d="M200 200c30 30 57 65 76 116 6 17 17 29 31 38" stroke="#a4ff77" stroke-width="2.3"/>
                <path class="light-branch" pathLength="1" d="M200 200c3 43-4 88-25 139-7 17-7 30-2 43" stroke="#5be6b8" stroke-width="1.8"/>
                <path class="light-branch" pathLength="1" d="M200 200c-31 28-64 57-116 78-17 7-29 18-37 33" stroke="#8a7cff" stroke-width="2.2"/>
                <path class="light-branch" pathLength="1" d="M200 200c-42-2-84-10-132-35-17-9-30-10-43-5" stroke="#42c7ff" stroke-width="1.9"/>
                <path class="light-branch branch-fine" pathLength="1" d="M157 154c-22-3-43-1-65 8m56-85c-12 13-21 30-25 49m104-65c17 16 29 34 35 55m64 36c-19 12-35 27-47 45m53 51c-19-1-39 3-58 13m2 55c-17-9-36-13-57-13m-44 36c-11-17-26-30-44-39M84 278c9-18 21-33 37-46" stroke="#d8f6ff" stroke-width="1" opacity=".72"/>
              </g>
              <g class="modern-result-head">
                <rect x="48" y="47" width="170" height="32" rx="16" fill="#fff" fill-opacity=".09" stroke="#fff" stroke-opacity=".12"/>
                <circle cx="65" cy="63" r="4" fill="#86f6c6"/>
                <text x="78" y="68" fill="#fff" fill-opacity=".78" font-size="10" font-weight="700" letter-spacing="1.7" font-family="system-ui, sans-serif">AUTO OFFICE · RESULT</text>
                <g class="modern-check"><circle cx="338" cy="63" r="16" fill="#8af5c6"/><path d="m330 63 5 5 10-11" fill="none" stroke="#083a36" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>
              </g>
              <g class="pass-center-message">
                <circle cx="200" cy="204" r="104" fill="url(#message-core)" stroke="#a8f7d7" stroke-opacity=".18"/>
                <circle class="message-orbit" cx="200" cy="204" r="91" fill="none" stroke="#8af5c6" stroke-opacity=".28" stroke-width="1.5" stroke-dasharray="2 8"/>
                <text x="200" y="193" text-anchor="middle" fill="#fff" font-size="28" font-weight="780" letter-spacing="1" font-family="system-ui, sans-serif">恭喜您！</text>
                <text x="200" y="232" text-anchor="middle" fill="#a7f8d3" font-size="25" font-weight="760" letter-spacing="2" font-family="system-ui, sans-serif">考试通过</text>
              </g>
              <g class="modern-pass-pill">
                <rect x="127" y="315" width="146" height="38" rx="19" fill="#8af5c6" fill-opacity=".14" stroke="#8af5c6" stroke-opacity=".42"/>
                <circle cx="148" cy="334" r="4" fill="#8af5c6"/>
                <text x="162" y="339" fill="#a7f8d3" font-size="14" font-weight="720" letter-spacing="1" font-family="system-ui, sans-serif">本次 ${score} 分</text>
              </g>
              <g class="modern-particles" fill="#fff">
                <circle cx="64" cy="119" r="2" opacity=".55"/><circle cx="340" cy="126" r="3" opacity=".28"/><circle cx="68" cy="293" r="3" opacity=".24"/><circle cx="331" cy="287" r="2" opacity=".55"/>
                <path d="M83 247h10M88 242v10M314 226h12M320 220v12" stroke="#8af5c6" stroke-width="2" stroke-linecap="round"/>
              </g>
              <rect class="modern-sheen" x="-100" y="20" width="90" height="360" fill="url(#pass-sheen)" transform="skewX(-16)"/>
            </g>
          </svg>
          <div class="pass-celebration-copy">
            <strong>做得漂亮，继续保持</strong>
            <span>${result ? `答对 ${result.correct} / ${result.total}` : "这是你的历史最好成绩"} · 合格线 ${exam.pass} 分</span>
          </div>
        </section>` : `
        <div class="result">
          <div class="kicker">未通过</div>
          <div class="score">${score < 0 ? "--" : score}</div>
          <div class="pass" style="color:var(--bad)">还需 ${exam.pass} 分</div>
          <p class="muted">${result ? `对 ${result.correct} / ${result.total}` : "这是历史最好成绩。点下方重考。"}</p>
        </div>`}
      ${result?.wrong?.length ? `<div class="sec-title"><h3>错题解析</h3></div>${result.wrong.map((item) =>
        `<div class="card lesson-card"><strong>${escapeHtml(item.stem)}</strong><p class="muted">${escapeHtml(item.explain)}</p></div>`).join("")}` : ""}
      ${history.length ? `
        <div class="exam-attempt-history">
          <div class="sec-title"><h3>历次成绩</h3><span>最近 ${history.length} 次</span></div>
          <div class="exam-records">${history.map((record, index) => {
            const passed = record.score >= exam.pass;
            const active = result?.at && record.at === result.at;
            return `<button class="exam-record ${passed ? "passed" : "failed"} ${active ? "current" : ""}" data-act="go" data-hash="#/exam/${exam.id}/result?at=${record.at}">
              <span class="exam-record-state">${passed ? "已通过" : "未通过"}</span>
              <span class="exam-record-main"><strong>第 ${history.length - index} 次考试</strong><small>${record.at ? renderDateLabel(record.at) : "历史记录"} · 答对 ${record.correct}/${record.total}</small></span>
              <span class="exam-record-score"><b>${record.score}</b><small>分</small></span>
              <span class="exam-record-arrow" aria-hidden="true">›</span>
            </button>`;
          }).join("")}</div>
        </div>` : ""}
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

  function renderNotice(id) {
    const notice = (DATA.notices || []).find((item) => item.id === id);
    setTop("通知详情", true);
    setTab("home");
    if (!notice || !noticeVisibleTo(notice)) {
      view().innerHTML = `
        <div class="card notice clear">
          <strong>这条通知不可查看</strong>
          <p class="muted">通知可能已删除，或没有发送给当前账号。</p>
          <button class="ghost" data-act="back">返回上一页</button>
        </div>`;
      return;
    }
    markPublishedContentRead("notice", notice);
    view().innerHTML = `
      <article class="card post-detail ${notice.tone === "urgent" ? "urgent" : ""}">
        <header>
          <time>${renderDateLabel(notice.createdAt)}</time>
        </header>
        <h2>${escapeHtml(notice.title)}</h2>
        <div class="post-detail-body">${renderNoticeDetail(notice.detail)}</div>
        <footer><span>发送给</span><b>${escapeHtml(noticeAudienceLabel(notice))}</b></footer>
      </article>`;
  }

  function renderMessages() {
    setTop("消息通知", true);
    setTab("home");
    const box = inbox();
    const messages = box.notices;
    view().innerHTML = `
      <div class="sec-title"><h3>发布消息</h3><span>${box.unreadNotices.length} 条未读</span></div>
      ${messages.length ? messages.map((item) => `
        <button class="card notice ${messageUnread(item) ? "unread-message" : "read-message"} ${item.tone === "urgent" ? "urgent" : ""}" data-act="${item.act}" data-message-key="${escapeHtml(item.key)}" ${item.id ? `data-id="${item.id}"` : ""} ${item.hash ? `data-hash="${item.hash}"` : ""}>
          <div class="kicker">${messageUnread(item) ? `<span class="message-alarm">${svgIcon("bell")}</span>` : ""}${escapeHtml(item.kicker)}<time>${renderDateLabel(item.createdAt)}</time></div>
          <strong>${escapeHtml(item.title)}</strong>
          ${renderNoticePreview(item.detail)}
        </button>`).join("") : `<div class="card notice clear"><strong>当前没有发布消息</strong><p class="muted">新课程、新考试和运营通知发布后会显示在这里。</p></div>`}
    `;
  }

  function renderEmbeddedApp(appName) {
    const apps = {
      notes: {
        title: "今岭笔记",
        src: "https://hldhlh.github.io/web/apps/notes/index.html"
      },
      jlhcdh: {
        title: "今岭每日订货表",
        src: "https://hldhlh.github.io/web/apps/jlhcdh/index.html"
      }
    };
    const app = apps[appName];
    if (!app) return go("#/home", { replace: true });
    setTop(app.title, true);
    setTab("home");
    view().innerHTML = `
      <iframe
        class="embedded-app-frame"
        src="${app.src}"
        title="${app.title}"
        referrerpolicy="strict-origin-when-cross-origin"
      ></iframe>`;
  }

  function updateNotificationButton() {
    const btn = document.getElementById("notification-btn");
    if (!btn || !Auth.session) return;
    const count = inbox().unreadNotices.length;
    btn.innerHTML = `${svgIcon("bell")}${count ? `<span class="notification-count" aria-hidden="true">${count > 99 ? "99+" : count}</span>` : ""}`;
    btn.title = count ? `消息通知，${count} 条未读` : "消息通知";
    btn.setAttribute("aria-label", btn.title);
  }

  function render() {
    if (state.video && state.route.name !== "lesson") state.video.playing = false;
    const route = state.route;
    document.querySelector(".app")?.classList.toggle("ops-mode", route.name === "ops");
    document.querySelector(".app")?.classList.toggle("embedded-mode", route.name === "embedded-app");
    updateNotificationButton();
    if (route.name === "home") return renderHome();
    if (route.name === "messages") return renderMessages();
    if (route.name === "embedded-app") return renderEmbeddedApp(route.app);
    if (route.name === "notice") return renderNotice(route.id);
    if (route.name === "ops") return renderOps();
    if (route.name === "learn") return renderLearn(route.type, route.group);
    if (route.name === "exams") return renderExams();
    if (route.name === "me") return renderMe();
    if (route.name === "lesson") return openLesson(route.id);
    if (route.name === "exam") return startExam(route.id);
    if (route.name === "result") return renderResult();
    renderHome();
  }

  function onRoute() {
    if (!Auth.session) return showGate();
    const prev = state.route;
    state.route = parseHash();
    if (prev.name === "exam" && state.route.name === "exam" && prev.id === state.route.id && state.exam) {
      renderExam();
      return;
    }
    if (state.route.name !== "exam") state.exam = state.route.name === "result" ? state.exam : null;
    render();
  }

  function ensurePublishStateStyles() {
    if (document.getElementById("academy-publish-state-styles")) return;
    const style = document.createElement("style");
    style.id = "academy-publish-state-styles";
    style.textContent = `
      [data-publish-state] {
        position: relative;
        min-width: 128px;
        overflow: hidden;
        transition: background .2s ease, color .2s ease, transform .2s ease, opacity .2s ease;
      }
      [data-publish-state]:disabled { opacity: 1; }
      [data-publish-state="preparing"],
      [data-publish-state="uploading"],
      [data-publish-state="publishing"] { cursor: wait; animation: ops-publish-press .26s ease both; }
      [data-publish-state="success"] { background: #16a05d !important; color: #fff !important; }
      [data-publish-state="failed"] { background: #fff1f0 !important; color: #c9342e !important; box-shadow: inset 0 0 0 1px #efb3af !important; }
      .ops-publish-state {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 9px;
        white-space: nowrap;
      }
      .ops-publish-spinner {
        width: 15px;
        height: 15px;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 50%;
        animation: ops-publish-spin .72s linear infinite;
      }
      .ops-upload-progress {
        position: absolute;
        inset: auto 0 0;
        height: 3px;
        background: rgba(255,255,255,.3);
      }
      .ops-upload-progress::after {
        content: "";
        display: block;
        width: var(--upload-progress, 0%);
        height: 100%;
        background: currentColor;
        transition: width .18s ease;
      }
      .ops-publish-check {
        width: 17px;
        height: 17px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2.4;
        stroke-linecap: round;
        stroke-linejoin: round;
        animation: ops-publish-pop .34s cubic-bezier(.2,.9,.25,1.3) both;
      }
      [data-publish-state="failed"] .ops-publish-state { animation: ops-publish-shake .32s ease both; }
      @keyframes ops-publish-press { 0% { transform: scale(.96); } 100% { transform: scale(1); } }
      @keyframes ops-publish-spin { to { transform: rotate(360deg); } }
      @keyframes ops-publish-pop { from { opacity: 0; transform: scale(.35); } to { opacity: 1; transform: scale(1); } }
      @keyframes ops-publish-shake { 0%,100% { transform: translateX(0); } 30% { transform: translateX(-4px); } 65% { transform: translateX(4px); } }
      @media (prefers-reduced-motion: reduce) {
        [data-publish-state], .ops-publish-spinner, .ops-publish-check, [data-publish-state="failed"] .ops-publish-state { animation: none !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function setPublishState(button, state, html, busy = true) {
    ensurePublishStateStyles();
    if (!button.dataset.publishOriginal) button.dataset.publishOriginal = button.innerHTML;
    button.disabled = busy;
    button.dataset.publishState = state;
    button.setAttribute("aria-busy", busy ? "true" : "false");
    button.innerHTML = html;
  }

  function setVideoUploadProgress(button, percent) {
    setPublishState(
      button,
      "uploading",
      `<span class="ops-publish-state"><i class="ops-publish-spinner" aria-hidden="true"></i>上传视频 ${percent}%</span><i class="ops-upload-progress" style="--upload-progress:${percent}%" aria-hidden="true"></i>`
    );
  }

  function setPublishFailed(button, label = "发布失败 · 重试") {
    setPublishState(button, "failed", `<span class="ops-publish-state">${label}</span>`, false);
  }

  async function publishWithState(button, contentLabel) {
    setPublishState(button, "publishing", `<span class="ops-publish-state"><i class="ops-publish-spinner" aria-hidden="true"></i>${contentLabel}发布中</span>`);
    try {
      await ContentSync.publish();
      setPublishState(button, "success", `<span class="ops-publish-state"><svg class="ops-publish-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>发布成功</span>`);
      await new Promise((resolve) => setTimeout(resolve, 620));
      return true;
    } catch (error) {
      setPublishFailed(button);
      throw error;
    }
  }

  function onClick(event) {
    const btn = event.target.closest("[data-act]");
    if (!btn || btn.disabled) return;
    if (btn.dataset.messageKey) markMessageRead(btn.dataset.messageKey);
    const act = btn.dataset.act;
    if (act === "ops-tab") return go(`#/ops?section=${btn.dataset.section}`, { replace: true });
    if (act === "back") return goToParentPage();
    if (act === "theme-toggle") {
      setTheme(state.theme === "dark" ? "light" : "dark");
      return renderMe();
    }
    if (act === "ops-cancel") {
      if (currentOpsRoute().section === "lessons") clearLessonDraft();
      return go(`#/ops?section=${currentOpsRoute().section}`);
    }
    if (act === "ops-message") return go("#/ops?section=notices");
    if (act === "ops-group-add") {
      const input = document.getElementById("ops-group-new-name");
      const name = coerceString(input?.value, "");
      if (!name) return alert("请输入分组名称。");
      if (DATA.courseGroups.some((group) => group.name.toLowerCase() === name.toLowerCase())) return alert("已经有同名分组。");
      DATA.courseGroups = DATA.courseGroups.concat({ id: coerceId("group", ""), name });
      saveOpsStore();
      ContentSync.publish().catch(() => alert("分组已暂存，请检查网络后重新发布。"));
      return renderOps();
    }
    if (act === "ops-group-rename") {
      const row = btn.closest("[data-group-id]");
      const name = coerceString(row?.querySelector("[data-group-name]")?.value, "");
      if (!name) return alert("分组名称不能为空。");
      if (DATA.courseGroups.some((group) => group.id !== btn.dataset.id && group.name.toLowerCase() === name.toLowerCase())) return alert("已经有同名分组。");
      DATA.courseGroups = DATA.courseGroups.map((group) => group.id === btn.dataset.id ? { ...group, name } : group);
      saveOpsStore();
      ContentSync.publish().catch(() => alert("名称已暂存，请检查网络后重新发布。"));
      return renderOps();
    }
    if (act === "ops-group-delete") {
      if (DATA.courseGroups.length <= 1) return alert("至少保留一个课程分组。");
      const group = DATA.courseGroups.find((item) => item.id === btn.dataset.id);
      if (!group || !confirm(`确认删除分组“${group.name}”吗？分组内课程会移到其他分组。`)) return;
      const remaining = DATA.courseGroups.filter((item) => item.id !== group.id);
      DATA.courseGroups = remaining;
      DATA.lessons = DATA.lessons.map((lesson) => {
        const groupIds = normalizeLessonGroupIds(lesson.groupIds, lesson.track).filter((id) => id !== group.id);
        return { ...lesson, groupIds: groupIds.length ? groupIds : [remaining[0].id] };
      });
      saveOpsStore();
      ContentSync.publish().catch(() => alert("分组变更已暂存，请检查网络后重新发布。"));
      return renderOps();
    }
    if (act === "ops-delete") {
      const section = btn.dataset.section;
      const id = btn.dataset.id;
      const source = section;
      const list = opsStore(source);
      if (!list.length) return;
      if (!confirm("确认删除吗？")) return;
      if (source === "lessons") DATA.lessons = list.filter((item) => item.id !== id);
      else if (source === "exams") DATA.exams = list.filter((item) => item.id !== id);
      else if (source === "notices") DATA.notices = list.filter((item) => item.id !== id);
      saveOpsStore();
      ContentSync.publish().catch(() => alert("内容已暂存，请检查网络后重新发布。"));
      return go(`#/ops?section=${source}`);
    }
    if (act === "ops-exam-add-question") {
      const builder = document.getElementById("ops-exam-question-builder");
      if (!builder) return;
      const index = builder.querySelectorAll(".ops-question").length;
      builder.insertAdjacentHTML("beforeend", renderExamQuestionItem(emptyExamQuestion(index), index));
      const rawQuestions = collectExamQuestionsFromBuilder();
      const area = document.getElementById("ops-exam-questions");
      if (area) area.value = JSON.stringify(rawQuestions, null, 2);
      return;
    }
    if (act === "ops-exam-remove-question") {
      const questionNode = btn.closest(".ops-question");
      const builder = document.getElementById("ops-exam-question-builder");
      if (!questionNode || !builder) return;
      const total = builder.querySelectorAll(".ops-question").length;
      if (total <= 1) {
        alert("至少保留 1 道题。");
        return;
      }
      questionNode.remove();
      const rawQuestions = collectExamQuestionsFromBuilder();
      const area = document.getElementById("ops-exam-questions");
      if (area) area.value = JSON.stringify(rawQuestions, null, 2);
      return;
    }
    if (act === "ops-exam-sync-json") {
      const rawQuestions = collectExamQuestionsFromBuilder();
      const area = document.getElementById("ops-exam-questions");
      if (!area) return;
      area.value = JSON.stringify(rawQuestions, null, 2);
      return;
    }
    if (act === "ops-lesson-clear-media") {
      const mediaUrlInput = document.getElementById("ops-lesson-media-url");
      const mediaInput = document.getElementById("ops-lesson-media");
      const node = document.querySelector(".media-preview");
      const msg = document.querySelector(".lesson-media-status");
      const remove = document.querySelector(".remove-media");
      if (mediaUrlInput) mediaUrlInput.value = "";
      if (mediaInput) mediaInput.value = "";
      if (node) {
        node.innerHTML = "";
        node.hidden = true;
      }
      if (remove) remove.hidden = true;
      if (msg) msg.textContent = "点击此处选择文件";
      saveLessonDraft();
      return;
    }
    if (act === "ops-lesson-insert-block") {
      const kind = btn.dataset.block;
      const insert = lessonBlockTemplates(kind);
      if (!insert) return;
      const builder = document.getElementById("ops-lesson-block-builder");
      if (!builder) return;
      const index = builder.querySelectorAll(".lesson-block-card").length;
      builder.insertAdjacentHTML("beforeend", renderLessonBlockItem(insert, index));
      syncLessonBlocksJson();
      resizeLessonEditorFields(builder.lastElementChild);
      builder.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (act === "ops-lesson-add-list-item") {
      const card = btn.closest(".lesson-block-card");
      const list = card?.querySelector(".lesson-list-editor");
      if (!list) return;
      const index = list.querySelectorAll(".lesson-list-row").length;
      list.insertAdjacentHTML("beforeend", `<div class="lesson-list-row"><span>${index + 1}</span><input data-block-field="item" placeholder="填写一项内容"><button type="button" data-act="ops-lesson-remove-list-item" title="删除此项">×</button></div>`);
      list.lastElementChild?.querySelector("input")?.focus();
      syncLessonBlocksJson();
      return;
    }
    if (act === "ops-lesson-remove-list-item") {
      const card = btn.closest(".lesson-block-card");
      const rows = card?.querySelectorAll(".lesson-list-row");
      if (!rows?.length) return;
      if (rows.length === 1) rows[0].querySelector("input").value = "";
      else btn.closest(".lesson-list-row")?.remove();
      refreshLessonListNumbers(card);
      syncLessonBlocksJson();
      return;
    }
    if (act === "ops-lesson-add-table-row") {
      const table = btn.closest(".lesson-block-body")?.querySelector(".lesson-table-editor");
      const rows = table?.querySelector(".lesson-table-rows");
      const columns = table?.querySelectorAll("[data-block-field='header']").length || 1;
      if (!rows) return;
      rows.insertAdjacentHTML("beforeend", `<div class="lesson-table-row">${Array.from({ length: columns }, () => '<input data-block-field="cell" placeholder="填写内容">').join("")}<button type="button" data-act="ops-lesson-remove-table-row" title="删除此行">×</button></div>`);
      rows.lastElementChild?.querySelector("input")?.focus();
      syncLessonBlocksJson();
      return;
    }
    if (act === "ops-lesson-remove-table-row") {
      const rows = btn.closest(".lesson-table-rows");
      if (!rows) return;
      if (rows.children.length === 1) rows.querySelectorAll("input").forEach((input) => { input.value = ""; });
      else btn.closest(".lesson-table-row")?.remove();
      syncLessonBlocksJson();
      return;
    }
    if (act === "ops-lesson-add-table-column") {
      const table = btn.closest(".lesson-block-body")?.querySelector(".lesson-table-editor");
      const head = table?.querySelector(".lesson-table-head");
      if (!table || !head) return;
      head.insertAdjacentHTML("beforeend", '<input data-block-field="header" placeholder="列标题">');
      table.querySelectorAll(".lesson-table-row").forEach((row) => row.querySelector("button")?.insertAdjacentHTML("beforebegin", '<input data-block-field="cell" placeholder="填写内容">'));
      refreshLessonTableGrid(table);
      syncLessonBlocksJson();
      return;
    }
    if (act === "ops-lesson-remove-table-column") {
      const table = btn.closest(".lesson-block-body")?.querySelector(".lesson-table-editor");
      const headers = table?.querySelectorAll("[data-block-field='header']");
      if (!table || !headers || headers.length <= 1) return;
      headers[headers.length - 1].remove();
      table.querySelectorAll(".lesson-table-row").forEach((row) => {
        const cells = row.querySelectorAll("[data-block-field='cell']");
        cells[cells.length - 1]?.remove();
      });
      refreshLessonTableGrid(table);
      syncLessonBlocksJson();
      return;
    }
    if (act === "ops-lesson-remove-block") {
      btn.closest(".lesson-block-card")?.remove();
      refreshLessonBlockNumbers();
      syncLessonBlocksJson();
      return;
    }
    if (act === "ops-lesson-move-block") {
      const card = btn.closest(".lesson-block-card");
      const builder = card?.parentElement;
      if (!card || !builder) return;
      if (btn.dataset.direction === "up" && card.previousElementSibling) builder.insertBefore(card, card.previousElementSibling);
      if (btn.dataset.direction === "down" && card.nextElementSibling) builder.insertBefore(card.nextElementSibling, card);
      refreshLessonBlockNumbers();
      syncLessonBlocksJson();
      return;
    }
    if (act === "ops-staff-auth") {
      (async () => {
        try {
          await Auth.setAccess(btn.dataset.id, btn.dataset.access, Auth.session);
          go("#/ops?section=staff");
        } catch (error) {
          alert(error.message);
        }
      })();
      return;
    }
    if (act === "ops-save") {
      (async () => {
        const section = btn.dataset.section;
        const id = coerceString(btn.dataset.id, "");
        if (section === "lessons") {
          const list = DATA.lessons.slice();
          setPublishState(btn, "preparing", `<span class="ops-publish-state"><i class="ops-publish-spinner" aria-hidden="true"></i>准备发布</span>`);
          const blocks = collectLessonBlocksFromBuilder();
          if (blocks === null) {
            setPublishFailed(btn);
            alert("课程内容暂时无法保存，请刷新页面后重试。");
            return;
          }
          const rawType = coerceString(document.getElementById("ops-lesson-type")?.value, "article");
          const sceneRaw = parseLessonScenes(document.getElementById("ops-lesson-scenes")?.value);
          if (sceneRaw === null) {
            setPublishFailed(btn);
            alert("视频信息无法读取，请重新选择视频后保存。");
            return;
          }
          const raw = {
            id: id || coerceId("lesson", ""),
            title: coerceString(document.getElementById("ops-lesson-title")?.value, ""),
            track: coerceString(document.getElementById("ops-lesson-track")?.value, ""),
            groupIds: Array.from(document.querySelectorAll('input[name="ops-lesson-groups"]:checked')).map((input) => input.value),
            type: rawType,
            minutes: document.getElementById("ops-lesson-minutes")?.value || "3",
            access: document.getElementById("ops-lesson-access")?.value || "full",
            mediaUrl: coerceString(document.getElementById("ops-lesson-media-url")?.value, ""),
            publishedAt: Date.now(),
            notify: document.getElementById("ops-lesson-notify")?.checked !== false,
            requiredExamId: coerceString(document.getElementById("ops-lesson-required-exam")?.value, ""),
            requireConfirmation: Boolean(document.getElementById("ops-lesson-require-confirmation")?.checked),
            summary: coerceString(document.getElementById("ops-lesson-summary")?.value, ""),
            blocks,
            scenes: sceneRaw
          };
          if (!raw.title) {
            setPublishFailed(btn);
            alert("课程标题不能为空。");
            return;
          }
          if (!raw.groupIds.length) {
            setPublishFailed(btn);
            alert("发布课程前请至少勾选一个分组。");
            return;
          }
          const pickedFile = document.getElementById("ops-lesson-media")?.files?.[0];
          try {
            if (pickedFile) {
              raw.mediaUrl = await uploadLessonVideo(pickedFile, raw.id, (percent) => setVideoUploadProgress(btn, percent));
              raw.scenes = raw.scenes.map((scene) => scene?.stage?.kind === "media"
                ? { ...scene, stage: { ...scene.stage, src: raw.mediaUrl } }
                : scene);
            }
          } catch (error) {
            setPublishFailed(btn, "上传失败 · 重试");
            alert(error.message || "视频上传失败，请重新选择。");
            return;
          }
          const normalized = normalizeLesson(raw);
          const found = list.findIndex((item) => item.id === id);
          if (found >= 0) list[found] = normalized;
          else list.push(normalized);
          DATA.lessons = list;
          saveOpsStore();
          try {
            await publishWithState(btn, "课程");
          } catch (error) {
            alert(`课程已暂存，暂时无法发布：${error?.message || "请检查网络后重试"}。`);
            return;
          }
          clearLessonDraft();
          return go("#/ops?section=lessons");
        }
        if (section === "exams") {
          const visualQuestions = collectExamQuestionsFromBuilder();
          const parsed = parseQuestionSource(document.getElementById("ops-exam-questions")?.value);
          const finalQuestions = visualQuestions && visualQuestions.length ? visualQuestions : parsed;
          if (finalQuestions === null) {
            alert("题目暂时无法保存，请检查题目内容后重试。");
            return;
          }
          if (!finalQuestions.length) {
            alert("考试至少要有 1 道题。");
            return;
          }
          const list = DATA.exams.slice();
          const raw = {
            id,
            title: coerceString(document.getElementById("ops-exam-title")?.value, ""),
            track: coerceString(document.getElementById("ops-exam-track")?.value, ""),
            pass: document.getElementById("ops-exam-pass")?.value || "80",
            minutes: document.getElementById("ops-exam-minutes")?.value || "8",
            publishedAt: Date.now(),
            notify: document.getElementById("ops-exam-notify")?.checked !== false,
            summary: coerceString(document.getElementById("ops-exam-summary")?.value, ""),
            questions: finalQuestions
          };
          if (!raw.title) {
            alert("考试标题不能为空。");
            return;
          }
          const normalized = normalizeExam(raw);
          const found = list.findIndex((item) => item.id === id);
          if (found >= 0) list[found] = normalized;
          else list.push(normalized);
          DATA.exams = list;
          saveOpsStore();
          try {
            await publishWithState(btn, "考试");
          } catch (error) {
            alert(`考试已暂存，暂时无法发布：${error?.message || "请检查网络后重试"}。`);
            return;
          }
          return go("#/ops?section=exams");
        }
        if (section === "notices") {
          const list = DATA.notices.slice();
          const timeValue = document.getElementById("ops-notice-createdAt")?.value;
          const createdAt = Date.parse(timeValue || "") || Date.now();
          const audienceMode = document.querySelector('input[name="ops-notice-audience"]:checked')?.value || "all";
          const recipientIds = Array.from(document.querySelectorAll('input[name="ops-notice-recipient"]:checked'))
            .map((input) => input.value)
            .filter(Boolean);
          if (audienceMode === "selected" && !recipientIds.length) {
            alert("请选择至少一位接收成员。 ");
            return;
          }
          const raw = {
            id,
            title: coerceString(document.getElementById("ops-notice-title")?.value, ""),
            kicker: coerceString(document.getElementById("ops-notice-kicker")?.value, ""),
            detail: coerceString(document.getElementById("ops-notice-detail")?.value, ""),
            tone: coerceString(document.getElementById("ops-notice-tone")?.value, "info"),
            createdAt,
            notify: document.getElementById("ops-notice-notify")?.checked !== false,
            audience: { mode: audienceMode, userIds: recipientIds }
          };
          if (!raw.title) {
            alert("通知标题不能为空。");
            return;
          }
          const normalized = normalizeNotice(raw);
          const found = list.findIndex((item) => item.id === id);
          if (found >= 0) list[found] = normalized;
          else list.push(normalized);
          DATA.notices = list;
          saveOpsStore();
          try {
            await publishWithState(btn, "通知");
          } catch (error) {
            alert(`通知已暂存，暂时无法发布：${error?.message || "请检查网络后重试"}。`);
            return;
          }
          return go("#/ops?section=notices");
        }
      })();
      return;
    }
    if (act === "gate-mode") {
      gateMode = btn.dataset.mode;
      return showGate();
    }
    if (act === "go") return go(btn.dataset.hash);
    if (act === "open-lesson") return go(`#/lesson/${btn.dataset.id}`);
    if (act === "lesson-exam") {
      const exam = examById(btn.dataset.examId);
      if (!exam || !Gate.canExam(exam)) return alert("关联考试暂不可用，请联系店长。");
      return go(`#/exam/${exam.id}`);
    }
    if (act === "complete") {
      const lesson = lessonById(btn.dataset.id);
      if (lesson?.type === "video") {
        if (!state.video?.watchedToEnd && !isDone(lesson.id)) return;
      }
      if (!completeLesson(btn.dataset.id)) {
        const linkedExam = examById(lesson?.requiredExamId);
        if (linkedExam && Gate.canExam(linkedExam)) return go(`#/exam/${linkedExam.id}`);
        return;
      }
      const items = lessonsIn(lesson.track);
      const following = items.slice(items.findIndex((item) => item.id === lesson.id) + 1).find((item) => Gate.canLesson(item));
      if (following) return go(`#/lesson/${following.id}`);
      const exam = DATA.exams.find((item) => item.track === lesson.track);
      if (exam && Gate.canExam(exam) && bestScore(exam.id) < exam.pass) return go(`#/exam/${exam.id}`);
      return go("#/home");
    }
    if (act === "video-toggle" && state.video) {
      const video = document.getElementById("lesson-video");
      if (!video) return;
      if (video.paused || video.ended) video.play().catch(() => { });
      else video.pause();
      return;
    }
    if (act === "video-speed" && state.video) {
      const speeds = [1, 1.5, 2, 0.75];
      state.video.speed = speeds[(speeds.indexOf(state.video.speed) + 1) % speeds.length];
      const video = document.getElementById("lesson-video");
      if (video) video.playbackRate = state.video.speed;
      btn.textContent = `${state.video.speed}×`;
      return;
    }
    if (act === "video-skip" && state.video) {
      const video = document.getElementById("lesson-video");
      if (!video || !Number.isFinite(video.duration)) return;
      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + Number(btn.dataset.delta)));
      return;
    }
    if (act === "scrub" && state.video) {
      const video = document.getElementById("lesson-video");
      if (!video || !Number.isFinite(video.duration)) return;
      const rect = btn.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      video.currentTime = ratio * video.duration;
      return;
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
    if (act === "locked") return renderLocked("需要授权");
    if (act === "logout") {
      Auth.logout();
      return showGate();
    }
  }

  function onInput(event) {
    if (event.target.closest("#ops-lesson-block-builder")) {
      if (event.target.matches("textarea")) resizeLessonEditorFields(event.target.parentElement || document);
      if (event.target.matches('[data-block-field="kind"]')) {
        const preview = event.target.closest(".lesson-block-body")?.querySelector(".wysiwyg-figure-preview");
        if (preview) preview.innerHTML = figure(event.target.value);
      }
      if (event.target.matches('[data-block-field="tone"]')) {
        event.target.closest(".wysiwyg-callout")?.classList.toggle("warn", event.target.value === "warn");
      }
      syncLessonBlocksJson();
      return;
    }
    if (event.target.id === "ops-lesson-type") {
      const panel = document.querySelector("[data-video-panel]");
      if (panel) panel.hidden = event.target.value !== "video";
      const hasVideoStep = event.target.value === "video";
      const groupStep = document.querySelector('[data-lesson-step="group"]');
      const completionStep = document.querySelector('[data-lesson-step="completion"]');
      if (groupStep) groupStep.textContent = hasVideoStep ? "04" : "03";
      if (completionStep) completionStep.textContent = hasVideoStep ? "05" : "04";
      saveLessonDraft();
      return;
    }
    if (event.target.id === "ops-lesson-media") {
      const file = event.target.files?.[0];
      if (!file) return;
      const preview = document.querySelector(".video-editor-section .media-preview");
      const status = document.querySelector(".lesson-media-status");
      const remove = document.querySelector(".remove-media");
      if (preview) {
        preview.innerHTML = `<video src="${URL.createObjectURL(file)}" controls></video>`;
        preview.hidden = false;
      }
      if (status) status.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
      if (remove) remove.hidden = false;
      saveLessonDraft();
      return;
    }
    if (event.target.closest(".lesson-editor")) saveLessonDraft();
  }

  function onKey(event) {
    if (!Auth.session) return;
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
    requestAnimationFrame(loop);
  }

  let gateMode = "login";
  let gateBusy = false;

  function showGate() {
    Presence.stop();
    const authNotice = Auth.consumeNotice?.() || "";
    document.querySelector(".app").classList.add("gated");
    setTop("Auto Office", false);
    view().innerHTML = `
      <div class="gate">
        <form class="gate-card" id="auth-form">
          <div class="gate-intro">
            <h2>${gateMode === "login" ? "欢迎使用 Auto Office" : "创建 Auto Office 账号"}</h2>
          </div>
          <div class="chips" style="padding-bottom:8px">
            <button type="button" class="chip ${gateMode === "login" ? "on" : ""}" data-act="gate-mode" data-mode="login">登录</button>
            <button type="button" class="chip ${gateMode === "register" ? "on" : ""}" data-act="gate-mode" data-mode="register">注册</button>
          </div>
          <label class="gate-label"><span>姓名</span><input name="name" maxlength="16" autocomplete="username" placeholder="请输入注册时的姓名" required><small data-field-error="name"></small></label>
          <label class="gate-label"><span>密码</span><span class="gate-password"><input name="password" type="password" minlength="4" autocomplete="${gateMode === "login" ? "current-password" : "new-password"}" placeholder="请输入密码" required><button type="button" data-password-toggle>显示</button></span><small data-field-error="password"></small></label>
          ${authNotice ? `<div class="auth-kicked" role="alert"><i>!</i><span>${escapeHtml(authNotice)}</span></div>` : ""}
          <p class="auth-message" id="auth-error" role="status" aria-live="polite">${gateMode === "login" ? "使用 Auto Office 账号登录" : "注册后即可使用 Auto Office，完整权限由店长开放"}</p>
          <button class="primary gate-submit" id="auth-submit" type="submit"><span>${gateMode === "login" ? "登录" : "注册并进入"}</span><i aria-hidden="true"></i></button>
          <div class="gate-success" aria-hidden="true"><i>✓</i><strong>${gateMode === "login" ? "登录成功" : "注册成功"}</strong><span>正在进入 Auto Office</span></div>
        </form>
      </div>
    `;
    const form = document.getElementById("auth-form");
    const passwordInput = form.elements.password;
    form.querySelector("[data-password-toggle]").addEventListener("click", (event) => {
      const visible = passwordInput.type === "text";
      passwordInput.type = visible ? "password" : "text";
      event.currentTarget.textContent = visible ? "显示" : "隐藏";
      passwordInput.focus();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (gateBusy) return;
      document.activeElement?.blur();
      gateBusy = true;
      const data = new FormData(event.target);
      const err = document.getElementById("auth-error");
      const submit = document.getElementById("auth-submit");
      form.classList.remove("is-error", "is-success");
      form.querySelectorAll("[data-field-error]").forEach((item) => { item.textContent = ""; });
      form.querySelectorAll("input").forEach((item) => item.removeAttribute("aria-invalid"));
      err.textContent = gateMode === "login" ? "正在核对账号信息..." : "正在创建账号...";
      submit.disabled = true;
      form.classList.add("is-loading");
      try {
        if (gateMode === "register") await Auth.register(data.get("name"), data.get("password"));
        else await Auth.login(data.get("name"), data.get("password"));
        form.classList.remove("is-loading");
        form.classList.add("is-success");
        await new Promise((resolve) => setTimeout(resolve, 620));
        enterApp();
      } catch (error) {
        form.classList.remove("is-loading");
        form.classList.add("is-error");
        err.textContent = error.message;
        const field = error.field === "password" ? "password" : error.field === "name" ? "name" : "";
        if (field) {
          const input = form.elements[field];
          input.setAttribute("aria-invalid", "true");
          form.querySelector(`[data-field-error="${field}"]`).textContent = error.message;
          input.focus();
          if (field === "password") input.select();
        }
      } finally {
        submit.disabled = false;
        gateBusy = false;
      }
    });
  }

  function enterApp() {
    document.querySelector(".app").classList.remove("gated");
    state.progress = loadProgress();
    Live.rev = 0;
    Live.hydrated = false;
    onRoute();
    ContentSync.pull().catch(() => { });
    Live.connect().finally(() => Presence.start());
  }

  function loadRealtimeSdk() {
    const activate = () => {
      window.APP_NETWORK?.patchSupabase();
      Auth.connectRealtime?.();
      ContentSync.connect();
      Live.scheduleReconnect();
    };
    if (window.supabase?.createClient) {
      activate();
      return;
    }
    if (document.querySelector("script[data-academy-realtime]")) return;
    const script = document.createElement("script");
    script.src = "../vendor/supabase.min.js";
    script.async = true;
    script.dataset.academyRealtime = "true";
    script.onload = activate;
    document.head.appendChild(script);
  }

  async function init() {
    initializeNavigationState();
    setTheme(state.theme);
    document.getElementById("back-btn").innerHTML = svgIcon("back");
    document.getElementById("notification-btn").innerHTML = svgIcon("bell");
    document.getElementById("tab-home").innerHTML = `${svgIcon("home")}<span>运营</span>`;
    document.getElementById("tab-learn").innerHTML = `${svgIcon("learn")}<span>课程</span>`;
    document.getElementById("tab-exams").innerHTML = `${svgIcon("exam")}<span>考试</span>`;
    document.getElementById("tab-me").innerHTML = `${svgIcon("me")}<span>我的</span>`;

    document.getElementById("back-btn").addEventListener("click", goToParentPage);
    const appRoot = document.getElementById("app");
    appRoot.addEventListener("click", onClick);
    appRoot.addEventListener("input", onInput);
    appRoot.addEventListener("dragstart", onLessonBlockDragStart);
    appRoot.addEventListener("dragover", onLessonBlockDragOver);
    appRoot.addEventListener("drop", onLessonBlockDrop);
    appRoot.addEventListener("dragend", finishLessonBlockDrag);
    appRoot.addEventListener("pointerdown", onLessonBlockPointerDown);
    appRoot.addEventListener("pointermove", onLessonBlockPointerMove);
    appRoot.addEventListener("pointerup", onLessonBlockPointerEnd);
    appRoot.addEventListener("pointercancel", onLessonBlockPointerEnd);
    window.addEventListener("app-network-change", () => {
      Live.scheduleReconnect(true);
      ContentSync.pull().catch(() => { });
    }, { passive: true });
    window.addEventListener("online", () => {
      Live.scheduleReconnect(true);
      ContentSync.pull().catch(() => { });
    }, { passive: true });
    window.addEventListener("offline", () => Live.setStatus("offline", "离线可用"), { passive: true });
    window.addEventListener("hashchange", onRoute);
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", () => {
      Presence.visibility();
      if (document.visibilityState === "visible") ContentSync.pull().catch(() => { });
    });
    window.addEventListener("pagehide", () => {
      saveLessonDraft();
      Presence.capture(true);
    });
    Auth.onChange((user) => {
      if (!user) return showGate();
      if (!gateBusy) enterApp();
    });
    await Auth.start();
    if (!Auth.session) showGate();
    else enterApp();
    loadRealtimeSdk();
    requestAnimationFrame(loop);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
