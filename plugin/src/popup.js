(function configurePopup() {
  "use strict";

  const MODES = Object.freeze([
    { id: "log", name: "Registrar", description: "Registra ocorrências localmente sem interromper o envio." },
    { id: "warn", name: "Avisar", description: "Exibe um alerta e permite continuar o envio." },
    { id: "detect", name: "Detecção", description: "Bloqueia riscos encontrados pelas regras determinísticas." },
    { id: "heuristic", name: "Híbrido", description: "Combina regras locais com Gemini Nano quando disponível, sem interromper a proteção." }
  ]);
  const slider = document.querySelector("#mode-slider");
  const modeName = document.querySelector("#mode-name");
  const description = document.querySelector("#mode-description");
  const nanoStatus = document.querySelector("#nano-status");
  const saveStatus = document.querySelector("#save-status");
  const heuristicMark = document.querySelector("#heuristic-mark");
  const openOptions = document.querySelector("#open-options");
  let nanoAvailable = false;

  slider.disabled = true;
  let initializationTimer;
  const initializationTimeout = new Promise((_, reject) => {
    initializationTimer = setTimeout(() => reject(new Error("Tempo limite ao carregar. Reabra a extensão ou consulte a ajuda.")), 10_000);
  });
  Promise.race([initialize(), initializationTimeout]).catch((error) => {
    if (slider.disabled) {
      modeName.textContent = "Configuração indisponível";
      description.textContent = "Não foi possível consultar o nível salvo. Reabra a extensão.";
    }
    nanoStatus.textContent = "IA local não confirmada. Consulte a ajuda.";
    showError(error.message);
  }).finally(() => clearTimeout(initializationTimer));

  async function initialize() {
    const [{ mode }, localState] = await Promise.all([
      chrome.storage.sync.get({ mode: AISafetyProtectionPolicy.DEFAULT_MODE }),
      chrome.storage.local.get({ nanoStatus: null })
    ]);
    slider.max = "3";
    render(mode);
    slider.disabled = false;
    nanoStatus.textContent = (localState.nanoStatus && localState.nanoStatus.message) || "Verificando Gemini Nano…";
    const availability = await AISafetyNano.availability();
    nanoAvailable = availability === "available";
    heuristicMark.classList.toggle("unavailable", !nanoAvailable);
    nanoStatus.textContent = nanoAvailable
      ? "Gemini Nano disponível neste navegador."
      : (localState.nanoStatus && localState.nanoStatus.message) || AISafetyNano.UNSUPPORTED_MESSAGE;
    nanoStatus.classList.toggle("error", !nanoAvailable);
  }

  slider.addEventListener("input", () => render(MODES[Number(slider.value)].id));
  slider.addEventListener("change", async () => {
    const requested = MODES[Number(slider.value)].id;
    const mode = AISafetyProtectionPolicy.normalizeMode(requested);
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
