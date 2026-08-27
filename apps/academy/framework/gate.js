window.AcademyGate = (() => {
  function user() {
    return window.AcademyAuth.session;
  }

  function lessonLevel(lesson) {
    if (lesson.access) return lesson.access;
    if (lesson.track === "onboard" && lesson.type === "article") return "basic";
    return "full";
  }

  function examLevel() {
    return "full";
  }

  function canLesson(lesson) {
    const current = user();
    if (!window.AcademyAuth.canEnter(current)) return false;
    if (window.AcademyAuth.canFull(current)) return true;
    return lessonLevel(lesson) === "basic";
  }

  function canExam(exam) {
    const current = user();
    if (!window.AcademyAuth.canEnter(current)) return false;
    if (window.AcademyAuth.canFull(current)) return true;
    return examLevel(exam) === "basic";
  }

  function label(access) {
    return access === "full" ? "需店长授权" : "基本";
  }

  return { lessonLevel, examLevel, canLesson, canExam, label };
})();
