"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const evaluator = require("../plugin/src/heuristic-evaluator.js");

test("does not evaluate outside heuristic mode", () => {
  const result = evaluator.evaluatePrompt("CPF 111.222.111-12", { mode: "detect" });
  assert.equal(result.enabled, false);
  assert.equal(result.decision, "allow");
  assert.equal(result.engines.deterministic, "not-run");
});

test("allows a prompt without risk indicators", () => {
  const result = evaluator.evaluatePrompt("Summarize this public product description.", { mode: "heuristic" });
  assert.equal(result.enabled, true);
  assert.equal(result.blocked, false);
  assert.deepEqual(result.findings, []);
});

test("blocks CPF formats even when their checksum is invalid", () => {
  const result = evaluator.evaluatePrompt("Este é um teste CPF 111.222.111-12", { mode: "heuristic" });
  assert.equal(result.blocked, true);
  assert.deepEqual(result.categories, ["personal"]);
  assert.equal(result.findings[0].label, "CPF");
  assert.ok(result.findings[0].score >= 50);
});

test("evaluates nuanced policies and honors their exceptions", () => {
  const blocked = evaluator.evaluatePrompt("A aquisição está em due diligence com valuation do alvo", { mode: "heuristic" });
  assert.equal(blocked.blocked, true);
  assert.ok(blocked.policyIds.includes("mergers-acquisitions"));

  const allowed = evaluator.evaluatePrompt("A aquisição foi notícia pública com valuation do alvo", { mode: "heuristic" });
  assert.equal(allowed.blocked, false);
  assert.deepEqual(allowed.policyIds, []);
});

test("merges a local semantic classification without returning prompt text", () => {
  const base = evaluator.evaluatePrompt("ordinary words", { mode: "heuristic" });
  const result = evaluator.mergeSemantic(base, { risk: true, severity: "high", category: "corporate", reason: "Internal context", policyIds: ["custom-policy"] });
  assert.equal(result.blocked, true);
  assert.equal(result.engines.semantic, "evaluated");
  assert.ok(result.policyIds.includes("custom-policy"));
  assert.doesNotMatch(JSON.stringify(result), /ordinary words/);
});

test("rejects empty and oversized prompts", () => {
  assert.throws(() => evaluator.evaluatePrompt("", { mode: "heuristic" }), /Prompt vazio/);
  assert.throws(() => evaluator.evaluatePrompt("a".repeat(evaluator.MAX_TEXT_LENGTH + 1), { mode: "heuristic" }), /excede/);
});
