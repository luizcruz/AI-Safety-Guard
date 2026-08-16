(function configurePopup() {
  "use strict";
  const enabled = document.querySelector("#enabled");
  const container = document.querySelector("#categories");
  const categoryInputs = new Map();

  for (const [key, label] of Object.entries(AISafetyGuard.CATEGORIES)) {
    const row = document.createElement("label");
    row.className = "row";
    row.append(document.createTextNode(label));
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.category = key;
    input.addEventListener("change", save);
    row.appendChild(input);
    container.appendChild(row);
    categoryInputs.set(key, input);
  }

  chrome.storage.sync.get({ enabled: true, enabledCategories: Object.keys(AISafetyGuard.CATEGORIES) }, (settings) => {
    enabled.checked = settings.enabled !== false;
    for (const [key, input] of categoryInputs) input.checked = settings.enabledCategories.includes(key);
  });
  enabled.addEventListener("change", save);

  function save() {
    chrome.storage.sync.set({
      enabled: enabled.checked,
      enabledCategories: [...categoryInputs].filter(([, input]) => input.checked).map(([key]) => key)
    });
  }
})();
