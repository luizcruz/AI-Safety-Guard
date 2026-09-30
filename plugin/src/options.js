(function configureOptions() {
  "use strict";

  const DEFAULT_API_URL = "http://127.0.0.1:8000";
  const tabs = [...document.querySelectorAll("[role='tab'][data-tab]")];
  const panels = [...document.querySelectorAll("[role='tabpanel'][data-panel]")];
  const container = document.querySelector("#categories");
  const apiForm = document.querySelector("#api-settings");
  const apiUrl = document.querySelector("#api-url");
  const apiToken = document.querySelector("#api-token");
  const rulesStatus = document.querySelector("#rules-status");
  const auditStatus = document.querySelector("#audit-status");
  const auditPreview = document.querySelector("#audit-log-preview");
  const downloadAudit = document.querySelector("#download-audit");
  const saveStatus = document.querySelector("#save-status");
  const rulesSaveStatus = document.querySelector("#rules-save-status");
  const nanoState = document.querySelector("#nano-state");
  const nanoMessage = document.querySelector("#nano-message");
  const nanoProgress = document.querySelector("#nano-progress");
  const installNano = document.querySelector("#install-nano");
  const nanoModeLabel = document.querySelector("#nano-mode-label");
  const nanoTestForm = document.querySelector("#nano-test-form");
  const nanoTestInput = document.querySelector("#nano-test-input");
  const nanoTestButton = document.querySelector("#run-nano-test");
  const nanoTestResult = document.querySelector("#nano-test-result");
  const heuristicInput = document.querySelector("input[value='heuristic']");
  const obfuscationInput = document.querySelector("#obfuscate-sensitive-data");
  const modeInputs = [...document.querySelectorAll("input[name='protection-mode']")];
  const categoryInputs = new Map();
  let nanoAvailable = false;

  initializeTabs();
  initialize().catch((error) => {
    showSaveStatus(error.message, true);
    showRulesStatus(error.message, true);
  });

  function initializeTabs() {
    const requested = location.hash.replace(/^#/, "");
    activateTab(tabs.some((tab) => tab.dataset.tab === requested) ? requested : "protection");
    for (const [index, tab] of tabs.entries()) {
      tab.addEventListener("click", () => activateTab(tab.dataset.tab, true));
      tab.addEventListener("keydown", (event) => {
        let next = index;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        else return;
        event.preventDefault();
        activateTab(tabs[next].dataset.tab, true);
      });
    }
  }

  function activateTab(name, focus = false) {
    for (const tab of tabs) {
      const active = tab.dataset.tab === name;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    }
    for (const panel of panels) panel.hidden = panel.dataset.panel !== name;
    history.replaceState(null, "", `#${name}`);
  }

  async function initialize() {
    const remote = await chrome.storage.local.get({
      apiUrl: DEFAULT_API_URL,
      apiToken: "",
      rulesVersion: AISafetyGuard.version,
      rulesCatalog: null,
      rulesLastError: "",
      auditLog: []
    });
    if (remote.rulesCatalog) {
      try { AISafetyGuard.updateCatalog(remote.rulesCatalog); } catch { /* keep bundled catalog */ }
    }
    renderCategories();
    const settings = await chrome.storage.sync.get({
      enabledCategories: Object.keys(AISafetyGuard.CATEGORIES),
      knownCategories: [],
      mode: AISafetyProtectionPolicy.DEFAULT_MODE,
      obfuscateSensitiveData: false
    });
    const currentCategories = Object.keys(AISafetyGuard.CATEGORIES);
    const knownCategories = settings.knownCategories.length ? settings.knownCategories : currentCategories.filter((category) => category !== "sensitiveFileNames");
    const addedCategories = currentCategories.filter((category) => !knownCategories.includes(category));
    settings.enabledCategories = [...new Set([...(settings.enabledCategories || currentCategories), ...addedCategories])];
    settings.mode = AISafetyProtectionPolicy.normalizeMode(settings.mode);
    settings.obfuscateSensitiveData = settings.obfuscateSensitiveData === true;
    await chrome.storage.sync.set({ enabledCategories: settings.enabledCategories, knownCategories: currentCategories, mode: settings.mode, obfuscateSensitiveData: settings.obfuscateSensitiveData });
    for (const [key, input] of categoryInputs) input.checked = settings.enabledCategories.includes(key);
    (modeInputs.find((input) => input.value === settings.mode) || modeInputs.find((input) => input.value === AISafetyProtectionPolicy.DEFAULT_MODE)).checked = true;
    obfuscationInput.checked = settings.obfuscateSensitiveData;
    updateObfuscationAvailability(settings.mode);
    apiUrl.value = remote.apiUrl;
    apiToken.value = remote.apiToken;
    showRulesStatus(remote.rulesLastError ? `Falha: ${remote.rulesLastError}` : `Regras ativas: v${remote.rulesVersion}`, Boolean(remote.rulesLastError));
    showAuditStatus(remote.auditLog);
    await refreshNanoStatus();
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

  async function refreshNanoStatus() {
    const state = await AISafetyNano.availability();
    if (state === "available") {
      try {
        await AISafetyNano.install();
        return setNanoReady();
      } catch (error) {
        return setNanoUnavailable(error.message);
      }
    }
    if (state === "downloadable" || state === "downloading") {
      nanoAvailable = false;
      heuristicInput.disabled = true;
      nanoTestButton.disabled = true;
      nanoState.textContent = state === "downloading" ? "Baixando" : "Instalação pendente";
      nanoMessage.textContent = "O modelo local precisa ser instalado para habilitar testes e o modo Heurística.";
      nanoMessage.className = "notice";
      nanoModeLabel.textContent = "Modelo pendente";
      installNano.hidden = false;
      installNano.textContent = state === "downloading" ? "Continuar instalação" : "Instalar Gemini Nano";
      await chrome.storage.local.set({ nanoStatus: { state, message: nanoMessage.textContent } });
      return enforceFallback();
    }
    return setNanoUnavailable(AISafetyNano.UNSUPPORTED_MESSAGE);
  }

  async function setNanoReady() {
    nanoAvailable = true;
    heuristicInput.disabled = false;
    nanoTestButton.disabled = false;
    nanoState.textContent = "Disponível";
    nanoMessage.textContent = "Gemini Nano instalado e pronto para análise semântica local.";
    nanoMessage.className = "notice success";
    nanoModeLabel.textContent = "Pronto";
    nanoProgress.hidden = true;
    installNano.hidden = true;
    await chrome.storage.local.set({ nanoStatus: { state: "available", message: nanoMessage.textContent } });
  }

  async function setNanoUnavailable(message) {
    nanoAvailable = false;
    heuristicInput.disabled = true;
    nanoTestButton.disabled = true;
    nanoState.textContent = "Indisponível";
    nanoMessage.textContent = AISafetyNano.UNSUPPORTED_MESSAGE;
    nanoMessage.className = "notice error";
    nanoModeLabel.textContent = "Não suportado";
    nanoProgress.hidden = true;
    installNano.hidden = false;
    installNano.textContent = "Verificar novamente";
    await chrome.storage.local.set({ nanoStatus: { state: "unavailable", message: message || AISafetyNano.UNSUPPORTED_MESSAGE } });
    await enforceFallback();
  }

  async function enforceFallback() {
    const { mode } = await chrome.storage.sync.get({ mode: AISafetyProtectionPolicy.DEFAULT_MODE });
    const safeMode = AISafetyProtectionPolicy.enforceNanoAvailability(mode, nanoAvailable);
    if (safeMode !== mode) {
      await chrome.storage.sync.set({ mode: safeMode });
      const fallback = modeInputs.find((input) => input.value === safeMode);
      if (fallback) fallback.checked = true;
      updateObfuscationAvailability(safeMode);
      showSaveStatus("Heurística desativada; Detecção ativada.", true);
    }
  }

  installNano.addEventListener("click", async () => {
    installNano.disabled = true;
    nanoProgress.hidden = false;
    nanoProgress.value = 0;
    nanoState.textContent = "Instalando";
    nanoMessage.textContent = "Baixando e preparando o modelo local. Mantenha o Chrome aberto.";
    nanoMessage.className = "notice";
    try {
      await AISafetyNano.install({ onProgress: (value) => { nanoProgress.value = value; } });
      await setNanoReady();
      heuristicInput.checked = true;
      await saveProtection();
    } catch (error) {
      await setNanoUnavailable(error.message);
    } finally {
      installNano.disabled = false;
    }
  });

  nanoTestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!nanoAvailable) return showNanoTestResult(AISafetyNano.UNSUPPORTED_MESSAGE, true);
    const message = nanoTestInput.value.trim();
    if (!message) return showNanoTestResult("Digite uma mensagem para testar.", true);
    nanoTestButton.disabled = true;
    showNanoTestResult("Analisando localmente…", false);
    try {
      const classification = await AISafetyNano.classify(message);
      const detection = AISafetyNano.toDetection(classification);
      const category = AISafetyGuard.CATEGORIES[classification.category] || classification.category;
      const severity = { low: "baixo", medium: "médio", high: "alto", critical: "crítico" }[classification.severity] || "médio";
      if (detection.decision === "allow") showNanoTestResult("Risco baixo — nenhuma exposição sensível identificada.", false, true);
      else showNanoTestResult(`Risco ${severity}: ${detection.confidence}/100 — ${category}. ${classification.reason}`, true);
    } catch (error) {
      showNanoTestResult(`Falha no teste local: ${error.message}`, true);
    } finally {
      nanoTestButton.disabled = !nanoAvailable;
    }
  });

  function showNanoTestResult(message, risk, safe = false) {
    nanoTestResult.textContent = message;
    nanoTestResult.className = safe ? "notice success" : risk ? "notice error" : "notice";
  }

  for (const input of modeInputs) input.addEventListener("change", saveProtection);
  obfuscationInput.addEventListener("change", saveProtection);

  async function saveProtection() {
    const selected = modeInputs.find((input) => input.checked)?.value;
    const mode = AISafetyProtectionPolicy.enforceNanoAvailability(selected, nanoAvailable);
    if (selected === "heuristic" && mode !== selected) {
      const fallback = modeInputs.find((input) => input.value === mode);
      if (fallback) fallback.checked = true;
      showSaveStatus(AISafetyNano.UNSUPPORTED_MESSAGE, true);
    }
    await chrome.storage.sync.set({
      enabledCategories: [...categoryInputs].filter(([, input]) => input.checked).map(([key]) => key),
      mode,
      obfuscateSensitiveData: obfuscationInput.checked
    });
    updateObfuscationAvailability(mode);
    showSaveStatus("Configuração salva", false);
  }

  function updateObfuscationAvailability(mode) {
    obfuscationInput.disabled = !["detect", "heuristic"].includes(mode);
  }

  function showSaveStatus(message, error) {
    for (const indicator of [saveStatus, rulesSaveStatus]) {
      indicator.textContent = message;
      indicator.style.background = error ? "#fef2f2" : "#f0fdf4";
      indicator.style.color = error ? "#991b1b" : "#166534";
    }
  }

  downloadAudit.addEventListener("click", async () => {
    try {
      const { auditLog } = await chrome.storage.local.get({ auditLog: [] });
      if (!AISafetyAuditLog.download(auditLog)) return showAuditStatus([]);
      showAuditStatus(auditLog, "Log baixado. ");
    } catch (error) {
      auditStatus.textContent = `Falha ao baixar o log: ${error.message}`;
      auditStatus.className = "notice error";
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.auditLog) showAuditStatus(changes.auditLog.newValue);
  });

  function showAuditStatus(auditLog, prefix = "") {
    const entries = Array.isArray(auditLog) ? auditLog : [];
    const count = entries.length;
    auditStatus.textContent = count ? `${prefix}${count} registro${count === 1 ? "" : "s"} armazenado${count === 1 ? "" : "s"}.` : "Nenhum registro disponível.";
    auditStatus.className = "notice";
    auditPreview.value = AISafetyAuditLog.serialize(entries);
    downloadAudit.disabled = count === 0;
  }

  apiForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const url = new URL(apiUrl.value);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Protocolo da API inválido");
      const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
      if (url.protocol !== "https:" && !local) throw new Error("APIs remotas devem usar HTTPS");
      const granted = await chrome.permissions.request({ origins: [`${url.origin}/*`] });
      if (!granted) return showRulesStatus("Permissão de acesso à API negada.", true);
      await chrome.storage.local.set({ apiUrl: url.origin, apiToken: apiToken.value.trim() });
      showRulesStatus("Consultando regras mais recentes…", false);
      const response = await chrome.runtime.sendMessage({ type: "REFRESH_RULES" });
      if (!response || !response.ok) return showRulesStatus(`Falha: ${response ? response.error : "serviço indisponível"}`, true);
      const state = await chrome.storage.local.get({ rulesVersion: AISafetyGuard.version });
      showRulesStatus(`Regras ativas: v${state.rulesVersion}`, false);
    } catch (error) {
      showRulesStatus(error.message, true);
    }
  });

  function showRulesStatus(message, error) {
    rulesStatus.textContent = message;
    rulesStatus.className = error ? "notice error" : "notice";
  }
})();
