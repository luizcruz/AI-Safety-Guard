(function exposeHeuristicEvaluator(root, factory) {
  const isCommonJs = typeof module === "object" && module.exports;
  const detector = isCommonJs ? require("./detector.js") : root && root.AISafetyGuard;
  const policies = isCommonJs ? require("./policies.js") : root && root.AISafetyPolicies;
  const protection = isCommonJs ? require("./protection-policy.js") : root && root.AISafetyProtectionPolicy;
  const api = factory(detector, policies, protection);
  if (isCommonJs) module.exports = api;
  if (root) root.AISafetyHeuristicEvaluator = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createHeuristicEvaluator(detector, policyApi, protectionApi) {
  "use strict";

  const MAX_TEXT_LENGTH = 100_000;
  const MAX_FINDINGS = 12;
  const POLICY_SCORE = Object.freeze({ medium: 65, high: 80, critical: 95 });

  function evaluatePrompt(text, config = {}) {
    const mode = protectionApi.normalizeMode(config.mode);
    if (mode !== "heuristic") return disabledResult(mode);
    const input = String(text || "").trim();
    if (!input) throw new Error("Prompt vazio");
    if (input.length > MAX_TEXT_LENGTH) throw new Error(`Prompt excede ${MAX_TEXT_LENGTH} caracteres`);

    const enabledCategories = Array.isArray(config.enabledCategories) && config.enabledCategories.length
      ? config.enabledCategories
      : Object.keys(detector.CATEGORIES);
    const normalizedPolicies = policyApi.normalizePolicies(config.policies);
    const deterministic = detector.analyze(input, { enabledCategories });
    const enabled = new Set(enabledCategories);
    const policyMatches = policyApi.evaluate(input, normalizedPolicies)
      .filter((match) => {
        const policy = normalizedPolicies.find((item) => item.id === match.id);
        return policy && enabled.has(policy.category);
      });
    const findings = deterministic.findings.slice(0, MAX_FINDINGS).map((finding) => ({
      source: finding.family === "structure" ? "heuristic-rule" : "deterministic-rule",
      category: finding.category,
      label: finding.label,
      score: Number(finding.score) || 0,
      reasons: Array.isArray(finding.reasons) ? finding.reasons.slice(0, 3) : []
    }));

    for (const match of policyMatches) {
      if (findings.length >= MAX_FINDINGS) break;
      const policy = normalizedPolicies.find((item) => item.id === match.id);
      findings.push({
        source: "heuristic-policy",
        category: policy.category,
        label: policy.name,
        score: POLICY_SCORE[policy.severity],
        policyId: policy.id,
        reasons: ["indicador e contexto de política correspondentes"]
      });
    }

    const confidence = Math.max(Number(deterministic.confidence) || 0, ...findings.map((finding) => finding.score));
    return finalize({
      mode,
      findings,
      confidence,
      policyIds: policyMatches.map((match) => match.id),
      engines: { deterministic: "evaluated", policies: "evaluated", semantic: "not-run" }
    });
  }

  function mergeSemantic(result, classification) {
    if (!result || !result.enabled) return result;
    const next = { ...result, findings: [...result.findings], policyIds: [...result.policyIds], engines: { ...result.engines, semantic: "evaluated" } };
    if (classification && classification.risk === true) {
      const score = POLICY_SCORE[classification.severity] || 65;
      next.findings.push({
        source: "gemini-nano",
        category: classification.category || "corporate",
        label: "Risco semântico local",
        score,
        reasons: [String(classification.reason || "Risco semântico identificado").replace(/[\r\n]+/g, " ").slice(0, 160)]
      });
      next.confidence = Math.max(next.confidence, score);
      next.policyIds = [...new Set([...next.policyIds, ...(Array.isArray(classification.policyIds) ? classification.policyIds : [])])].slice(0, 12);
    }
    return finalize(next);
  }

  function obfuscatePrompt(text, result, config = {}) {
    if (!result || !result.blocked || config.obfuscateSensitiveData !== true) return "";
    const matchedPolicyIds = new Set(Array.isArray(result.policyIds) ? result.policyIds : []);
    const sensitiveTerms = policyApi.normalizePolicies(config.policies)
      .filter((policy) => matchedPolicyIds.has(policy.id))
      .flatMap((policy) => policy.terms);
    const obfuscated = detector.obfuscate(String(text || ""), {
      enabledCategories: Array.isArray(config.enabledCategories) ? config.enabledCategories : undefined,
      sensitiveTerms
    });
    return obfuscated !== String(text || "") ? obfuscated : "";
  }

  function finalize(value) {
    const findings = value.findings.slice(0, MAX_FINDINGS);
    const categories = [...new Set(findings.map((finding) => finding.category))];
    const risk = findings.some((finding) => finding.score >= 50);
    return {
      version: 1,
      enabled: true,
      mode: value.mode,
      decision: risk ? "block" : "allow",
      blocked: risk,
      confidence: Math.max(0, Math.min(100, Number(value.confidence) || 0)),
      categories,
      policyIds: [...new Set(value.policyIds || [])].slice(0, 12),
      findings,
      engines: value.engines
    };
  }

  function disabledResult(mode) {
    return { version: 1, enabled: false, mode, decision: "allow", blocked: false, confidence: 0, categories: [], policyIds: [], findings: [], engines: { deterministic: "not-run", policies: "not-run", semantic: "not-run" } };
  }

  return Object.freeze({ evaluatePrompt, mergeSemantic, obfuscatePrompt, updateCatalog: detector.updateCatalog, MAX_TEXT_LENGTH, MAX_FINDINGS });
});
