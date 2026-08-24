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
    return "block";
  }

  function createEmissionGate({ windowMs = 250, now = Date.now } = {}) {
    const recent = new Map();
    return function shouldEmit(channel, key) {
      const timestamp = now();
      const id = `${channel}:${key}`;
      const previous = recent.get(id);
      if (previous !== undefined && timestamp - previous < windowMs) return false;
      recent.set(id, timestamp);
      for (const [storedId, storedAt] of recent) if (timestamp - storedAt >= windowMs) recent.delete(storedId);
      return true;
    };
  }

  return Object.freeze({ DEFAULT_MODE, MODES, normalizeMode, actionFor, createEmissionGate });
});
