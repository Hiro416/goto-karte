(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  let records = [], filtered = [], selectedKey = null;
  let loadedSettings = false;
  let draft = null;
  function el(tag, text, cls) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; }
  function announce(text, error = false) { $("#message").textContent = text; $("#message").className = error ? "error" : ""; }
  async function send(message) {
    const r = await chrome.runtime.sendMessage(message);
    if (!r?.ok) throw new Error(r?.error || "操作を完了できませんでした。");
    return r;
  }
  const safe = fn => (...args) => Promise.resolve().then(() => fn(...args)).catch(e => announce(e.message, true));
  function persistDraft() {
    if (!draft) return Promise.resolve();
    const {key, note, reviewed, originalNote, originalReviewed} = draft;
    if (note === originalNote && reviewed === originalReviewed) return Promise.resolve();
    return send({type: "edit", key, note, reviewed}).then(() => {
      const r = records.find(x => x.key === key); if (r) Object.assign(r, {note, reviewed});
      if (draft?.key === key) Object.assign(draft, {originalNote: note, originalReviewed: reviewed});
    });
  }
  async function refresh() {
    const data = await send({type: "list"});
    records = data.records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    $("#enabled").checked = data.settings.enabled;
    $("#uncertain").checked = data.settings.includeUncertain;
    loadedSettings = true;
    $("#stats").textContent = `${records.length}問を保存 · 未復習 ${records.filter(r => !r.reviewed).length}問 · ${(data.bytes / 1024).toFixed(0)} KB / 10 MB`;
    const chosen = $("#category").value;
    $("#category").replaceChildren(new Option("すべての分野", ""));
    [...new Set(records.flatMap(r => r.categories))].sort().forEach(c => $("#category").add(new Option(c, c)));
    $("#category").value = chosen;
    filter();
    const active = records.find(r => r.key === selectedKey);
    if (active) detail(active);
  }
  function filter() {
    const q = $("#search").value.trim().toLocaleLowerCase();
    const category = $("#category").value, review = $("#review").value, source = $("#source").value;
    filtered = records.filter(r => (!q || [r.questionNumber, r.question, r.explanation, r.note, ...r.categories].join(" ").toLocaleLowerCase().includes(q)) &&
      (!category || r.categories.includes(category)) && (!source || r.source === source) && (review === "all" || (review === "done" ? r.reviewed : !r.reviewed)));
    $("#count").textContent = `${filtered.length}問を表示`;
    $("#markdown").disabled = !filtered.length;
    const list = $("#list"); list.replaceChildren();
    if (!filtered.length) list.append(el("p", "該当する問題はありません。", "meta"));
    filtered.forEach(r => {
      const b = el("button", undefined, `row${r.key === selectedKey ? " active" : ""}`);
      b.append(el("span", `${r.source === "qb-cbt" ? "QB" : "テコプラ"} ${r.questionNumber} · ${CBTNotebook.resultLabel(r.result)}`, "row-title"),
        el("span", r.question.slice(0, 85) + (r.question.length > 85 ? "…" : ""), "row-summary"),
        el("span", `${r.reviewed ? "復習済み" : "未復習"} · ${r.categories.join(" / ")}`, "row-meta"));
      b.addEventListener("click", safe(async () => { await persistDraft(); selectedKey = r.key; filter(); detail(r); }));
      list.append(b);
    });
    if (!selectedKey && filtered.length) { selectedKey = filtered[0].key; detail(filtered[0]); list.firstElementChild?.classList.add("active"); }
  }
  function detail(r) {
    const target = $("#detail"); target.replaceChildren();
    target.append(el("h2", `問題 ${r.questionNumber}`), el("p", r.categories.join(" / "), "tags"));
    const a = el("a", r.source === "qb-cbt" ? "QBの演習を開く" : "テコプラで元の問題を開く"); a.href = r.url; a.target = "_blank"; a.rel = "noopener noreferrer"; target.append(a);
    if (r.urlKind === "session") target.append(el("p", "QBのリンク先では、保存した問題番号と照合してください。", "meta"));
    target.append(el("p", `保存：${new Date(r.createdAt).toLocaleString("ja-JP")}　更新：${new Date(r.updatedAt).toLocaleString("ja-JP")}`, "meta"));
    const answers = el("div", `自分の回答：${r.selected.length ? r.selected.join("・") : "取得できず"}　→　正答：${r.correct.join("・")}\n判定：${CBTNotebook.resultLabel(r.result)}　正答率：${r.accuracy || "不明"}　解答時間：${r.answerTime || "不明"}`, "answers text"); target.append(answers);
    if (r.selectedSource === "answer-history") target.append(el("p", "自分の回答は、画面に表示された解答履歴から取得しました。", "meta"));
    target.append(el("h3", "問題"), el("div", r.question, "text"));
    const choices = el("ul", undefined, "choices");
    r.choices.forEach(c => choices.append(el("li", `${c.label}. ${c.text}${r.selected.includes(c.label) ? " ← 自分の回答" : ""}${r.correct.includes(c.label) ? " ✓" : ""}`, r.selected.includes(c.label) ? "selected" : "")));
    target.append(choices, el("h3", "解説"), el("div", r.explanation || "解説を取得できていません。元の問題で解説を開いてください。", "text"));
    if (r.images.length) {
      target.append(el("h3", "画像の参照URL"), el("p", "画像本体は未保存です。リンク先の閲覧にログインが必要な場合があります。", "meta"));
      const ul = el("ul", undefined, "images");
      r.images.forEach((im, i) => { const li = el("li"); const link = el("a", `${im.kind === "question" ? "問題" : "解説"}画像 ${i + 1}`); link.href = im.url; link.target = "_blank"; link.rel = "noopener noreferrer"; li.append(link); ul.append(li); }); target.append(ul);
    }
    if (r.attempts.length) {
      const d = el("details"); d.append(el("summary", "取得した解答の記録"));
      const ul = el("ul", undefined, "history"); r.attempts.forEach(t => ul.append(el("li", `${new Date(t.firstSeen).toLocaleString("ja-JP")} · ${CBTNotebook.resultLabel(t.result)} · 回答 ${t.selected.join("・") || "不明"}`))); d.append(ul); target.append(d);
    }
    const label = el("label", "自分のメモ"); label.htmlFor = "note"; const h = el("h3"); h.append(label); target.append(h);
    const note = el("textarea"); note.id = "note"; note.placeholder = "間違えた理由・覚えること"; note.value = r.note; note.maxLength = 50000;
    const actions = el("div", undefined, "actions"), reviewLabel = el("label"), review = el("input"); review.type = "checkbox"; review.checked = r.reviewed;
    reviewLabel.append(review, document.createTextNode(" 復習済み"));
    const save = el("button", "メモを保存", "primary"), remove = el("button", "この問題を削除", "danger");
    draft = {key: r.key, note: r.note, reviewed: r.reviewed, originalNote: r.note, originalReviewed: r.reviewed};
    note.addEventListener("input", () => { draft.note = note.value; }); review.addEventListener("change", () => { draft.reviewed = review.checked; });
    save.addEventListener("click", safe(async () => { await persistDraft(); await refresh(); announce("メモと復習状況を保存しました。"); }));
    remove.addEventListener("click", safe(async () => {
      if (!confirm(`問題 ${r.questionNumber} を削除しますか？`)) return;
      await send({type: "remove", key: r.key}); draft = null; selectedKey = null; target.replaceChildren(); await refresh(); announce("削除しました。");
    }));
    actions.append(reviewLabel, save, remove); target.append(note, actions);
  }
  function download(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], {type})); const a = el("a"); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
  const today = () => new Date().toLocaleDateString("sv-SE");
  $("#search").addEventListener("input", filter); $("#category").addEventListener("change", filter); $("#review").addEventListener("change", filter); $("#source").addEventListener("change", filter);
  for (const id of ["#enabled", "#uncertain"]) $(id).addEventListener("change", safe(async () => {
    if (!loadedSettings) return;
    await send({type: "set-settings", settings: {enabled: $("#enabled").checked, includeUncertain: $("#uncertain").checked}});
    announce("設定を保存しました。演習タブに戻ると反映されます。");
  }));
  $("#markdown").addEventListener("click", safe(async () => { await persistDraft(); filter(); download(`誤答カルテ_${today()}.md`, CBTNotebook.markdown(filtered), "text/markdown;charset=utf-8"); announce("表示中の問題を書き出しました。"); }));
  $("#backup").addEventListener("click", safe(async () => { await persistDraft(); download(`誤答カルテ_${today()}.json`, JSON.stringify({format: "cbt-notebook", version: 1, exportedAt: new Date().toISOString(), records}, null, 2), "application/json"); announce("全件をJSONに書き出しました。"); }));
  $("#restore").addEventListener("change", safe(async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("JSONは20MB以下にしてください。");
      const backup = JSON.parse(await file.text());
      await persistDraft(); const result = await send({type: "restore", backup});
      await refresh(); announce(`${result.imported}問を復元しました。既存の${result.skipped}問はそのまま保持しました。`);
    } finally { event.target.value = ""; }
  }));
  // Keep an unsaved memo visible when the user returns to this tab.
  window.addEventListener("focus", safe(async () => { await persistDraft(); await refresh(); }));
  window.addEventListener("beforeunload", event => { if (draft && (draft.note !== draft.originalNote || draft.reviewed !== draft.originalReviewed)) { event.preventDefault(); event.returnValue = ""; } });
  safe(refresh)();
})();
