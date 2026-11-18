/* Only the question area is read. Forms, tokens and other page metadata are not saved. */
(() => {
  "use strict";
  const clean = s => (s || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
  function text(node) {
    if (!node) return "";
    const copy = node.cloneNode(true);
    copy.querySelectorAll("script,style,input,button,textarea,select").forEach(x => x.remove());
    copy.querySelectorAll("br").forEach(x => x.replaceWith("\n"));
    copy.querySelectorAll("p,div,li,tr,h1,h2,h3,table,blockquote").forEach(x => x.append("\n"));
    copy.querySelectorAll("td,th").forEach(x => x.append("\t"));
    return (copy.textContent || "").split("\n").map(clean).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function labels(value) {
    return [...new Set((value || "").toUpperCase().match(/\b[A-J]\b/g) || [])];
  }
  function read(doc, href) {
    const root = doc.querySelector("main#is_practice_question");
    if (!root) return null;
    const bodyNode = root.querySelector("#question-body");
    const question = text(bodyNode);
    const questionNumber = text(root.querySelector(".d-issue__content__num")).match(/問題番号\s*[:：]\s*([\w-]+)/)?.[1];
    const form = root.querySelector("form.new_answer, form.edit_answer");
    const source = new URL(form?.getAttribute("action") || href, href);
    if (source.origin !== "https://m3e-medical.com" || !source.pathname.startsWith("/users/cbt/")) return null;
    const questionId = bodyNode?.querySelector("[id^='marker_body_']")?.id.replace("marker_body_", "") || source.hash.slice(1);
    if (!question || !questionNumber || !/^\d+$/.test(questionId)) return null;
    const choices = [...root.querySelectorAll("#practice_question_choice > li")].map((li, i) => {
      const button = li.querySelector("button");
      const input = li.querySelector("input");
      const raw = text(button);
      return {label: raw.match(/^([A-J])[.．、:\s]/)?.[1] || String.fromCharCode(65 + i),
        text: raw.replace(/^[A-J][.．、:]\s*/, ""), value: input?.value || "",
        selected: !!input?.checked || button?.classList.contains("active") || button?.getAttribute("aria-pressed") === "true"};
    });
    const resultNode = root.querySelector(".d-issue__answer #answer-result");
    const result = ["incorrect", "mistake", "hinted_correct", "correct"].find(x => resultNode?.classList.contains(x)) || null;
    const details = {};
    root.querySelectorAll(".d-issue__answer dl").forEach(dl => {
      const label = text(dl.querySelector("dt"));
      if (label) details[label] = text(dl.querySelector("dd"));
    });
    let selected = choices.filter(c => c.selected).map(c => c.label);
    let selectedSource = selected.length ? "selection" : "unknown";
    // This history entry is tied to the SAME answer id, unlike a general list of past answers.
    const answerId = form?.id.match(/^edit_answer_(\d+)$/)?.[1] || null;
    if (!selected.length && answerId) {
      const currentHistory = root.querySelector(`[id="answers_history_container${answerId}"] dl dd`);
      const historyText = text(currentHistory);
      if (/^解答\s*[:：]/.test(historyText)) {
        selected = labels(historyText.replace(/^解答\s*[:：]/, ""));
        if (selected.length) selectedSource = "answer-history";
      }
    }
    const images = [];
    for (const [kind, selector] of [["question", ".d-issue__content__box"], ["explanation", ".d-issue__expound__accordion_content .is-text"]]) {
      root.querySelectorAll(`${selector} img`).forEach(img => {
        const raw = img.currentSrc || img.getAttribute("src") || img.getAttribute("data-src");
        if (!raw) return;
        let url;
        try { url = new URL(raw, href); } catch { return; }
        if (url.protocol !== "https:" || /_files\//.test(url.pathname)) return;
        if (!images.some(x => x.kind === kind && x.url === url.href)) images.push({kind, url: url.href, alt: img.alt || ""});
      });
    }
    return {source: "tecopla-cbt", key: `tecopla-cbt:${questionId}`, questionId, questionNumber,
      url: `${source.origin}${source.pathname}${source.hash}`, question, choices: choices.map(({selected, ...c}) => c),
      result, answerId, selected, selectedSource, correct: labels(details["正解"]),
      answerTime: details["解答時間"] || "", accuracy: details["正答率"] || "",
      explanation: text(root.querySelector("#question-explanation")),
      categories: [...root.querySelectorAll(".d-issue__expound .is-cate li")].map(text),
      related: [...root.querySelectorAll(".d-issue__expound .is-relation li")].map(text).filter(x => x && !/^関連\s*[:：]/.test(x)), images};
  }
  globalThis.TecoplaExtractor = {read, text};
})();
