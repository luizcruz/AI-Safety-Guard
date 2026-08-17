(function configurePopup() {
  "use strict";
  const enabled = document.querySelector("#enabled");
  const container = document.querySelector("#categories");
  const apiForm = document.querySelector("#api-settings");
  const apiUrl = document.querySelector("#api-url");
  const apiToken = document.querySelector("#api-token");
  const status = document.querySelector("#rules-status");
  const auditStatus = document.querySelector("#audit-status");
  const exportAudit = document.querySelector("#export-audit");
  const categoryInputs = new Map();
  const modeInputs = [...document.querySelectorAll("input[name='protection-mode']")];

  initialize().catch((error) => showStatus(error.message, true));

  async function initialize() {
    const remote = await chrome.storage.local.get({ apiUrl: "http://127.0.0.1:8000", apiToken: "", rulesVersion: AISafetyGuard.version, rulesCatalog: null, rulesLastError: "", auditLog: [], auditLogLastError: "" });
    if (remote.rulesCatalog) {
      try { AISafetyGuard.updateCatalog(remote.rulesCatalog); } catch { /* bundled catalog remains active */ }
    }
    renderCategories();
    const settings = await chrome.storage.sync.get({ enabled: true, enabledCategories: Object.keys(AISafetyGuard.CATEGORIES), knownCategories: [], mode: "block" });
    const currentCategories = Object.keys(AISafetyGuard.CATEGORIES);
    const knownCategories = settings.knownCategories.length ? settings.knownCategories : currentCategories.filter((category) => category !== "sensitiveFileNames");
    const addedCategories = currentCategories.filter((category) => !knownCategories.includes(category));
    settings.enabledCategories = [...new Set([...settings.enabledCategories, ...addedCategories])];
    await chrome.storage.sync.set({ enabledCategories: settings.enabledCategories, knownCategories: currentCategories });
    enabled.checked = settings.enabled !== false;
    (modeInputs.find((input) => input.value === settings.mode) || modeInputs[0]).checked = true;
    for (const [key, input] of categoryInputs) input.checked = settings.enabledCategories.includes(key);
    apiUrl.value = remote.apiUrl;
    apiToken.value = remote.apiToken;
    showStatus(remote.rulesLastError ? `Falha: ${remote.rulesLastError}` : `Regras ativas: v${remote.rulesVersion}`, Boolean(remote.rulesLastError));
    showAuditStatus(remote.auditLog.length, remote.auditLogLastError);
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

  enabled.addEventListener("change", saveProtection);
  for (const input of modeInputs) input.addEventListener("change", saveProtection);
  function saveProtection() {
    chrome.storage.sync.set({
      enabled: enabled.checked,
      enabledCategories: [...categoryInputs].filter(([, input]) => input.checked).map(([key]) => key),
      mode: modeInputs.find((input) => input.checked)?.value || "block"
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

  exportAudit.addEventListener("click", async () => {
    exportAudit.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: "EXPORT_AUDIT_LOG" });
      if (!response || !response.ok) throw new Error(response && response.error ? response.error : "Falha ao gerar o arquivo");
      showAuditStatus(response.count, "");
    } catch (error) {
      showAuditStatus(0, error.message);
    } finally {
      exportAudit.disabled = false;
    }
  });

  function showAuditStatus(count, error) {
    auditStatus.textContent = error ? `Falha no log: ${error}` : `${count} registro(s). Arquivo: Downloads/AI Safety Guard/ai-safety-guard.log`;
    auditStatus.style.background = error ? "#fef3f2" : "#f1f5f9";
    auditStatus.style.color = error ? "#912018" : "#475569";
  }

  function showStatus(message, error) {
    status.textContent = message;
    status.style.background = error ? "#fef3f2" : "#f1f5f9";
    status.style.color = error ? "#912018" : "#475569";
  }
})();
