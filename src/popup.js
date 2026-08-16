(function configurePopup() {
  "use strict";
  const enabled = document.querySelector("#enabled");
  const container = document.querySelector("#categories");
  const apiForm = document.querySelector("#api-settings");
  const apiUrl = document.querySelector("#api-url");
  const apiToken = document.querySelector("#api-token");
  const status = document.querySelector("#rules-status");
  const categoryInputs = new Map();

  initialize().catch((error) => showStatus(error.message, true));

  async function initialize() {
    const remote = await chrome.storage.local.get({ apiUrl: "http://127.0.0.1:8000", apiToken: "", rulesVersion: "1.1.0", rulesCatalog: null, rulesLastError: "" });
    if (remote.rulesCatalog) {
      try { AISafetyGuard.updateCatalog(remote.rulesCatalog); } catch { /* bundled catalog remains active */ }
    }
    renderCategories();
    const settings = await chrome.storage.sync.get({ enabled: true, enabledCategories: Object.keys(AISafetyGuard.CATEGORIES) });
    enabled.checked = settings.enabled !== false;
    for (const [key, input] of categoryInputs) input.checked = settings.enabledCategories.includes(key);
    apiUrl.value = remote.apiUrl;
    apiToken.value = remote.apiToken;
    showStatus(remote.rulesLastError ? `Falha: ${remote.rulesLastError}` : `Regras ativas: v${remote.rulesVersion}`, Boolean(remote.rulesLastError));
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
  function saveProtection() {
    chrome.storage.sync.set({
      enabled: enabled.checked,
      enabledCategories: [...categoryInputs].filter(([, input]) => input.checked).map(([key]) => key)
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
      const state = await chrome.storage.local.get({ rulesVersion: "1.1.0" });
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
