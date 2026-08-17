(function exposeAuditLog(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AISafetyAuditLog = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAuditLog() {
  "use strict";

  const FILE_NAME = "ai-safety-guard.log";
  const MIME_TYPE = "application/x-ndjson;charset=utf-8";

  function serialize(entries) {
    if (!Array.isArray(entries) || !entries.length) return "";
    return `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
  }

  function download(entries, environment = globalThis) {
    const payload = serialize(entries);
    if (!payload) return false;

    const blob = new environment.Blob([payload], { type: MIME_TYPE });
    const objectUrl = environment.URL.createObjectURL(blob);
    const link = environment.document.createElement("a");
    link.href = objectUrl;
    link.download = FILE_NAME;
    link.hidden = true;
    environment.document.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
      environment.setTimeout(() => environment.URL.revokeObjectURL(objectUrl), 0);
    }
    return true;
  }

  return Object.freeze({ FILE_NAME, MIME_TYPE, serialize, download });
});
