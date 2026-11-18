(() => {
  "use strict";
  const DEFAULTS = {enabled: true, includeUncertain: false};
  const RESULTS = ["incorrect", "mistake", "hinted_correct", "correct"];
  const resultLabel = r => ({incorrect: "不正解", mistake: "△", hinted_correct: "ヒント使用・正解", correct: "正解"}[r] || "不明");
  function validateSnapshot(s) {
    if (!s || !["tecopla-cbt", "qb-cbt"].includes(s.source) || !/^\d+$/.test(s.questionId) || s.key !== `${s.source}:${s.questionId}` ||
        typeof s.question !== "string" || !s.question.trim() || s.question.length > 300000 ||
        !RESULTS.includes(s.result) || !Array.isArray(s.choices) || s.choices.length > 20 ||
        !Array.isArray(s.selected) || !Array.isArray(s.correct) || !s.correct.length) throw new Error("解答済みの問題データを読み取れませんでした。");
    const u = new URL(s.url);
    const isTecopla = s.source === "tecopla-cbt" && u.origin === "https://m3e-medical.com" && u.pathname.startsWith("/users/cbt/");
    const isQB = s.source === "qb-cbt" && u.origin === "https://cbt.medilink-study.com" && u.pathname === "/quiz";
    if (!isTecopla && !isQB) throw new Error("保存元URLが不正です。");
    const canonical = new URL(`${u.origin}${u.pathname}${isTecopla ? u.hash : ""}`);
    if (isQB && /^[a-f0-9-]{36}$/i.test(u.searchParams.get("question_id") || "")) canonical.searchParams.set("question_id", u.searchParams.get("question_id"));
    const str = (v, max = 300000) => typeof v === "string" ? v.slice(0, max) : "";
    const letters = a => [...new Set(a.filter(x => typeof x === "string" && /^[A-J]$/.test(x)))];
    return {source: s.source, key: s.key, questionId: s.questionId, questionNumber: str(s.questionNumber, 100),
      question: s.question, url: canonical.href, urlKind: isQB ? "session" : "question", result: s.result,
      choices: s.choices.map(c => ({label: str(c.label, 2), text: str(c.text), value: str(c.value, 100)})),
      selected: letters(s.selected), correct: letters(s.correct), selectedSource: str(s.selectedSource, 40),
      answerId: str(s.answerId, 100), answerTime: str(s.answerTime, 100), accuracy: str(s.accuracy, 100),
      explanation: str(s.explanation), categories: (s.categories || []).filter(x => typeof x === "string").slice(0, 20).map(x => x.slice(0, 100)),
      related: (s.related || []).filter(x => typeof x === "string").slice(0, 20).map(x => x.slice(0, 100)),
      images: (s.images || []).filter(x => x && ["question", "explanation"].includes(x.kind) && typeof x.url === "string" && x.url.startsWith("https://")).slice(0, 100).map(x => ({kind: x.kind, url: x.url.slice(0, 8000), alt: str(x.alt, 1000)})),
      attemptToken: str(s.attemptToken, 150)};
  }
  function mergeRecord(existing, snapshot, options = {}) {
    const s = validateSnapshot(snapshot);
    const settings = {...DEFAULTS, ...options.settings};
    const eligible = s.result === "incorrect" || (settings.includeUncertain && ["mistake", "hinted_correct"].includes(s.result));
    if (!options.manual && !existing && (!settings.enabled || !eligible)) return null;
    if (!options.manual && !settings.enabled) return null;
    const now = options.now || new Date().toISOString();
    const attemptKey = s.attemptToken ? `submit:${s.attemptToken}` : `answer:${s.answerId || s.url}`;
    const attempts = [...(existing?.attempts || [])];
    let index = attempts.findIndex(x => x.id === attemptKey);
    // Reopening a result page has no submission token. Reuse its last recorded submission.
    if (index < 0 && !s.attemptToken && s.answerId) index = attempts.findLastIndex(x => x.answerId === s.answerId);
    const old = index >= 0 ? attempts[index] : null;
    const selected = s.selected.length ? s.selected : old?.selected || [];
    const attempt = {id: old?.id || attemptKey, answerId: s.answerId, firstSeen: old?.firstSeen || now,
      lastSeen: now, result: s.result, selected, selectedSource: s.selected.length ? s.selectedSource : old?.selectedSource || "unknown"};
    if (index >= 0) attempts[index] = attempt; else attempts.push(attempt);
    const {attemptToken, ...data} = s;
    return {...existing, ...data, selected, selectedSource: attempt.selectedSource, attempts,
      createdAt: existing?.createdAt || now, updatedAt: now, reviewed: existing?.reviewed || false, note: existing?.note || ""};
  }
  const md = s => String(s || "").replace(/([\\`*_{}\[\]<>])/g, "\\$1");
  function markdown(records) {
    const lines = ["# CBT 誤答ノート", "", `書き出し日時：${new Date().toLocaleString("ja-JP")}`, `問題数：${records.length}`, "",
      "画像は参照URLです。画像ファイルそのものは保存していません。", ""];
    records.forEach(r => {
      const unknown = !r.selected?.length;
      lines.push(`## ${md(r.questionNumber)} — ${resultLabel(r.result)}`, "", `出典：${r.source === "qb-cbt" ? "QB CBT" : "テコプラCBT"}`,
        `[${r.urlKind === "session" ? "QBの演習を開く（問題番号を照合してください）" : "元の問題を開く"}](${r.url})`, "",
        `分野：${(r.categories || []).map(md).join(" / ") || "未分類"}`, `自分の回答：${unknown ? "取得できず" : r.selected.join("・")}`,
        `正答：${r.correct.join("・")}　正答率：${md(r.accuracy) || "不明"}`, `復習：${r.reviewed ? "済" : "未"}`, "", "### 問題", "", md(r.question), "");
      (r.choices || []).forEach(c => lines.push(`- ${md(c.label)}. ${md(c.text)}`));
      lines.push("", "### 解説", "", md(r.explanation) || "未取得。元の問題の解説を開いてください。", "");
      if (r.note) lines.push("### 自分のメモ", "", md(r.note), "");
      if (r.images?.length) {
        lines.push("### 画像の参照URL", "");
        r.images.forEach((im, i) => lines.push(`- [${im.kind === "question" ? "問題" : "解説"}画像 ${i + 1}](${im.url.replace(/\(/g, "%28").replace(/\)/g, "%29")})`));
        lines.push("");
      }
      lines.push("---", "");
    });
    return lines.join("\n");
  }
  function restoreRecord(raw) {
    const s = validateSnapshot(raw);
    const iso = v => typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : new Date().toISOString();
    const attempts = (Array.isArray(raw.attempts) ? raw.attempts : []).slice(-1000).filter(x => x && typeof x.id === "string" && RESULTS.includes(x.result)).map(x => ({
      id: x.id.slice(0, 200), answerId: typeof x.answerId === "string" ? x.answerId.slice(0, 100) : "",
      firstSeen: iso(x.firstSeen), lastSeen: iso(x.lastSeen), result: x.result,
      selected: (Array.isArray(x.selected) ? x.selected : []).filter(v => typeof v === "string" && /^[A-J]$/.test(v)),
      selectedSource: typeof x.selectedSource === "string" ? x.selectedSource.slice(0, 40) : "unknown"}));
    return {...s, attempts, createdAt: iso(raw.createdAt), updatedAt: iso(raw.updatedAt), reviewed: raw.reviewed === true,
      note: typeof raw.note === "string" ? raw.note.slice(0, 50000) : ""};
  }
  globalThis.CBTNotebook = {DEFAULTS, resultLabel, validateSnapshot, mergeRecord, markdown, restoreRecord};
})();
