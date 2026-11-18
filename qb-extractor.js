/* QB CBT: extract only the currently rendered question, never application stores or APIs. */
(() => {
  "use strict";
  const text = node => TecoplaExtractor.text(node);
  function letters(value) {
    const s = String(value || "").normalize("NFKC").trim().toUpperCase();
    return /^[A-J\s,、・，]+$/.test(s) ? [...new Set(s.match(/[A-J]/g) || [])] : [];
  }
  function read(doc, href) {
    const page = new URL(href);
    if (page.origin !== "https://cbt.medilink-study.com" || page.pathname !== "/quiz") return null;
    const root = doc.querySelector("main");
    const stem = root?.querySelector(".html_renderer.small_img");
    const card = stem?.closest(".rounded-lg");
    if (!root || !card) return null;
    const header = [...card.querySelectorAll("span")].map(text).find(s => /^20\d{2}\s+\d+-\d+/.test(s));
    const metadata = [...root.querySelectorAll("div")].map(n => (n.textContent || "").trim()).filter(s => s.length < 300 && /^\[掲載頁[：:]/.test(s) && /\bID\s*[:：]\s*\d+/.test(s)).sort((a, b) => a.length - b.length)[0];
    const questionId = metadata?.match(/\bID\s*[:：]\s*(\d+)/)?.[1];
    const question = text(stem);
    if (!questionId || !header || !question) return null;
    const buttons = [...card.querySelectorAll("button")].filter(b => b.querySelector(".html_renderer"));
    const choiceRows = buttons.map(b => ({label: letters(text(b.querySelector(".rounded-full span")))[0] || "",
      text: [...b.querySelectorAll(".html_renderer")].map(text).join("\n"), value: "",
      selected: b.classList.contains("border-qb-green") || b.getAttribute("aria-pressed") === "true"}));
    if (!choiceRows.length || choiceRows.some(c => !c.label)) return null;
    const selected = choiceRows.filter(c => c.selected).map(c => c.label);
    // Scope to the result icon itself. Self-evaluation buttons contain OTHER colored icons.
    const resultLabel = [...root.querySelectorAll("span")].find(s => text(s) === "結果：");
    const icon = resultLabel?.parentElement?.querySelector("svg");
    let result = icon?.classList.contains("text-qb-pink") ? "incorrect" : icon?.classList.contains("text-qb-sky") ? "correct" : null;
    for (let n = resultLabel; n; n = n.parentElement) {
      const style = n.getAttribute("style") || "";
      const computed = doc.defaultView?.getComputedStyle && n.isConnected ? doc.defaultView.getComputedStyle(n) : null;
      if (n.getAttribute("hidden") !== null || n.getAttribute("aria-hidden") === "true" || /display\s*:\s*none|visibility\s*:\s*hidden/.test(style) ||
          computed?.display === "none" || computed?.visibility === "hidden" || (!computed && n.classList.contains("hidden"))) result = null;
    }
    const correctLabel = [...root.querySelectorAll("span")].find(s => text(s) === "正解：");
    const correct = letters(text(correctLabel?.parentElement?.querySelector(".font-semibold")));
    const historyTable = [...root.querySelectorAll("table")].find(t => text(t.querySelector("thead")).includes("選択した解答") && text(t.querySelector("thead")).includes("解答履歴"));
    const historyRows = historyTable ? [...historyTable.querySelectorAll("tbody tr")] : [];
    const cells = historyRows[0] ? [...historyRows[0].querySelectorAll("td")] : [];
    const historySelected = letters(text(cells[1]));
    const historyResult = text(cells[2]) === "不正解" ? "incorrect" : text(cells[2]) === "正解" ? "correct" : null;
    // A pending click can update the selection before the answer request finishes.
    if (result && selected.length && historySelected.length && selected.slice().sort().join() !== historySelected.slice().sort().join()) result = null;
    if (result && historyResult && result !== historyResult) result = null;
    const chosen = selected.length ? selected : historySelected;
    const explanationCards = [...root.querySelectorAll('[data-testid="explanation-box-title"]')].map(n => n.parentElement);
    const explanation = explanationCards.map(text).join("\n\n");
    const curriculum = [...root.querySelectorAll('[data-testid="explanation-sub-title"]')].find(n => text(n) === "コア・カリキュラム");
    const categories = curriculum ? [...curriculum.parentElement.querySelectorAll("span")].map(text).filter(Boolean) : [];
    const images = [];
    for (const [kind, scopes] of [["question", [stem, ...buttons]], ["explanation", explanationCards]]) {
      scopes.forEach(scope => scope.querySelectorAll(".html_renderer img, img").forEach(img => {
        // Reference-book icons are outside the explanation renderer and are not study figures.
        if (kind === "explanation" && !img.closest(".html_renderer")) return;
        const raw = img.currentSrc || img.getAttribute("src") || img.getAttribute("data-src");
        if (!raw) return;
        let u; try { u = new URL(raw, href); } catch { return; }
        if (u.protocol !== "https:" || /_files\//.test(u.pathname)) return;
        if (!images.some(x => x.kind === kind && x.url === u.href)) images.push({kind, url: u.href, alt: img.alt || ""});
      }));
    }
    // QB keeps the initial question_id in the URL while moving to other questions.
    // The numeric ID printed on the page is the deduplication identity; this URL is a session link.
    const sessionUrl = new URL("https://cbt.medilink-study.com/quiz");
    const initialId = page.searchParams.get("question_id");
    if (/^[a-f0-9-]{36}$/i.test(initialId || "")) sessionUrl.searchParams.set("question_id", initialId);
    return {source: "qb-cbt", key: `qb-cbt:${questionId}`, questionId, questionNumber: header,
      question, choices: choiceRows.map(({selected, ...c}) => c), result, selected: chosen,
      selectedSource: selected.length ? "selection" : chosen.length ? "answer-history" : "unknown",
      correct, explanation, categories: [...new Set(categories)], related: [], images,
      answerId: `qb-${questionId}-${text(cells[0])}-${historySelected.join("")}-${historyResult || ""}-${historyRows.length}`,
      answerTime: "", accuracy: "", url: sessionUrl.href, urlKind: "session"};
  }
  globalThis.QBExtractor = {read};
})();
