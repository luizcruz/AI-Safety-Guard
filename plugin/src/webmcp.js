(function registerAISafetyWebMCP() {
  "use strict";

  const TOOL_NAME = "evaluate_ai_prompt";
  let registrationController;

  scheduleRefresh();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scheduleRefresh, { once: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.mode) scheduleRefresh();
  });

  function scheduleRefresh() {
    refreshRegistration().catch((error) => console.warn("AI Safety Guard could not update its WebMCP tool.", error));
  }

  async function refreshRegistration() {
    if (!document.modelContext || typeof document.modelContext.registerTool !== "function") return;
    const { mode } = await chrome.storage.sync.get({ mode: AISafetyProtectionPolicy.DEFAULT_MODE });
    const enabled = AISafetyProtectionPolicy.normalizeMode(mode) === "heuristic";
    if (!enabled) {
      if (registrationController) registrationController.abort();
      registrationController = undefined;
      return;
    }
    if (registrationController) return;

    const controller = new AbortController();
    registrationController = controller;
    try {
      await document.modelContext.registerTool({
        name: TOOL_NAME,
        description: "Evaluate a proposed AI prompt with AI Safety Guard deterministic rules, nuanced heuristic policies, and local semantic analysis. Returns only risk metadata; it never returns the submitted prompt.",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", minLength: 1, maxLength: AISafetyHeuristicEvaluator.MAX_TEXT_LENGTH, description: "Proposed prompt to evaluate before submission." }
          },
          required: ["text"],
          additionalProperties: false
        },
        annotations: { readOnlyHint: true, consequentialHint: false, untrustedContentHint: true },
        execute: executeEvaluation
      }, { signal: controller.signal });
    } catch (error) {
      controller.abort();
      if (registrationController === controller) registrationController = undefined;
      console.warn("AI Safety Guard could not register its WebMCP tool.", error);
    }
  }

  async function executeEvaluation({ text }) {
    const [syncSettings, localSettings] = await Promise.all([
      chrome.storage.sync.get({ mode: AISafetyProtectionPolicy.DEFAULT_MODE, enabledCategories: Object.keys(AISafetyGuard.CATEGORIES) }),
      chrome.storage.local.get({ heuristicPolicies: null })
    ]);
    let result = AISafetyHeuristicEvaluator.evaluatePrompt(text, {
      mode: syncSettings.mode,
      enabledCategories: syncSettings.enabledCategories,
      policies: localSettings.heuristicPolicies
    });
    if (!result.enabled) return JSON.stringify(compact(result));

    try {
      const response = await chrome.runtime.sendMessage({
        type: "NANO_CLASSIFY",
        text,
        policies: AISafetyPolicies.normalizePolicies(localSettings.heuristicPolicies),
        timeoutMs: 45_000
      });
      if (response && response.ok && response.classification) result = AISafetyHeuristicEvaluator.mergeSemantic(result, response.classification);
      else result.engines.semantic = "unavailable";
    } catch {
      result.engines.semantic = "unavailable";
    }
    return JSON.stringify(compact(result));
  }

  function compact(result) {
    return {
      enabled: result.enabled,
      decision: result.decision,
      confidence: result.confidence,
      categories: result.categories,
      policyIds: result.policyIds,
      findings: result.findings.slice(0, 5).map(({ source, category, label, score }) => ({ source, category, label: String(label).slice(0, 80), score })),
      engines: result.engines
    };
  }
})();
