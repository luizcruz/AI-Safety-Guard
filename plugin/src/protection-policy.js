(function exposeProtectionPolicy(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AISafetyProtectionPolicy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createProtectionPolicy() {
  "use strict";

  const DEFAULT_MODE = "detect";
  const MODES = Object.freeze(["log", "warn", DEFAULT_MODE, "heuristic"]);

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

  function enforceNanoAvailability(mode, available) {
    const normalized = normalizeMode(mode);
    return normalized === "heuristic" && !available ? DEFAULT_MODE : normalized;
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

  return Object.freeze({ DEFAULT_MODE, MODES, normalizeMode, actionFor, enforceNanoAvailability, createEmissionGate });
});
