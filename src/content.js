(function protectAIChat() {
  "use strict";

  const DEFAULTS = { enabled: true, enabledCategories: Object.keys(AISafetyGuard.CATEGORIES) };
  const SEND_SELECTOR = [
    "button[data-testid*='send']",
    "button[aria-label*='Send' i]",
    "button[aria-label*='Enviar' i]",
    "button[title*='Send' i]",
    "button[title*='Enviar' i]"
  ].join(",");
  const INPUT_SELECTOR = "textarea, [contenteditable='true'][role='textbox'], [contenteditable='true']";
  let settings = DEFAULTS;
  let overlay = null;
  const fileInputRecords = new WeakMap();
  const fileInputGates = new WeakMap();
  const releasedFileInputEvents = new WeakMap();
  const releasedTransferEvents = new WeakSet();
  const attachments = new AISafetyAttachmentScanner.Registry((file) => AISafetyAttachmentScanner.scanFile(
    file, AISafetyGuard.analyze, settings, undefined, undefined, AISafetyGuard.analyzeFileName
  ));

  chrome.storage.sync.get(["enabled", "enabledCategories", "knownCategories"], (stored) => {
    const currentCategories = Object.keys(AISafetyGuard.CATEGORIES);
    const knownCategories = Array.isArray(stored.knownCategories) ? stored.knownCategories : currentCategories.filter((category) => category !== "sensitiveFileNames");
    const addedCategories = currentCategories.filter((category) => !knownCategories.includes(category));
    settings = normalizeSettings({ enabled: stored.enabled, enabledCategories: [...new Set([...(stored.enabledCategories || currentCategories), ...addedCategories])] });
    chrome.storage.sync.set({ enabledCategories: settings.enabledCategories, knownCategories: currentCategories });
  });
  chrome.storage.local.get("rulesCatalog", ({ rulesCatalog }) => {
    if (rulesCatalog) applyRemoteCatalog(rulesCatalog);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.rulesCatalog && changes.rulesCatalog.newValue) applyRemoteCatalog(changes.rulesCatalog.newValue);
    if (area === "sync") {
      settings = normalizeSettings({
        enabled: changes.enabled ? changes.enabled.newValue : settings.enabled,
        enabledCategories: changes.enabledCategories ? changes.enabledCategories.newValue : settings.enabledCategories
      });
    }
  });

  document.addEventListener("submit", interceptSubmit, true);
  document.addEventListener("click", interceptClick, true);
  document.addEventListener("keydown", interceptEnter, true);
  document.addEventListener("input", captureFileInput, true);
  document.addEventListener("change", captureFileInput, true);
  document.addEventListener("drop", captureDroppedFiles, true);
  document.addEventListener("paste", capturePastedFiles, true);

  function normalizeSettings(value) {
    return {
      enabled: value.enabled !== false,
      enabledCategories: Array.isArray(value.enabledCategories) ? value.enabledCategories : DEFAULTS.enabledCategories
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
    const input = findInput(event.target);
    if (input) inspectAndBlock(event, input);
  }

  function interceptClick(event) {
    reconcileRemovedAttachment(event);
    const button = event.target instanceof Element ? event.target.closest(SEND_SELECTOR) : null;
    if (!button) return;
    const input = findInput(button.closest("form") || button.parentElement || document);
    if (input) inspectAndBlock(event, input);
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
      showInspectionAlert("Anexo não pôde ser analisado", "Por segurança, remova o arquivo ou converta-o para um PDF/DOCX com texto extraível.", errors, input);
      return false;
    }
    const blocked = records.filter((record) => record.status === "blocked");
    if (blocked.length) {
      const findings = blocked.flatMap((record) => record.scan.result.findings.map((finding) => ({ ...finding, source: record.fileName })));
      showAlert({ blocked: true, findings, categories: [...new Set(findings.map((finding) => finding.category))] }, input);
      return false;
    }
    return true;
  }

  function reconcileRemovedAttachment(event) {
    const button = event.target instanceof Element
      ? event.target.closest("button[aria-label*='remove' i],button[aria-label*='remover' i],button[data-testid*='remove' i]")
      : null;
    if (!button) return;
    const context = button.parentElement ? button.parentElement.innerText || button.parentElement.textContent || "" : "";
    const state = attachments.state();
    for (const record of [...state.pending, ...state.errors, ...state.blocked, ...state.safe]) {
      if (context.includes(record.fileName)) attachments.removeByName(record.fileName);
    }
  }

  function interceptEnter(event) {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    const input = event.target instanceof Element ? event.target.closest(INPUT_SELECTOR) : null;
    if (input) inspectAndBlock(event, input);
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

  function inspectAndBlock(event, input) {
    if (!settings.enabled) {
      setTimeout(() => attachments.clear(), 2000);
      return false;
    }
    const attachmentState = attachments.state();
    if (attachmentState.pending.length) {
      blockEvent(event);
      showInspectionAlert("Análise de anexos em andamento", "Aguarde a análise local terminar e tente enviar novamente.", attachmentState.pending, input);
      return true;
    }
    if (attachmentState.errors.length) {
      blockEvent(event);
      showInspectionAlert("Anexo não pôde ser analisado", "Por segurança, remova o arquivo ou converta-o para um PDF/DOCX com texto extraível.", attachmentState.errors, input);
      return true;
    }
    if (attachmentState.blocked.length) {
      const findings = attachmentState.blocked.flatMap((record) => record.scan.result.findings.map((finding) => ({ ...finding, source: record.fileName })));
      const result = { blocked: true, findings, categories: [...new Set(findings.map((finding) => finding.category))] };
      blockEvent(event);
      showAlert(result, input);
      return true;
    }
    const result = AISafetyGuard.analyze(readInput(input), settings);
    if (!result.blocked) {
      setTimeout(() => attachments.clear(), 2000);
      return false;
    }
    blockEvent(event);
    showAlert(result, input);
    return true;
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
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.72);display:grid;place-items:center;padding:20px;font-family:system-ui,sans-serif";
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

  function showAlert(result, input) {
    if (overlay) overlay.remove();
    overlay = document.createElement("div");
    overlay.id = "ai-safety-guard-alert";
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,.72);display:grid;place-items:center;padding:20px;font-family:system-ui,sans-serif";
    const panel = document.createElement("section");
    panel.setAttribute("role", "alertdialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "ai-dlp-title");
    panel.style.cssText = "width:min(520px,100%);max-height:80vh;overflow:auto;background:#fff;color:#172033;border-radius:16px;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.35)";

    const title = document.createElement("h2");
    title.id = "ai-dlp-title";
    title.textContent = "AI Safety Guard - Envio bloqueado";
    title.style.cssText = "font-size:20px;margin:0 0 10px";
    const description = document.createElement("p");
    description.textContent = "Possível dado sensível detectado. Remova ou anonimize os dados abaixo antes de tentar novamente.";
    description.style.cssText = "font-size:14px;line-height:1.5;margin:0 0 16px;color:#475569";
    const categoryWarning = document.createElement("p");
    const categoryNames = result.categories.map((category) => AISafetyGuard.CATEGORIES[category]);
    categoryWarning.textContent = `Possível infração nas categorias: ${categoryNames.join(", ")}.`;
    categoryWarning.style.cssText = "font-size:14px;line-height:1.5;margin:0 0 16px;padding:12px;border-radius:9px;background:#fef3f2;color:#912018;font-weight:700";
    const list = document.createElement("ul");
    list.style.cssText = "margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.7";
    result.findings.forEach((finding) => {
      const item = document.createElement("li");
      item.textContent = `${AISafetyGuard.CATEGORIES[finding.category]} — ${finding.label} (${finding.sample})${finding.source ? ` — anexo: ${finding.source}` : ""}`;
      list.appendChild(item);
    });
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Revisar mensagem";
    close.style.cssText = "width:100%;border:0;border-radius:9px;padding:11px 16px;background:#b42318;color:#fff;font-weight:700;cursor:pointer";
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
