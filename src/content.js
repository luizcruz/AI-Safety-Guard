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
  const attachments = new AISafetyAttachmentScanner.Registry((file) => AISafetyAttachmentScanner.scanFile(file, AISafetyGuard.analyze, settings));

  chrome.storage.sync.get(DEFAULTS, (stored) => { settings = normalizeSettings(stored); });
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
        chrome.storage.sync.set({ enabledCategories: settings.enabledCategories });
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
    attachments.remove(fileInputRecords.get(input));
    const ids = attachments.add(input.files);
    fileInputRecords.set(input, ids);
  }

  function captureDroppedFiles(event) {
    if (event.dataTransfer && event.dataTransfer.files) attachments.add(event.dataTransfer.files);
  }

  function capturePastedFiles(event) {
    if (event.clipboardData && event.clipboardData.files) attachments.add(event.clipboardData.files);
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
    title.textContent = "Envio bloqueado: possível dado sensível";
    title.style.cssText = "font-size:20px;margin:0 0 10px";
    const description = document.createElement("p");
    description.textContent = "Remova ou anonimize os dados do prompt ou anexo antes de tentar novamente. A análise ocorreu localmente no seu navegador.";
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
