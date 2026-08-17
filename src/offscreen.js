(function auditBlobFactory() {
  "use strict";

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.target !== "offscreen" || message.type !== "CREATE_AUDIT_BLOB") return false;
    try {
      const url = URL.createObjectURL(new Blob([String(message.content || "")], { type: "text/plain;charset=utf-8" }));
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      sendResponse({ ok: true, url });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return false;
  });
})();
