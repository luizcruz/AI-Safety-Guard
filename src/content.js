(function protectAIChat() {
  "use strict";

  const DEFAULTS = { enabled: true, enabledCategories: Object.keys(AIChatDLP.CATEGORIES) };
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

  chrome.storage.sync.get(DEFAULTS, (stored) => { settings = normalizeSettings(stored); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    settings = normalizeSettings({
      enabled: changes.enabled ? changes.enabled.newValue : settings.enabled,
      enabledCategories: changes.enabledCategories ? changes.enabledCategories.newValue : settings.enabledCategories
    });
  });

  document.addEventListener("submit", interceptSubmit, true);
  document.addEventListener("click", interceptClick, true);
  document.addEventListener("keydown", interceptEnter, true);

  function normalizeSettings(value) {
    return {
      enabled: value.enabled !== false,
      enabledCategories: Array.isArray(value.enabledCategories) ? value.enabledCategories : DEFAULTS.enabledCategories
    };
  }

  function interceptSubmit(event) {
    const input = findInput(event.target);
    if (input) inspectAndBlock(event, input);
  }

  function interceptClick(event) {
    const button = event.target instanceof Element ? event.target.closest(SEND_SELECTOR) : null;
    if (!button) return;
    const input = findInput(button.closest("form") || button.parentElement || document);
    if (input) inspectAndBlock(event, input);
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
    if (!settings.enabled) return false;
    const result = AIChatDLP.analyze(readInput(input), settings);
    if (!result.blocked) return false;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    showAlert(result, input);
    return true;
  }

  function showAlert(result, input) {
    if (overlay) overlay.remove();
    overlay = document.createElement("div");
    overlay.id = "ai-chat-dlp-alert";
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
    description.textContent = "Remova ou anonimize os dados abaixo antes de tentar novamente. A análise ocorreu localmente no seu navegador.";
    description.style.cssText = "font-size:14px;line-height:1.5;margin:0 0 16px;color:#475569";
    const categoryWarning = document.createElement("p");
    const categoryNames = result.categories.map((category) => AIChatDLP.CATEGORIES[category]);
    categoryWarning.textContent = `Possível infração nas categorias: ${categoryNames.join(", ")}.`;
    categoryWarning.style.cssText = "font-size:14px;line-height:1.5;margin:0 0 16px;padding:12px;border-radius:9px;background:#fef3f2;color:#912018;font-weight:700";
    const list = document.createElement("ul");
    list.style.cssText = "margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.7";
    result.findings.forEach((finding) => {
      const item = document.createElement("li");
      item.textContent = `${AIChatDLP.CATEGORIES[finding.category]} — ${finding.label} (${finding.sample})`;
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
