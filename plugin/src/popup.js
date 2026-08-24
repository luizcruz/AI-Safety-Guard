(function configurePopup() {
  "use strict";
  const container = document.querySelector("#categories");
  const apiForm = document.querySelector("#api-settings");
  const apiUrl = document.querySelector("#api-url");
  const apiToken = document.querySelector("#api-token");
  const status = document.querySelector("#rules-status");
  const auditStatus = document.querySelector("#audit-status");
  const downloadAudit = document.querySelector("#download-audit");
  const categoryInputs = new Map();
  const modeInputs = [...document.querySelectorAll("input[name='protection-mode']")];

  initialize().catch((error) => showStatus(error.message, true));

  async function initialize() {
    const remote = await chrome.storage.local.get({ apiUrl: "http://127.0.0.1:8000", apiToken: "", rulesVersion: AISafetyGuard.version, rulesCatalog: null, rulesLastError: "", auditLog: [] });
    if (remote.rulesCatalog) {
      try { AISafetyGuard.updateCatalog(remote.rulesCatalog); } catch { /* bundled catalog remains active */ }
    }
    renderCategories();
    const settings = await chrome.storage.sync.get({ enabledCategories: Object.keys(AISafetyGuard.CATEGORIES), knownCategories: [], mode: AISafetyProtectionPolicy.DEFAULT_MODE });
    settings.mode = AISafetyProtectionPolicy.normalizeMode(settings.mode);
    const currentCategories = Object.keys(AISafetyGuard.CATEGORIES);
    const knownCategories = settings.knownCategories.length ? settings.knownCategories : currentCategories.filter((category) => category !== "sensitiveFileNames");
    const addedCategories = currentCategories.filter((category) => !knownCategories.includes(category));
    settings.enabledCategories = [...new Set([...settings.enabledCategories, ...addedCategories])];
    await chrome.storage.sync.set({ enabledCategories: settings.enabledCategories, knownCategories: currentCategories, mode: settings.mode });
    (modeInputs.find((input) => input.value === settings.mode) || modeInputs[0]).checked = true;
    for (const [key, input] of categoryInputs) input.checked = settings.enabledCategories.includes(key);
    apiUrl.value = remote.apiUrl;
    apiToken.value = remote.apiToken;
    showStatus(remote.rulesLastError ? `Falha: ${remote.rulesLastError}` : `Regras ativas: v${remote.rulesVersion}`, Boolean(remote.rulesLastError));
    showAuditStatus(remote.auditLog);
  }

  function renderCategories() {
    container.replaceChildren();
    categoryInputs.clear();
    for (const [key, label] of Object.entries(AISafetyGuard.CATEGORIES)) {
      const row = document.createElement("label");
      row.className = "row";
      row.append(document.createTextNode(label));
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.category = key;
      input.addEventListener("change", saveProtection);
      row.appendChild(input);
      container.appendChild(row);
      categoryInputs.set(key, input);
    }
  }

  for (const input of modeInputs) input.addEventListener("change", saveProtection);

  downloadAudit.addEventListener("click", async () => {
    try {
      const { auditLog } = await chrome.storage.local.get({ auditLog: [] });
      if (!AISafetyAuditLog.download(auditLog)) return showAuditStatus([]);
      showAuditStatus(auditLog, "Log baixado. ");
    } catch (error) {
      auditStatus.textContent = `Falha ao baixar o log: ${error.message}`;
      auditStatus.style.background = "#fef3f2";
      auditStatus.style.color = "#912018";
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.auditLog) showAuditStatus(changes.auditLog.newValue);
  });

  function showAuditStatus(auditLog, prefix = "") {
    const count = Array.isArray(auditLog) ? auditLog.length : 0;
    auditStatus.textContent = count ? `${prefix}${count} registro${count === 1 ? "" : "s"} armazenado${count === 1 ? "" : "s"}.` : "Nenhum registro disponível.";
    auditStatus.style.background = "#f1f5f9";
    auditStatus.style.color = "#475569";
    downloadAudit.disabled = count === 0;
  }

  function saveProtection() {
    chrome.storage.sync.set({
      enabledCategories: [...categoryInputs].filter(([, input]) => input.checked).map(([key]) => key),
      mode: AISafetyProtectionPolicy.normalizeMode(modeInputs.find((input) => input.checked)?.value)
    });
  }

  apiForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const url = new URL(apiUrl.value);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Protocolo da API inválido");
      const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
      if (url.protocol !== "https:" && !local) throw new Error("APIs remotas devem usar HTTPS");
      const granted = await chrome.permissions.request({ origins: [`${url.origin}/*`] });
      if (!granted) return showStatus("Permissão de acesso à API negada.", true);
      await chrome.storage.local.set({ apiUrl: url.origin, apiToken: apiToken.value.trim() });
      showStatus("Consultando regras mais recentes…", false);
      const response = await chrome.runtime.sendMessage({ type: "REFRESH_RULES" });
      if (!response || !response.ok) return showStatus(`Falha: ${response ? response.error : "serviço indisponível"}`, true);
      const state = await chrome.storage.local.get({ rulesVersion: AISafetyGuard.version });
      showStatus(`Regras ativas: v${state.rulesVersion}`, false);
    } catch (error) {
      showStatus(error.message, true);
    }
  });

  function showStatus(message, error) {
    status.textContent = message;
    status.style.background = error ? "#fef3f2" : "#f1f5f9";
    status.style.color = error ? "#912018" : "#475569";
  }
})();
