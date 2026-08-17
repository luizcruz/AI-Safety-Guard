if (typeof importScripts === "function" && typeof globalThis.AISafetyGuardRules === "undefined") importScripts("rules.js");

(function rulesUpdater(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.storage) api.register(chrome, fetch, root.AISafetyGuardRules ? root.AISafetyGuardRules.version : "0.0.0");
})(typeof globalThis !== "undefined" ? globalThis : this, function createRulesUpdater() {
  "use strict";

  const DEFAULT_API_URL = "http://127.0.0.1:8000";
  const MAX_AUDIT_ENTRIES = 500;
  const OFFSCREEN_PATH = "src/offscreen.html";
  let offscreenCreation = null;

  function compareVersions(left, right) {
    const a = String(left || "0.0.0").split(".").map(Number);
    const b = String(right || "0.0.0").split(".").map(Number);
    for (let index = 0; index < 3; index += 1) {
      if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
    }
    return 0;
  }

  function validateCatalog(catalog) {
    if (!catalog || typeof catalog.version !== "string" || !/^\d+\.\d+\.\d+$/.test(catalog.version)) return false;
    if (!catalog.categories || !Object.keys(catalog.categories).length || !Array.isArray(catalog.patterns) || !catalog.keywords || !Array.isArray(catalog.heuristics) || !Array.isArray(catalog.fileNameRules || [])) return false;
    try {
      for (const rule of catalog.patterns) {
        if (!catalog.categories[rule.category] || typeof rule.source !== "string" || rule.source.length > 5000 || rule.score < 0 || rule.score > 100 || ![null, undefined, "luhn", "iban"].includes(rule.validator)) return false;
        new RegExp(rule.source, rule.flags);
      }
      for (const [category, words] of Object.entries(catalog.keywords)) {
        if (!catalog.categories[category] || !Array.isArray(words) || words.some((word) => typeof word !== "string" || !word.length)) return false;
      }
      for (const rule of catalog.heuristics) {
        if (!catalog.categories[rule.category] || typeof rule.id !== "string" || typeof rule.score !== "number" || rule.score < 0 || rule.score > 100) return false;
      }
      for (const rule of catalog.fileNameRules || []) {
        if (!catalog.categories[rule.category] || typeof rule.label !== "string" || !Array.isArray(rule.names) || !rule.names.length || rule.names.some((name) => typeof name !== "string") || rule.score < 0 || rule.score > 100) return false;
      }
    } catch {
      return false;
    }
    return true;
  }

  async function downloadRules(config, fetchImpl = fetch) {
    if (!config.apiToken) return { updated: false, reason: "missing-token" };
    const parsedUrl = new URL(String(config.apiUrl || DEFAULT_API_URL));
    const local = ["127.0.0.1", "localhost", "[::1]"].includes(parsedUrl.hostname);
    if (parsedUrl.protocol !== "https:" && !(parsedUrl.protocol === "http:" && local)) throw new Error("A API remota deve usar HTTPS");
    const baseUrl = parsedUrl.origin;
    const response = await fetchImpl(`${baseUrl}/v1/rulesets/latest`, {
      headers: { Authorization: `Bearer ${config.apiToken}`, Accept: "application/json" },
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`Rules API respondeu ${response.status}`);
    const catalog = await response.json();
    if (!validateCatalog(catalog)) throw new Error("Catálogo remoto inválido");
    if (compareVersions(catalog.version, config.currentVersion) <= 0) return { updated: false, reason: "not-newer", catalog };
    return { updated: true, catalog };
  }

  function sanitizeAuditEntry(entry, now = () => new Date()) {
    const parsed = new Date((entry && entry.timestamp) || "");
    const timestamp = Number.isNaN(parsed.getTime()) ? now().toISOString() : parsed.toISOString();
    const clean = (value, limit) => String(value || "").replace(/[\r\n]+/g, " ").slice(0, limit);
    return {
      timestamp,
      ai: clean(entry && entry.ai, 80) || "Desconhecida",
      findings: Array.isArray(entry && entry.findings) ? entry.findings.slice(0, 10).map((finding) => ({
        category: clean(finding.category, 120),
        label: clean(finding.label, 180),
        sample: clean(finding.sample, 300),
        source: clean(finding.source, 255)
      })) : []
    };
  }

  function formatAuditLog(entries) {
    return entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  }

  async function ensureOffscreenDocument(chromeApi) {
    if (!chromeApi.offscreen || !chromeApi.runtime.getContexts) return false;
    const documentUrl = chromeApi.runtime.getURL(OFFSCREEN_PATH);
    const contexts = await chromeApi.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [documentUrl] });
    if (contexts.length) return true;
    if (!offscreenCreation) {
      offscreenCreation = chromeApi.offscreen.createDocument({
        url: OFFSCREEN_PATH,
        reasons: ["BLOBS"],
        justification: "Criar o arquivo local consolidado de auditoria do AI Safety Guard"
      }).finally(() => { offscreenCreation = null; });
    }
    await offscreenCreation;
    return true;
  }

  async function auditDownloadUrl(chromeApi, content) {
    if (await ensureOffscreenDocument(chromeApi)) {
      const response = await chromeApi.runtime.sendMessage({ target: "offscreen", type: "CREATE_AUDIT_BLOB", content });
      if (!response || !response.ok || !response.url) throw new Error(response && response.error ? response.error : "Documento offscreen não criou o arquivo de auditoria");
      return response.url;
    }
    return `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
  }

  async function downloadAuditLog(chromeApi, auditLog) {
    if (!chromeApi.downloads || !chromeApi.downloads.download) throw new Error("Permissão de downloads indisponível");
    const url = await auditDownloadUrl(chromeApi, formatAuditLog(auditLog));
    return chromeApi.downloads.download({
      url,
      filename: "AI Safety Guard/ai-safety-guard.log",
      conflictAction: "overwrite",
      saveAs: false
    });
  }

  async function appendAuditLog(chromeApi, entry) {
    const state = await chromeApi.storage.local.get({ auditLog: [] });
    const auditLog = [...(Array.isArray(state.auditLog) ? state.auditLog : []), sanitizeAuditEntry(entry)].slice(-MAX_AUDIT_ENTRIES);
    await chromeApi.storage.local.set({ auditLog, auditLogUpdatedAt: new Date().toISOString() });
    try {
      await downloadAuditLog(chromeApi, auditLog);
      await chromeApi.storage.local.set({ auditLogLastError: "" });
    } catch (error) {
      await chromeApi.storage.local.set({ auditLogLastError: error.message });
      throw error;
    }
    return auditLog.at(-1);
  }

  function register(chromeApi, fetchImpl = fetch, bundledVersion = "1.2.0") {
    let auditQueue = Promise.resolve();
    const refresh = async () => {
      const config = await chromeApi.storage.local.get({ apiUrl: DEFAULT_API_URL, apiToken: "", rulesVersion: bundledVersion });
      try {
        const bundledIsNewer = compareVersions(bundledVersion, config.rulesVersion) > 0;
        if (bundledIsNewer) {
          if (chromeApi.storage.local.remove) await chromeApi.storage.local.remove("rulesCatalog");
          await chromeApi.storage.local.set({ rulesVersion: bundledVersion });
        }
        const currentVersion = bundledIsNewer ? bundledVersion : config.rulesVersion;
        const result = await downloadRules({ ...config, currentVersion }, fetchImpl);
        if (result.updated) {
          await chromeApi.storage.local.set({ rulesCatalog: result.catalog, rulesVersion: result.catalog.version, rulesLastUpdated: new Date().toISOString(), rulesLastError: "" });
        } else {
          await chromeApi.storage.local.set({ rulesLastChecked: new Date().toISOString(), rulesLastError: "" });
        }
        return result;
      } catch (error) {
        await chromeApi.storage.local.set({ rulesLastError: error.message, rulesLastChecked: new Date().toISOString() });
        throw error;
      }
    };
    chromeApi.runtime.onStartup.addListener(() => { refresh().catch(() => undefined); });
    chromeApi.runtime.onInstalled.addListener(() => { refresh().catch(() => undefined); });
    chromeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message && message.type === "REFRESH_RULES") {
        refresh().then((result) => sendResponse({ ok: true, ...result })).catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
      }
      if (message && message.type === "RECORD_DETECTION") {
        auditQueue = auditQueue.catch(() => undefined).then(() => appendAuditLog(chromeApi, message.entry));
        auditQueue.then((entry) => sendResponse({ ok: true, entry })).catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
      }
      if (message && message.type === "EXPORT_AUDIT_LOG") {
        auditQueue = auditQueue.catch(() => undefined).then(async () => {
          const state = await chromeApi.storage.local.get({ auditLog: [] });
          if (!state.auditLog.length) throw new Error("Nenhum registro disponível para exportação");
          await downloadAuditLog(chromeApi, state.auditLog);
          await chromeApi.storage.local.set({ auditLogLastError: "" });
          return state.auditLog.length;
        });
        auditQueue.then((count) => sendResponse({ ok: true, count })).catch(async (error) => {
          await chromeApi.storage.local.set({ auditLogLastError: error.message });
          sendResponse({ ok: false, error: error.message });
        });
        return true;
      }
      return false;
    });
    return { refresh };
  }

  return Object.freeze({ compareVersions, validateCatalog, downloadRules, sanitizeAuditEntry, formatAuditLog, ensureOffscreenDocument, auditDownloadUrl, downloadAuditLog, appendAuditLog, register, DEFAULT_API_URL });
});
