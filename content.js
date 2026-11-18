(() => {
  "use strict";
  if (globalThis.__cbtNotebookAttached) return;
  globalThis.__cbtNotebookAttached = true;
  const PENDING = "__cbt_notebook_pending_v1";
  let signature = "", timer, running = false, again = false;
  let pendingMemory = null;
  let settings = {...CBTNotebook.DEFAULTS};
  const extract = () => location.origin === "https://cbt.medilink-study.com" ? QBExtractor.read(document, location.href) : TecoplaExtractor.read(document, location.href);
  const host = document.createElement("div");
  host.id = "cbt-notebook-status";
  const shadow = host.attachShadow({mode: "closed"});
  const style = document.createElement("style");
  style.textContent = ":host{position:fixed;right:16px;bottom:78px;z-index:2147483646;font:13px/1.5 system-ui,sans-serif}section{background:#163b35;color:white;padding:10px 14px;border-radius:12px;box-shadow:0 3px 18px #0003;max-width:300px}span{display:block}button{font:inherit;border:1px solid #ffffff66;background:transparent;color:white;padding:3px 8px;margin-top:6px;border-radius:6px;cursor:pointer}button:disabled{opacity:.55;cursor:default}";
  const panel = document.createElement("section");
  const status = document.createElement("span");
  const manualButton = document.createElement("button");
  manualButton.type = "button";
  manualButton.textContent = "この問題を手動保存";
  panel.append(status, manualButton); shadow.append(style, panel);
  function show(message) { status.textContent = message; if (!host.isConnected) document.documentElement.append(host); }
  async function send(message) {
    const result = await chrome.runtime.sendMessage(message);
    if (!result?.ok) throw new Error(result?.error || "保存結果を確認できませんでした。");
    return result;
  }
  function readPending() {
    try { return JSON.parse(sessionStorage.getItem(PENDING) || "null") || pendingMemory; } catch { return pendingMemory; }
  }
  function current() {
    const s = extract();
    if (!s) return null;
    const pending = readPending();
    if (s.result && pending?.key === s.key && pending.url === s.url && Date.now() - pending.time < 30 * 60 * 1000) {
      s.selected = pending.selected;
      s.selectedSource = pending.selected.length ? "submission" : "unknown";
      s.attemptToken = pending.token;
    }
    return s;
  }
  // Capture synchronously before the form navigates. Do not block the site's submission.
  document.addEventListener("submit", event => {
    if (!event.target.matches("main#is_practice_question form.new_answer, main#is_practice_question form.edit_answer")) return;
    const s = extract();
    if (!s) return;
    const pending = {key: s.key, url: s.url, selected: s.selected, time: Date.now(), token: crypto.randomUUID()};
    pendingMemory = pending;
    try { sessionStorage.setItem(PENDING, JSON.stringify(pending)); } catch { /* history fallback remains available */ }
  }, true);
  async function scan() {
    if (running) { again = true; return; }
    running = true;
    try {
      const s = current();
      if (!s) { host.remove(); return; }
      manualButton.disabled = !s.result;
      if (!settings.enabled) { show("誤答ノート：自動保存は一時停止中"); return; }
      if (!s.result) { show("誤答ノート：解答待ち"); return; }
      if (!s.correct.length) { show("誤答ノート：正答の表示を待っています"); return; }
      const nextSignature = JSON.stringify(s);
      if (nextSignature === signature) return;
      const response = await send({type: "capture", snapshot: s});
      signature = nextSignature;
      show(response.saved ? `問題 ${s.questionNumber} を保存済み${s.selected.length ? "" : "（自分の回答は取得できず）"}` : "誤答ノート：不正解のときに自動保存");
    } catch (e) {
      show(`誤答ノート：${/context invalidated/i.test(e.message) ? "拡張を更新しました。ページを再読み込みしてください。" : e.message}`);
    } finally {
      running = false;
      if (again) { again = false; schedule(); }
    }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(scan, 120); }
  manualButton.addEventListener("click", async () => {
    try {
      const s = current();
      if (!s?.result) { show("解答後に保存できます。"); return; }
      const response = await send({type: "capture", snapshot: s, manual: true});
      if (response.saved) show(`問題 ${s.questionNumber} を手動保存しました`);
    } catch (e) { show(`保存できませんでした：${e.message}`); }
  });
  chrome.runtime.onMessage.addListener(message => {
    if (message.type === "settings-updated") { settings = message.settings; signature = ""; schedule(); }
  });
  // Refresh settings when the study tab becomes visible again.
  async function refreshSettings() {
    try {
      const response = await send({type: "settings"});
      if (JSON.stringify(settings) !== JSON.stringify(response.settings)) signature = "";
      settings = response.settings; schedule();
    } catch (e) { show(`誤答ノート：${e.message}`); }
  }
  new MutationObserver(changes => {
    if (changes.some(c => c.target !== host && !host.contains(c.target))) schedule();
  }).observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ["class", "checked", "aria-pressed", "hidden"], characterData: true});
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshSettings(); });
  window.addEventListener("pageshow", refreshSettings);
  document.addEventListener("turbolinks:load", () => { signature = ""; refreshSettings(); });
  window.addEventListener("hashchange", () => { signature = ""; schedule(); });
  refreshSettings();
})();
