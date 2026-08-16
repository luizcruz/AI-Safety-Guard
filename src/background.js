(function rulesUpdater(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.storage) api.register(chrome);
})(typeof globalThis !== "undefined" ? globalThis : this, function createRulesUpdater() {
  "use strict";

  const DEFAULT_API_URL = "http://127.0.0.1:8000";

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
    if (!catalog.categories || !Object.keys(catalog.categories).length || !Array.isArray(catalog.patterns) || !catalog.keywords || !Array.isArray(catalog.heuristics)) return false;
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

  function register(chromeApi, fetchImpl = fetch) {
    const refresh = async () => {
      const config = await chromeApi.storage.local.get({ apiUrl: DEFAULT_API_URL, apiToken: "", rulesVersion: "1.1.0" });
      try {
        const result = await downloadRules({ ...config, currentVersion: config.rulesVersion }, fetchImpl);
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
      return false;
    });
    return { refresh };
  }

  return Object.freeze({ compareVersions, validateCatalog, downloadRules, register, DEFAULT_API_URL });
});
