(function exposeProtectionPolicy(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AISafetyProtectionPolicy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createProtectionPolicy() {
  "use strict";

  const DEFAULT_MODE = "heuristic";
  const MODES = Object.freeze([DEFAULT_MODE, "warn", "log"]);

  function normalizeMode(value) {
    if (value === "block") return DEFAULT_MODE;
    return MODES.includes(value) ? value : DEFAULT_MODE;
  }

  function actionFor(mode, decision) {
    if (decision === "allow") return "allow";
    const normalized = normalizeMode(mode);
    if (normalized === "log") return "log";
    if (normalized === "warn") return "warn";
    return decision === "block" ? "block" : "warn";
  }

  return Object.freeze({ DEFAULT_MODE, MODES, normalizeMode, actionFor });
});
