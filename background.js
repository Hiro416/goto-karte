"use strict";
importScripts("core.js");
const PREFIX = "record:";
let queue = Promise.resolve();
chrome.storage.local.setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"});
chrome.action.onClicked.addListener(() => { chrome.tabs.create({url: chrome.runtime.getURL("notebook.html")}); });
const getSettings = async () => ({...CBTNotebook.DEFAULTS, ...(await chrome.storage.local.get("settings")).settings});
const getRecords = async () => Object.entries(await chrome.storage.local.get(null)).filter(([k]) => k.startsWith(PREFIX)).map(([, v]) => v);
async function handle(message, sender) {
  // An extension page opened as a tab also has sender.tab on some Chrome versions.
  const ownPage = !!sender.url?.startsWith(chrome.runtime.getURL(""));
  const page = sender.url && (/^https:\/\/m3e-medical\.com\/users\/cbt\//.test(sender.url) || /^https:\/\/cbt\.medilink-study\.com\//.test(sender.url));
  if (!ownPage && !page) throw new Error("対象外のページです。");
  switch (message.type) {
    case "settings": return {settings: await getSettings()};
    case "capture": {
      const s = CBTNotebook.validateSnapshot(message.snapshot);
      const key = PREFIX + s.key;
      const existing = (await chrome.storage.local.get(key))[key];
      const record = CBTNotebook.mergeRecord(existing, s, {settings: await getSettings(), manual: message.manual === true});
      if (!record) return {saved: false};
      await chrome.storage.local.set({[key]: record});
      return {saved: true, questionNumber: record.questionNumber};
    }
    case "list": {
      if (!ownPage) throw new Error("ノート画面で操作してください。");
      return {records: await getRecords(), settings: await getSettings(), bytes: await chrome.storage.local.getBytesInUse(null)};
    }
    case "set-settings": {
      if (!ownPage) throw new Error("ノート画面で操作してください。");
      const settings = {enabled: message.settings.enabled === true, includeUncertain: message.settings.includeUncertain === true};
      await chrome.storage.local.set({settings}); return {settings};
    }
    case "edit": {
      if (!ownPage) throw new Error("ノート画面で操作してください。");
      const key = PREFIX + message.key;
      const r = (await chrome.storage.local.get(key))[key];
      if (!r) throw new Error("問題が見つかりません。");
      await chrome.storage.local.set({[key]: {...r, note: String(message.note || "").slice(0, 50000), reviewed: message.reviewed === true}});
      return {saved: true};
    }
    case "remove": {
      if (!ownPage) throw new Error("ノート画面で操作してください。");
      await chrome.storage.local.remove(PREFIX + message.key); return {removed: true};
    }
    case "restore": {
      if (!ownPage) throw new Error("ノート画面で操作してください。");
      if (message.backup?.format !== "cbt-notebook" || message.backup.version !== 1 || !Array.isArray(message.backup.records) || message.backup.records.length > 10000) throw new Error("対応するJSONバックアップではありません。");
      // Validate the complete batch before touching storage. Existing notes win on conflicts.
      const incoming = message.backup.records.map(CBTNotebook.restoreRecord);
      const current = await chrome.storage.local.get(null);
      const updates = {};
      incoming.forEach(r => { const key = PREFIX + r.key; if (!current[key]) updates[key] = r; });
      if (Object.keys(updates).length) await chrome.storage.local.set(updates);
      return {imported: Object.keys(updates).length, skipped: incoming.length - Object.keys(updates).length};
    }
    default: throw new Error("不明な操作です。");
  }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  queue = queue.catch(() => {}).then(() => handle(message, sender)).then(data => sendResponse({ok: true, ...data}), error => sendResponse({ok: false,
    error: /quota/i.test(error.message) ? "保存容量の上限です。JSONを書き出してから不要な問題を削除してください。" : error.message}));
  return true;
});
