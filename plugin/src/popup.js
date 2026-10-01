(function configurePopup() {
  "use strict";

  const MODES = Object.freeze([
    { id: "log", name: "Registrar", description: "Registra ocorrências localmente sem interromper o envio." },
    { id: "warn", name: "Avisar", description: "Exibe um alerta e permite continuar o envio." },
    { id: "detect", name: "Detecção", description: "Bloqueia riscos encontrados pelas regras determinísticas." },
    { id: "heuristic", name: "Heurística", description: "Adiciona análise semântica local com Gemini Nano." }
  ]);
  const slider = document.querySelector("#mode-slider");
  const modeName = document.querySelector("#mode-name");
  const description = document.querySelector("#mode-description");
  const nanoStatus = document.querySelector("#nano-status");
  const saveStatus = document.querySelector("#save-status");
  const heuristicMark = document.querySelector("#heuristic-mark");
  const openOptions = document.querySelector("#open-options");
  let nanoAvailable = false;

  initialize().catch((error) => showError(error.message));

  async function initialize() {
    const [{ mode }, localState, availability] = await Promise.all([
      chrome.storage.sync.get({ mode: AISafetyProtectionPolicy.DEFAULT_MODE }),
      chrome.storage.local.get({ nanoStatus: null }),
      AISafetyNano.availability()
    ]);
    nanoAvailable = availability === "available";
    slider.max = nanoAvailable ? "3" : "2";
    heuristicMark.classList.toggle("unavailable", !nanoAvailable);
    nanoStatus.textContent = nanoAvailable
      ? "Gemini Nano disponível neste navegador."
      : (localState.nanoStatus && localState.nanoStatus.message) || AISafetyNano.UNSUPPORTED_MESSAGE;
    nanoStatus.classList.toggle("error", !nanoAvailable);
    const safeMode = AISafetyProtectionPolicy.enforceNanoAvailability(mode, nanoAvailable);
    if (safeMode !== mode) {
      await chrome.storage.sync.set({ mode: safeMode });
      showSaved("Heurística indisponível; Detecção ativada.");
    }
    render(safeMode);
  }

  slider.addEventListener("input", () => render(MODES[Number(slider.value)].id));
  slider.addEventListener("change", async () => {
    const requested = MODES[Number(slider.value)].id;
    const mode = AISafetyProtectionPolicy.enforceNanoAvailability(requested, nanoAvailable);
    if (mode !== requested) {
      render(mode);
      return showError(AISafetyNano.UNSUPPORTED_MESSAGE);
    }
    await chrome.storage.sync.set({ mode });
    showSaved("Nível salvo.");
  });

  openOptions.addEventListener("click", async () => {
    try {
      await chrome.runtime.openOptionsPage();
      window.close();
    } catch (error) {
      showError(`Não foi possível abrir as configurações: ${error.message}`);
    }
  });

  function render(mode) {
    const index = Math.max(0, MODES.findIndex((item) => item.id === AISafetyProtectionPolicy.normalizeMode(mode)));
    const selected = MODES[index];
    slider.value = String(Math.min(index, Number(slider.max)));
    slider.setAttribute("aria-valuetext", selected.name);
    modeName.textContent = selected.name;
    description.textContent = selected.description;
  }

  function showError(message) {
    saveStatus.textContent = message;
    saveStatus.style.color = "#991b1b";
  }

  function showSaved(message) {
    saveStatus.textContent = message;
    saveStatus.style.color = "#166534";
  }
})();
