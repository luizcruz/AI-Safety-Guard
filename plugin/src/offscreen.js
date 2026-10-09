(function runLocalAIContext() {
  "use strict";

  let classificationQueue = Promise.resolve();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.target !== "nano-offscreen") return false;

    if (message.type === "NANO_AVAILABILITY") {
      AISafetyNano.availability()
        .then((state) => sendResponse({ ok: true, state }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message.type === "NANO_CLASSIFY") {
      const task = () => AISafetyNano.classify(message.text, {
        policies: AISafetyPolicies.normalizePolicies(message.policies),
        timeoutMs: message.timeoutMs
      });
      const pending = classificationQueue.catch(() => undefined).then(task);
      classificationQueue = pending;
      pending
        .then((classification) => sendResponse({ ok: true, classification }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    return false;
  });
})();
