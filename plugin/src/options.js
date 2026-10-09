(function configureOptions() {
  "use strict";

  const DEFAULT_API_URL = "http://127.0.0.1:8000";
  const tabs = [...document.querySelectorAll("[role='tab'][data-tab]")];
  const panels = [...document.querySelectorAll("[role='tabpanel'][data-panel]")];
  const mcpPlatformTabs = [...document.querySelectorAll("[role='tab'][data-mcp-platform]")];
  const mcpPlatformPanels = [...document.querySelectorAll("[role='tabpanel'][data-mcp-platform-panel]")];
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
  const policyStatus = document.querySelector("#policy-status");
  const restoreDefaultPolicies = document.querySelector("#restore-default-policies");
  const policiesList = document.querySelector("#policies-list");
  const policyForm = document.querySelector("#policy-form");
  const policyFormTitle = document.querySelector("#policy-form-title");
  const savePolicy = document.querySelector("#save-policy");
  const cancelPolicyEdit = document.querySelector("#cancel-policy-edit");
  const policyName = document.querySelector("#policy-name");
  const policyCategory = document.querySelector("#policy-category");
  const policySeverity = document.querySelector("#policy-severity");
  const policyDescription = document.querySelector("#policy-description");
  const policyTerms = document.querySelector("#policy-terms");
  const policyContext = document.querySelector("#policy-context");
  const policyExceptions = document.querySelector("#policy-exceptions");
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
  const mcpEnabledInput = document.querySelector("#mcp-enabled");
  const mcpStatus = document.querySelector("#mcp-status");
  const downloadMcpConfig = document.querySelector("#download-mcp-config");
  const mcpDownloadStatus = document.querySelector("#mcp-download-status");
  const modeInputs = [...document.querySelectorAll("input[name='protection-mode']")];
  const categoryInputs = new Map();
  let nanoAvailable = false;
  let heuristicPolicies = AISafetyPolicies.normalizePolicies();
  let deletedDefaultPolicyIds = new Set();
  let editingPolicyId = null;
  let defaultPoliciesChanged = false;

  initializeTabs();
  initializeMcpPlatformTabs();
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

  function initializeMcpPlatformTabs() {
    activateMcpPlatform("windows");
    for (const [index, tab] of mcpPlatformTabs.entries()) {
      tab.addEventListener("click", () => activateMcpPlatform(tab.dataset.mcpPlatform, true));
      tab.addEventListener("keydown", (event) => {
        let next = index;
        if (event.key === "ArrowRight") next = (index + 1) % mcpPlatformTabs.length;
        else if (event.key === "ArrowLeft") next = (index - 1 + mcpPlatformTabs.length) % mcpPlatformTabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = mcpPlatformTabs.length - 1;
        else return;
        event.preventDefault();
        activateMcpPlatform(mcpPlatformTabs[next].dataset.mcpPlatform, true);
      });
    }
  }

  function activateMcpPlatform(name, focus = false) {
    for (const tab of mcpPlatformTabs) {
      const active = tab.dataset.mcpPlatform === name;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    }
    for (const panel of mcpPlatformPanels) panel.hidden = panel.dataset.mcpPlatformPanel !== name;
  }

  async function initialize() {
    const remote = await chrome.storage.local.get({
      apiUrl: DEFAULT_API_URL,
      apiToken: "",
      rulesVersion: AISafetyGuard.version,
      rulesCatalog: null,
      rulesLastError: "",
      auditLog: [],
      heuristicPolicies: null
    });
    if (remote.rulesCatalog) {
      try { AISafetyGuard.updateCatalog(remote.rulesCatalog); } catch { /* keep bundled catalog */ }
    }
    renderCategories();
    renderPolicyCategories();
    loadPolicyState(remote.heuristicPolicies);
    renderPolicies();
    const settings = await chrome.storage.sync.get({
      enabledCategories: Object.keys(AISafetyGuard.CATEGORIES),
      knownCategories: [],
      mode: AISafetyProtectionPolicy.DEFAULT_MODE,
      obfuscateSensitiveData: false,
      mcpEnabled: true
    });
    const currentCategories = Object.keys(AISafetyGuard.CATEGORIES);
    const knownCategories = settings.knownCategories.length ? settings.knownCategories : currentCategories.filter((category) => category !== "sensitiveFileNames");
    const addedCategories = currentCategories.filter((category) => !knownCategories.includes(category));
    settings.enabledCategories = [...new Set([...(settings.enabledCategories || currentCategories), ...addedCategories])];
    settings.mode = AISafetyProtectionPolicy.normalizeMode(settings.mode);
    settings.obfuscateSensitiveData = settings.obfuscateSensitiveData === true;
    settings.mcpEnabled = settings.mcpEnabled !== false;
    await chrome.storage.sync.set({ enabledCategories: settings.enabledCategories, knownCategories: currentCategories, mode: settings.mode, obfuscateSensitiveData: settings.obfuscateSensitiveData, mcpEnabled: settings.mcpEnabled });
    for (const [key, input] of categoryInputs) input.checked = settings.enabledCategories.includes(key);
    (modeInputs.find((input) => input.value === settings.mode) || modeInputs.find((input) => input.value === AISafetyProtectionPolicy.DEFAULT_MODE)).checked = true;
    obfuscationInput.checked = settings.obfuscateSensitiveData;
    mcpEnabledInput.checked = settings.mcpEnabled;
    showMcpStatus(settings.mcpEnabled);
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
      return setNanoReady();
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
      const classification = await AISafetyNano.classify(message, { policies: heuristicPolicies });
      const detection = AISafetyNano.toDetection(classification);
      const category = AISafetyGuard.CATEGORIES[classification.category] || classification.category;
      const severity = { low: "baixo", medium: "médio", high: "alto", critical: "crítico" }[classification.severity] || "médio";
      const matchedPolicies = classification.policyIds.map((id) => heuristicPolicies.find((item) => item.id === id)?.name).filter(Boolean);
      const policySummary = matchedPolicies.length ? ` Políticas: ${matchedPolicies.join(", ")}.` : "";
      if (detection.decision === "allow") showNanoTestResult("Risco baixo — nenhuma exposição sensível identificada.", false, true);
      else showNanoTestResult(`Risco ${severity}: ${detection.confidence}/100 — ${category}. ${classification.reason}${policySummary}`, true);
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
  mcpEnabledInput.addEventListener("change", async () => {
    const enabled = mcpEnabledInput.checked;
    mcpEnabledInput.disabled = true;
    try {
      await chrome.storage.sync.set({ mcpEnabled: enabled });
      showMcpStatus(enabled);
    } catch (error) {
      mcpEnabledInput.checked = !enabled;
      showMcpStatus(!enabled, `Falha: ${error.message}`);
    } finally {
      mcpEnabledInput.disabled = false;
    }
  });

  function showMcpStatus(enabled, message = "") {
    mcpStatus.textContent = message || (enabled ? "Habilitado" : "Desabilitado");
    mcpStatus.style.background = message ? "#fef2f2" : enabled ? "#f0fdf4" : "#f1f5f9";
    mcpStatus.style.color = message ? "#991b1b" : enabled ? "#166534" : "#475569";
  }

  downloadMcpConfig.addEventListener("click", async () => {
    downloadMcpConfig.disabled = true;
    try {
      const [syncSettings, localSettings] = await Promise.all([
        chrome.storage.sync.get({ enabledCategories: Object.keys(AISafetyGuard.CATEGORIES) }),
        chrome.storage.local.get({ heuristicPolicies: null })
      ]);
      const policies = localSettings.heuristicPolicies || AISafetyPolicies.serializePolicies(heuristicPolicies, [...deletedDefaultPolicyIds]);
      downloadJson("config.json", { mode: "heuristic", enabledCategories: syncSettings.enabledCategories, policies });
      mcpDownloadStatus.textContent = "Configuração baixada.";
    } catch (error) {
      mcpDownloadStatus.textContent = `Falha: ${error.message}`;
    } finally {
      downloadMcpConfig.disabled = false;
    }
  });

  function downloadJson(name, value) {
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

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

  function renderPolicyCategories() {
    policyCategory.replaceChildren();
    for (const category of AISafetyPolicies.CATEGORIES) {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = AISafetyGuard.CATEGORIES[category] || category;
      policyCategory.appendChild(option);
    }
  }

  function renderPolicies() {
    policiesList.replaceChildren();
    for (const item of heuristicPolicies) {
      const card = document.createElement("article");
      card.className = `policy-item${editingPolicyId === item.id ? " editing" : ""}`;
      const enabled = document.createElement("input");
      enabled.type = "checkbox";
      enabled.checked = item.enabled;
      enabled.setAttribute("aria-label", `Ativar política ${item.name}`);
      enabled.addEventListener("change", async () => {
        heuristicPolicies = heuristicPolicies.map((policy) => policy.id === item.id ? { ...policy, enabled: enabled.checked } : policy);
        await persistPolicies();
      });
      const body = document.createElement("div");
      body.className = "policy-body";
      body.tabIndex = 0;
      body.setAttribute("role", "button");
      body.setAttribute("aria-label", `Editar política ${item.name}`);
      body.addEventListener("click", () => beginPolicyEdit(item));
      body.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        beginPolicyEdit(item);
      });
      const title = document.createElement("h3");
      title.textContent = item.name;
      const description = document.createElement("p");
      description.textContent = item.description;
      const indicators = document.createElement("p");
      indicators.textContent = `Indicadores: ${item.terms.join(", ")}`;
      const nuance = document.createElement("p");
      const context = item.contextTerms.length ? item.contextTerms.join(", ") : "qualquer contexto";
      const exceptions = item.exceptions.length ? item.exceptions.join(", ") : "nenhuma";
      nuance.textContent = `Contexto: ${context}. Exceções: ${exceptions}.`;
      const meta = document.createElement("div");
      meta.className = "policy-meta";
      for (const value of [AISafetyGuard.CATEGORIES[item.category] || item.category, `Severidade ${item.severity}`, item.builtIn ? "Padrão" : "Personalizada"]) {
        const badge = document.createElement("span");
        badge.textContent = value;
        meta.appendChild(badge);
      }
      body.append(title, description, indicators, nuance, meta);
      card.append(enabled, body);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-policy";
      remove.textContent = "Excluir";
      remove.setAttribute("aria-label", `Excluir política ${item.name}`);
      remove.addEventListener("click", async () => {
        if (item.builtIn) deletedDefaultPolicyIds.add(item.id);
        heuristicPolicies = heuristicPolicies.filter((policy) => policy.id !== item.id);
        if (editingPolicyId === item.id) resetPolicyForm();
        await persistPolicies();
        renderPolicies();
      });
      card.appendChild(remove);
      policiesList.appendChild(card);
    }
    showPolicyStatus();
  }

  policyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const slug = policyName.value.toLocaleLowerCase("pt-BR").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const current = editingPolicyId ? heuristicPolicies.find((item) => item.id === editingPolicyId) : null;
      const value = {
        id: current ? current.id : `custom-${slug}-${Date.now().toString(36)}`,
        name: policyName.value,
        category: policyCategory.value,
        severity: policySeverity.value,
        description: policyDescription.value,
        terms: policyTerms.value,
        contextTerms: policyContext.value,
        exceptions: policyExceptions.value,
        enabled: current ? current.enabled : true,
        builtIn: current ? current.builtIn : false
      };
      heuristicPolicies = current
        ? heuristicPolicies.map((item) => item.id === current.id ? value : item)
        : AISafetyPolicies.addPolicy(heuristicPolicies, value);
      await persistPolicies();
      resetPolicyForm();
      renderPolicies();
    } catch (error) {
      showPolicyStatus(error.message, true);
    }
  });

  async function persistPolicies() {
    const storedPolicies = AISafetyPolicies.serializePolicies(heuristicPolicies, [...deletedDefaultPolicyIds]);
    heuristicPolicies = AISafetyPolicies.normalizePolicies(storedPolicies);
    defaultPoliciesChanged = AISafetyPolicies.hasBuiltInPolicyChanges(storedPolicies);
    await chrome.storage.local.set({ heuristicPolicies: storedPolicies });
    showPolicyStatus("Políticas salvas");
  }

  restoreDefaultPolicies.addEventListener("click", async () => {
    deletedDefaultPolicyIds.clear();
    heuristicPolicies = AISafetyPolicies.normalizePolicies(heuristicPolicies.filter((item) => !item.builtIn));
    resetPolicyForm();
    await persistPolicies();
    renderPolicies();
    showPolicyStatus("Políticas iniciais restauradas");
  });

  function loadPolicyState(storedPolicies) {
    deletedDefaultPolicyIds = new Set(AISafetyPolicies.getDeletedBuiltInPolicyIds(storedPolicies));
    defaultPoliciesChanged = AISafetyPolicies.hasBuiltInPolicyChanges(storedPolicies);
    heuristicPolicies = AISafetyPolicies.normalizePolicies(storedPolicies);
    if (editingPolicyId && !heuristicPolicies.some((item) => item.id === editingPolicyId)) resetPolicyForm();
  }

  function beginPolicyEdit(item) {
    editingPolicyId = item.id;
    policyName.value = item.name;
    policyCategory.value = item.category;
    policySeverity.value = item.severity;
    policyDescription.value = item.description;
    policyTerms.value = item.terms.join(", ");
    policyContext.value = item.contextTerms.join(", ");
    policyExceptions.value = item.exceptions.join(", ");
    policyFormTitle.textContent = `Editar política: ${item.name}`;
    savePolicy.textContent = "Salvar alterações";
    cancelPolicyEdit.hidden = false;
    renderPolicies();
    policyForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetPolicyForm() {
    editingPolicyId = null;
    policyForm.reset();
    policySeverity.value = "high";
    policyFormTitle.textContent = "Adicionar política";
    savePolicy.textContent = "Adicionar política";
    cancelPolicyEdit.hidden = true;
  }

  cancelPolicyEdit.addEventListener("click", () => {
    resetPolicyForm();
    renderPolicies();
  });

  function showPolicyStatus(message, error = false) {
    const active = heuristicPolicies.filter((item) => item.enabled).length;
    policyStatus.textContent = message || `${active}/${heuristicPolicies.length} ativas`;
    policyStatus.style.background = error ? "#fef2f2" : "#f0fdf4";
    policyStatus.style.color = error ? "#991b1b" : "#166534";
    restoreDefaultPolicies.disabled = !defaultPoliciesChanged && deletedDefaultPolicyIds.size === 0;
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
    if (areaName === "local" && changes.heuristicPolicies) {
      loadPolicyState(changes.heuristicPolicies.newValue);
      renderPolicies();
    }
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
