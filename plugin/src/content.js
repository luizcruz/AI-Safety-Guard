(function protectAIChat() {
  "use strict";

  const platform = AISafetyPlatforms.resolve(location.hostname);
  const DEFAULTS = { enabledCategories: Object.keys(AISafetyGuard.CATEGORIES), mode: AISafetyProtectionPolicy.DEFAULT_MODE, obfuscateSensitiveData: false, policies: AISafetyPolicies.normalizePolicies() };
  const SEND_SELECTOR = [...new Set([
    "button[data-testid*='send']",
    "button[type='submit']",
    "button[aria-label*='Send' i]",
    "button[aria-label*='Enviar' i]",
    "button[aria-label*='发送']",
    "[role='button'][aria-label*='Send' i]",
    "[role='button'][aria-label*='Enviar' i]",
    "[role='button'][aria-label*='发送']",
    "button[title*='Send' i]",
    "button[title*='Enviar' i]",
    "button[title*='发送']",
    ...(platform ? platform.sendSelectors : [])
  ])].join(",");
  const INPUT_SELECTOR = [...new Set([
    "textarea",
    "[contenteditable='true'][role='textbox']",
    "[contenteditable='true']",
    ...(platform ? platform.inputSelectors : [])
  ])].join(",");
  const MAX_LIVE_SCAN_CHARS = 20_000;
  const MAX_PROMPT_CHARS = 100_000;
  const NANO_TIMEOUT_MS = 45_000;
  let settings = DEFAULTS;
  let overlay = null;
  let internalSend = false;
  let heuristicBusy = false;
  let typingTimer = null;
  let unsupportedNoticeShown = false;
  const fileInputRecords = new WeakMap();
  const fileInputGates = new WeakMap();
  const releasedFileInputEvents = new WeakMap();
  const releasedTransferEvents = new WeakSet();
  const shouldEmit = AISafetyProtectionPolicy.createEmissionGate();
  const riskIndicator = createRiskIndicator();
  const attachments = new AISafetyAttachmentScanner.Registry((file) => AISafetyAttachmentScanner.scanFile(
    file, AISafetyGuard.analyze, settings, undefined, undefined, AISafetyGuard.analyzeFileName
  ));

  chrome.storage.sync.get(["enabledCategories", "knownCategories", "mode", "obfuscateSensitiveData"], (stored) => {
    const currentCategories = Object.keys(AISafetyGuard.CATEGORIES);
    const knownCategories = Array.isArray(stored.knownCategories) ? stored.knownCategories : currentCategories.filter((category) => category !== "sensitiveFileNames");
    const addedCategories = currentCategories.filter((category) => !knownCategories.includes(category));
    settings = normalizeSettings({ enabledCategories: [...new Set([...(stored.enabledCategories || currentCategories), ...addedCategories])], mode: stored.mode, obfuscateSensitiveData: stored.obfuscateSensitiveData, policies: settings.policies });
    chrome.storage.sync.set({ enabledCategories: settings.enabledCategories, knownCategories: currentCategories, mode: settings.mode, obfuscateSensitiveData: settings.obfuscateSensitiveData });
  });
  chrome.storage.local.get(["rulesCatalog", "nanoStatus", "heuristicPolicies"], ({ rulesCatalog, nanoStatus, heuristicPolicies }) => {
    if (rulesCatalog) applyRemoteCatalog(rulesCatalog);
    settings.policies = AISafetyPolicies.normalizePolicies(heuristicPolicies);
    if (nanoStatus && nanoStatus.state === "unavailable") riskIndicator.set("unsupported", AISafetyNano.UNSUPPORTED_MESSAGE);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.rulesCatalog && changes.rulesCatalog.newValue) applyRemoteCatalog(changes.rulesCatalog.newValue);
    if (area === "local" && changes.heuristicPolicies) settings.policies = AISafetyPolicies.normalizePolicies(changes.heuristicPolicies.newValue);
    if (area === "sync") {
      settings = normalizeSettings({
        enabledCategories: changes.enabledCategories ? changes.enabledCategories.newValue : settings.enabledCategories,
        mode: changes.mode ? changes.mode.newValue : settings.mode,
        obfuscateSensitiveData: changes.obfuscateSensitiveData ? changes.obfuscateSensitiveData.newValue : settings.obfuscateSensitiveData,
        policies: settings.policies
      });
      if (settings.mode === "heuristic") ensureNanoAvailable();
    }
  });

  document.addEventListener("submit", interceptSubmit, true);
  document.addEventListener("click", interceptClick, true);
  document.addEventListener("keydown", interceptEnter, true);
  document.addEventListener("input", captureFileInput, true);
  document.addEventListener("input", scanPromptInput, true);
  document.addEventListener("change", captureFileInput, true);
  document.addEventListener("drop", captureDroppedFiles, true);
  document.addEventListener("paste", capturePastedFiles, true);

  function normalizeSettings(value) {
    return {
      enabledCategories: Array.isArray(value.enabledCategories) ? value.enabledCategories : DEFAULTS.enabledCategories,
      mode: AISafetyProtectionPolicy.normalizeMode(value.mode),
      obfuscateSensitiveData: value.obfuscateSensitiveData === true,
      policies: AISafetyPolicies.normalizePolicies(value.policies)
    };
  }

  function applyRemoteCatalog(catalog) {
    try {
      const previous = new Set(settings.enabledCategories);
      const previousCategories = new Set(Object.keys(AISafetyGuard.CATEGORIES));
      AISafetyGuard.updateCatalog(catalog);
      const added = Object.keys(AISafetyGuard.CATEGORIES).filter((category) => !previousCategories.has(category));
      if (added.length) {
        settings.enabledCategories = [...new Set([...previous, ...added])];
        chrome.storage.sync.set({ enabledCategories: settings.enabledCategories, knownCategories: Object.keys(AISafetyGuard.CATEGORIES) });
      }
    } catch (error) {
      console.warn("AI Safety Guard ignorou um catálogo remoto inválido.", error);
    }
  }

  function interceptSubmit(event) {
    if (internalSend) return;
    const input = findInput(event.target);
    if (input) inspectAndBlock(event, input, { kind: "submit", target: event.target });
  }

  function interceptClick(event) {
    if (internalSend) return;
    reconcileRemovedAttachment(event);
    const button = event.target instanceof Element ? event.target.closest(SEND_SELECTOR) : null;
    if (!button) return;
    const input = findInput(button.closest("form") || button.parentElement || document);
    if (input) inspectAndBlock(event, input, { kind: "click", target: button });
  }

  function captureFileInput(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "file") return;
    const releasedTypes = releasedFileInputEvents.get(input);
    if (releasedTypes && releasedTypes.delete(event.type)) {
      if (!releasedTypes.size) releasedFileInputEvents.delete(input);
      return;
    }
    const files = Array.from(input.files || []);
    if (!files.length) return;
    blockEvent(event);
    const selectionKey = files.map(AISafetyAttachmentScanner.fingerprint).join("|");
    const currentGate = fileInputGates.get(input);
    if (currentGate && currentGate.selectionKey === selectionKey) return;
    if (currentGate) attachments.remove(currentGate.ids);
    attachments.remove(fileInputRecords.get(input));
    const ids = attachments.add(files);
    fileInputRecords.set(input, ids);
    const gate = { ids, selectionKey };
    fileInputGates.set(input, gate);
    attachments.wait(ids).then((records) => {
      if (fileInputGates.get(input) !== gate) return;
      fileInputGates.delete(input);
      if (!sameSelection(input.files, selectionKey)) {
        attachments.remove(ids);
        return;
      }
      const promptInput = findInput(input.closest("form") || document) || input;
      if (!approveAttachmentRecords(records, promptInput)) {
        input.value = "";
        attachments.remove(ids);
        fileInputRecords.delete(input);
        return;
      }
      releasedFileInputEvents.set(input, new Set(["input", "change"]));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function captureDroppedFiles(event) {
    if (releasedTransferEvents.has(event)) return;
    gateTransferEvent(event, event.dataTransfer);
  }

  function capturePastedFiles(event) {
    if (releasedTransferEvents.has(event)) return;
    gateTransferEvent(event, event.clipboardData);
  }

  function gateTransferEvent(event, transfer) {
    const files = Array.from((transfer && transfer.files) || []);
    if (!files.length) return;
    blockEvent(event);
    const ids = attachments.add(files);
    attachments.wait(ids).then((records) => {
      const promptInput = findInput(event.target && event.target.closest ? event.target.closest("form") || document : document);
      if (!approveAttachmentRecords(records, promptInput || event.target)) {
        attachments.remove(ids);
        return;
      }
      try {
        const replayTransfer = new DataTransfer();
        for (const type of Array.from(transfer.types || [])) {
          if (type !== "Files") replayTransfer.setData(type, transfer.getData(type));
        }
        for (const file of files) replayTransfer.items.add(file);
        const replay = event.type === "drop"
          ? new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: replayTransfer })
          : new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: replayTransfer });
        releasedTransferEvents.add(replay);
        event.target.dispatchEvent(replay);
      } catch (error) {
        attachments.remove(ids);
        showInspectionAlert("Anexo não pôde ser liberado", "Use o botão de anexar arquivo para realizar a análise segura.", [{ fileName: files.map((file) => file.name).join(", "), error: error.message }], promptInput || event.target);
      }
    });
  }

  function sameSelection(files, expected) {
    return Array.from(files || []).map(AISafetyAttachmentScanner.fingerprint).join("|") === expected;
  }

  function approveAttachmentRecords(records, input) {
    const errors = records.filter((record) => record.status === "error");
    if (errors.length) {
      return handleInspectionIssue(errors, input);
    }
    const detected = records.filter((record) => ["blocked", "warning"].includes(record.status));
    if (detected.length) {
      return handleDetection(resultFromRecords(detected), input);
    }
    return true;
  }

  function resultFromRecords(records) {
    const findings = records.flatMap((record) => record.scan.result.findings.map((finding) => ({ ...finding, source: record.fileName })));
    const confidence = Math.max(0, ...records.map((record) => Number(record.scan.result.confidence) || 0));
    const decision = records.some((record) => record.scan.result.decision === "block" || record.scan.result.blocked) ? "block" : "warn";
    return { decision, confidence, confidenceLevel: decision === "block" ? "high" : "medium", blocked: decision === "block", findings, categories: [...new Set(findings.map((finding) => finding.category))] };
  }

  function handleInspectionIssue(records, input, event) {
    riskIndicator.position(input);
    riskIndicator.set("risk", "Anexo não pôde ser analisado");
    const findings = [{ category: "attachmentAnalysis", label: "Falha na análise do anexo", sample: records.map((record) => record.error || "falha desconhecida").join("; "), source: records.map((record) => record.fileName).join(", ") }];
    if (["detect", "heuristic"].includes(settings.mode)) {
      if (event) blockEvent(event);
      if (settings.mode === "heuristic") recordAudit(findings, { decision: "block", confidence: 100 });
      showInspectionAlert("Anexo não pôde ser analisado", "Por segurança, remova o arquivo ou converta-o para um PDF/DOCX com texto extraível.", records, input);
      return false;
    }
    const key = `inspection:${records.map((record) => `${record.fileName}:${record.error || "pending"}`).join("|")}`;
    if (settings.mode === "warn") {
      if (shouldEmit("warn", key)) {
        showInspectionAlert("AI Safety Guard - Aviso", "O anexo não pôde ser analisado. O envio será permitido conforme o modo selecionado.", records, input);
      }
    } else {
      recordAudit(findings);
    }
    return true;
  }

  function handleDetection(result, input, event) {
    riskIndicator.position(input);
    riskIndicator.set("risk", `${result.findings.length} risco${result.findings.length === 1 ? "" : "s"} identificado${result.findings.length === 1 ? "" : "s"}`);
    const action = AISafetyProtectionPolicy.actionFor(settings.mode, result.decision);
    if (action === "block") {
      if (event) blockEvent(event);
      if (settings.mode === "heuristic") recordAudit(result.findings, { ...result, decision: "block" });
      const obfuscated = settings.obfuscateSensitiveData && ["detect", "heuristic"].includes(settings.mode)
        ? obfuscatePromptInput(input, result)
        : false;
      showAlert(result, input, obfuscated);
      return false;
    }
    if (action === "warn") showWarning(result, input);
    else recordAudit(result.findings, result);
    return true;
  }

  function reconcileRemovedAttachment(event) {
    const button = event.target instanceof Element
      ? event.target.closest("button[aria-label*='remove' i],button[aria-label*='remover' i],button[data-testid*='remove' i]")
      : null;
    if (!button) return;
    const context = button.parentElement ? button.parentElement.innerText || button.parentElement.textContent || "" : "";
    const state = attachments.state();
    for (const record of [...state.pending, ...state.errors, ...state.blocked, ...state.warnings, ...state.safe]) {
      if (context.includes(record.fileName)) attachments.removeByName(record.fileName);
    }
  }

  function interceptEnter(event) {
    if (internalSend) return;
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    const input = event.target instanceof Element ? event.target.closest(INPUT_SELECTOR) : null;
    if (input) inspectAndBlock(event, input, { kind: "enter", target: input });
  }

  function findInput(scope) {
    if (scope && scope.querySelector) {
      const local = [...scope.querySelectorAll(INPUT_SELECTOR)].find(isVisible);
      if (local) return local;
    }
    const active = document.activeElement;
    if (active && active.matches && active.matches(INPUT_SELECTOR) && isVisible(active)) return active;
    return [...document.querySelectorAll(INPUT_SELECTOR)].filter(isVisible).at(-1) || null;
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
  }

  function readInput(input) {
    return input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement
      ? input.value
      : input.innerText || input.textContent || "";
  }

  function inspectAndBlock(event, input, replay) {
    if (settings.mode === "heuristic") {
      blockEvent(event);
      inspectWithNano(input, replay);
      return true;
    }
    const attachmentState = attachments.state();
    if (attachmentState.pending.length) {
      blockEvent(event);
      showInspectionAlert("Análise de anexos em andamento", "Aguarde a análise local terminar e tente enviar novamente.", attachmentState.pending, input);
      return true;
    }
    if (attachmentState.errors.length) {
      const allowed = handleInspectionIssue(attachmentState.errors, input, event);
      if (!allowed) return true;
    }
    const attachmentDetections = [...attachmentState.blocked, ...attachmentState.warnings];
    if (attachmentDetections.length) {
      const allowed = handleDetection(resultFromRecords(attachmentDetections), input, event);
      if (!allowed) return true;
    }
    const result = analyzePrompt(readInput(input));
    if (result.decision === "allow") {
      setTimeout(() => attachments.clear(), 2000);
      return false;
    }
    const allowed = handleDetection(result, input, event);
    if (allowed) setTimeout(() => attachments.clear(), 2000);
    return !allowed;
  }

  async function inspectWithNano(input, replay) {
    if (heuristicBusy) return;
    heuristicBusy = true;
    const originalText = readInput(input);
    try {
      const attachmentState = attachments.state();
      if (attachmentState.pending.length) {
        showInspectionAlert("Análise de anexos em andamento", "Aguarde a análise local terminar e tente enviar novamente.", attachmentState.pending, input);
        return;
      }
      if (attachmentState.errors.length && !handleInspectionIssue(attachmentState.errors, input)) return;
      const attachmentDetections = [...attachmentState.blocked, ...attachmentState.warnings];
      if (attachmentDetections.length && !handleDetection(resultFromRecords(attachmentDetections), input)) return;
      const deterministic = analyzePrompt(originalText);
      if (deterministic.decision !== "allow") {
        handleDetection(deterministic, input);
        return;
      }
      riskIndicator.set("analyzing", "Gemini Nano analisando…");
      const classification = await AISafetyNano.classify(originalText, { policies: settings.policies, timeoutMs: NANO_TIMEOUT_MS });
      if (readInput(input) !== originalText) {
        riskIndicator.set("safe", "Prompt alterado — analise novamente");
        return;
      }
      const result = AISafetyNano.toDetection(classification);
      if (result.decision !== "allow") {
        riskIndicator.set("risk", `${result.findings.length} risco semântico`);
        handleDetection(result, input);
        return;
      }
      riskIndicator.set("safe", "Nenhum risco identificado");
      replaySubmission(replay, input);
    } catch (error) {
      await disableHeuristic(error);
      if (readInput(input) === originalText) replaySubmission(replay, input);
    } finally {
      heuristicBusy = false;
    }
  }

  function analyzePrompt(text) {
    if (text.length <= MAX_PROMPT_CHARS) return AISafetyGuard.analyze(text, settings);
    const finding = {
      category: "corporate",
      label: "Prompt excede o limite seguro de análise",
      family: "resource-guard",
      score: 100,
      sample: `${text.length} caracteres`
    };
    return { decision: "block", confidence: 100, confidenceLevel: "high", blocked: true, findings: [finding], categories: [finding.category] };
  }

  async function ensureNanoAvailable() {
    if (await AISafetyNano.availability() === "available") return true;
    await disableHeuristic(new Error(AISafetyNano.UNSUPPORTED_MESSAGE));
    return false;
  }

  async function disableHeuristic(error) {
    AISafetyNano.resetSession();
    settings.mode = AISafetyProtectionPolicy.DEFAULT_MODE;
    await Promise.all([
      chrome.storage.sync.set({ mode: settings.mode }),
      chrome.storage.local.set({ nanoStatus: { state: "unavailable", message: (error && error.message) || AISafetyNano.UNSUPPORTED_MESSAGE } })
    ]);
    riskIndicator.set("unsupported", AISafetyNano.UNSUPPORTED_MESSAGE);
    showUnsupportedNotice();
  }

  function replaySubmission(replay, input) {
    internalSend = true;
    try {
      if (replay && replay.kind === "click" && replay.target && replay.target.isConnected) replay.target.click();
      else if (replay && replay.kind === "submit" && replay.target && typeof replay.target.requestSubmit === "function") replay.target.requestSubmit();
      else {
        const scope = input.closest && input.closest("form");
        const button = (scope || document).querySelector(SEND_SELECTOR);
        if (button && !button.disabled) button.click();
        else if (scope && typeof scope.requestSubmit === "function") scope.requestSubmit();
      }
      setTimeout(() => attachments.clear(), 2000);
    } finally {
      setTimeout(() => { internalSend = false; }, 100);
    }
  }

  function scanPromptInput(event) {
    const input = event.target instanceof Element ? event.target.closest(INPUT_SELECTOR) : null;
    if (!input || (input instanceof HTMLInputElement && input.type === "file")) return;
    riskIndicator.position(input);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      if (!input.isConnected || document.hidden) return;
      const text = readInput(input);
      if (text.length > MAX_LIVE_SCAN_CHARS) {
        riskIndicator.set("analyzing", "Mensagem extensa — análise no envio");
        return;
      }
      const result = analyzePrompt(text);
      if (result.decision === "allow") riskIndicator.set("safe", "Nenhum risco identificado");
      else riskIndicator.set("risk", `${result.findings.length} risco${result.findings.length === 1 ? "" : "s"} identificado${result.findings.length === 1 ? "" : "s"}`);
    }, 350);
  }

  function obfuscatePromptInput(input, result) {
    if (!result.findings.some((finding) => !finding.source)) return false;
    const original = readInput(input);
    const obfuscated = AISafetyGuard.obfuscate(original, {
      enabledCategories: settings.enabledCategories,
      sensitiveTerms: result.sensitiveTerms || []
    });
    if (!obfuscated || obfuscated === original) return false;
    if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
      const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (setter) setter.call(input, obfuscated);
      else input.value = obfuscated;
    } else {
      input.textContent = obfuscated;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  function createRiskIndicator() {
    const host = document.createElement("div");
    host.id = "ai-safety-guard-indicator";
    host.style.cssText = "position:fixed!important;right:18px!important;bottom:18px!important;left:auto!important;top:auto!important;z-index:2147483647!important;display:block!important;pointer-events:auto!important;isolation:isolate!important";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = ":host{all:initial}button{display:flex;align-items:center;gap:7px;max-width:240px;border:1px solid rgba(255,255,255,.6);border-radius:999px;padding:6px 10px 6px 7px;background:#15803d;color:#fff;box-shadow:0 5px 18px rgba(15,23,42,.28);font:700 11px/1.2 system-ui,sans-serif;cursor:pointer;transition:background .18s,transform .18s}button:hover{transform:translateY(-1px)}button[data-state='risk'],button[data-state='unsupported']{background:#b91c1c}button[data-state='analyzing']{background:#6d28d9}img{width:20px;height:20px;flex:none}span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}";
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.state = "safe";
    button.title = "Abrir configurações do AI Safety Guard";
    const icon = document.createElement("img");
    icon.src = chrome.runtime.getURL("icons/ai-safety-guard-32.png");
    icon.alt = "";
    const label = document.createElement("span");
    label.textContent = "AI Safety ativo";
    button.append(icon, label);
    button.addEventListener("click", requestOptionsPage);
    shadow.append(style, button);

    const mount = () => {
      if (!host.isConnected && document.documentElement) document.documentElement.appendChild(host);
    };
    if (document.documentElement) mount();
    else document.addEventListener("DOMContentLoaded", mount, { once: true });
    let observedRoot = null;
    const rootObserver = new MutationObserver(() => {
      if (!host.isConnected) mount();
    });
    const observeRoot = () => {
      if (observedRoot === document.documentElement) return;
      rootObserver.disconnect();
      observedRoot = document.documentElement;
      if (observedRoot) rootObserver.observe(observedRoot, { childList: true });
      mount();
    };
    const documentObserver = new MutationObserver(observeRoot);
    documentObserver.observe(document, { childList: true });
    observeRoot();

    function position() {
      if (!host.isConnected) mount();
    }

    return Object.freeze({
      position,
      set(state, text) {
        button.dataset.state = state;
        label.textContent = text;
        button.setAttribute("aria-label", `AI Safety Guard: ${text}`);
      }
    });
  }

  function showUnsupportedNotice() {
    if (unsupportedNoticeShown) return;
    unsupportedNoticeShown = true;
    const notice = document.createElement("aside");
    notice.id = "ai-safety-guard-browser-notice";
    notice.setAttribute("role", "alert");
    notice.style.cssText = "position:fixed;left:18px;bottom:18px;z-index:2147483646;max-width:390px;padding:14px 16px;border-radius:12px;background:#7f1d1d;color:#fff;box-shadow:0 12px 32px rgba(0,0,0,.3);font:600 13px/1.45 system-ui,sans-serif";
    const text = document.createElement("span");
    text.textContent = `${AISafetyNano.UNSUPPORTED_MESSAGE}. O modo Detecção foi ativado.`;
    const open = document.createElement("button");
    open.type = "button";
    open.textContent = "Abrir opções";
    open.style.cssText = "display:block;margin-top:10px;border:1px solid #fecaca;border-radius:8px;padding:7px 10px;background:#fff;color:#7f1d1d;font-weight:800;cursor:pointer";
    open.addEventListener("click", requestOptionsPage);
    notice.append(text, open);
    document.documentElement.appendChild(notice);
    setTimeout(() => notice.remove(), 12_000);
  }

  function requestOptionsPage() {
    try {
      const pending = chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
      if (pending && typeof pending.catch === "function") pending.catch(() => undefined);
    } catch { /* options are also available from the toolbar icon */ }
  }

  function blockEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function showInspectionAlert(titleText, descriptionText, records, input) {
    if (overlay) overlay.remove();
    overlay = document.createElement("div");
    overlay.id = "ai-safety-guard-alert";
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.72);display:grid;place-items:center;padding:20px;font-family:system-ui,sans-serif";
    const panel = document.createElement("section");
    panel.setAttribute("role", "alertdialog");
    panel.setAttribute("aria-modal", "true");
    panel.style.cssText = "width:min(520px,100%);background:#fff;color:#172033;border-radius:16px;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.35)";
    const title = document.createElement("h2");
    title.textContent = titleText;
    title.style.cssText = "font-size:20px;margin:0 0 10px";
    const description = document.createElement("p");
    description.textContent = descriptionText;
    description.style.cssText = "font-size:14px;line-height:1.5;color:#475569";
    const list = document.createElement("ul");
    for (const record of records) {
      const item = document.createElement("li");
      item.textContent = record.error ? `${record.fileName}: ${record.error}` : record.fileName;
      list.appendChild(item);
    }
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Voltar ao prompt";
    close.style.cssText = "width:100%;border:0;border-radius:9px;padding:11px 16px;background:#b42318;color:#fff;font-weight:700;cursor:pointer";
    close.addEventListener("click", () => { overlay.remove(); overlay = null; input.focus(); });
    panel.append(title, description, list, close);
    overlay.appendChild(panel);
    document.documentElement.appendChild(overlay);
    close.focus();
  }

  function showAlert(result, input, obfuscated = false) {
    riskIndicator.position(input);
    riskIndicator.set("risk", `${result.findings.length} risco${result.findings.length === 1 ? "" : "s"} — envio bloqueado`);
    showDetectionDialog(result, input, {
      title: "AI Safety Guard - Envio bloqueado",
      description: obfuscated
        ? "Os dados localizáveis foram ofuscados no prompt. Revise a mensagem antes de tentar novamente."
        : "Possível dado sensível detectado. Remova ou anonimize os dados abaixo antes de tentar novamente.",
      button: "Revisar mensagem",
      color: "#b42318"
    });
  }

  function showWarning(result, input) {
    const key = detectionKey(result.findings);
    if (!shouldEmit("warn", key)) return;
    riskIndicator.position(input);
    riskIndicator.set("risk", `${result.findings.length} risco${result.findings.length === 1 ? "" : "s"} identificado${result.findings.length === 1 ? "" : "s"}`);
    showDetectionDialog(result, input, {
      title: "AI Safety Guard - Aviso",
      description: "Possível dado sensível detectado. O envio será permitido conforme o modo selecionado.",
      button: "Entendi",
      color: "#b54708"
    });
  }

  function recordAudit(findings, result = {}) {
    const key = detectionKey(findings);
    if (!shouldEmit("log", key)) return;
    const now = Date.now();
    const message = {
      type: "RECORD_DETECTION",
      entry: {
        timestamp: new Date(now).toISOString(),
        ai: currentAI(),
        mode: settings.mode,
        confidence: Number(result.confidence) || Math.max(0, ...findings.map((finding) => Number(finding.score) || 0)),
        decision: result.decision || "warn",
        policyIds: Array.isArray(result.policyIds) ? result.policyIds : [],
        policies: Array.isArray(result.policyIds) ? result.policyIds.map((id) => settings.policies.find((policy) => policy.id === id)?.name).filter(Boolean) : [],
        findings: findings.map((finding) => ({
          category: AISafetyGuard.CATEGORIES[finding.category] || finding.category,
          label: finding.label,
          sample: finding.sample,
          source: finding.source || "prompt"
        }))
      }
    };
    try {
      const pending = chrome.runtime.sendMessage(message);
      if (pending && typeof pending.catch === "function") pending.catch(() => undefined);
    } catch { /* logging must not interrupt the host page */ }
  }

  function detectionKey(findings) {
    return findings.map((finding) => [finding.category, finding.label, finding.sample, finding.source || "prompt"].join(":"))
      .sort().join("|");
  }

  function currentAI() {
    return platform ? platform.name : location.hostname;
  }

  function showDetectionDialog(result, input, options) {
    if (overlay) overlay.remove();
    overlay = document.createElement("div");
    overlay.id = "ai-safety-guard-alert";
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.72);display:grid;place-items:center;padding:20px;font-family:system-ui,sans-serif";
    const panel = document.createElement("section");
    panel.setAttribute("role", "alertdialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "ai-dlp-title");
    panel.style.cssText = "width:min(520px,100%);max-height:80vh;overflow:auto;background:#fff;color:#172033;border-radius:16px;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.35)";

    const title = document.createElement("h2");
    title.id = "ai-dlp-title";
    title.textContent = options.title;
    title.style.cssText = "font-size:20px;margin:0 0 10px";
    const description = document.createElement("p");
    const confidence = Number.isFinite(result.confidence) ? ` Confiança ${result.confidenceLevel === "high" ? "alta" : "média"}: ${result.confidence}/100.` : "";
    description.textContent = `${options.description}${confidence}`;
    description.style.cssText = "font-size:14px;line-height:1.5;margin:0 0 16px;color:#475569";
    const categoryWarning = document.createElement("p");
    const categoryNames = result.categories.map((category) => AISafetyGuard.CATEGORIES[category] || category);
    categoryWarning.textContent = `Possível infração nas categorias: ${categoryNames.join(", ")}.`;
    categoryWarning.style.cssText = "font-size:14px;line-height:1.5;margin:0 0 16px;padding:12px;border-radius:9px;background:#fef3f2;color:#912018;font-weight:700";
    const list = document.createElement("ul");
    list.style.cssText = "margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.7";
    result.findings.forEach((finding) => {
      const item = document.createElement("li");
      item.textContent = `${AISafetyGuard.CATEGORIES[finding.category] || finding.category} — ${finding.label} (${finding.sample})${finding.source ? ` — anexo: ${finding.source}` : ""}`;
      list.appendChild(item);
    });
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = options.button;
    close.style.cssText = `width:100%;border:0;border-radius:9px;padding:11px 16px;background:${options.color};color:#fff;font-weight:700;cursor:pointer`;
    close.addEventListener("click", () => {
      overlay.remove();
      overlay = null;
      input.focus();
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close.click();
    });
    panel.append(title, description, categoryWarning, list, close);
    overlay.appendChild(panel);
    document.documentElement.appendChild(overlay);
    close.focus();
  }
})();
