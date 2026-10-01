"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const policies = require("../plugin/src/policies.js");

test("fornece ao menos dez políticas heurísticas com nuances", () => {
  const defaults = policies.normalizePolicies();
  assert.ok(defaults.length >= 10);
  assert.ok(defaults.every((item) => item.terms.length && item.description && item.severity));
  assert.ok(defaults.some((item) => item.contextTerms.length && item.exceptions.length));
});

test("exige indicador e contexto e respeita exceções", () => {
  const configured = policies.normalizePolicies();
  assert.deepEqual(policies.evaluate("A fonte me confirmou a reportagem sob embargo", configured).map((item) => item.id), ["press-embargo"]);
  assert.deepEqual(policies.evaluate("A expressão sob embargo aparece no dicionário", configured), []);
  assert.deepEqual(policies.evaluate("A reportagem sob embargo já foi publicada oficialmente", configured), []);
});

test("adiciona, normaliza e valida políticas personalizadas", () => {
  const next = policies.addPolicy([], {
    id: "custom-projeto-omega",
    name: "Projeto Omega",
    description: "Plano sigiloso com contexto específico.",
    category: "corporate",
    severity: "critical",
    terms: "omega, lançamento secreto",
    contextTerms: "diretoria, roadmap",
    exceptions: "anúncio público"
  });
  const custom = next.find((item) => item.id === "custom-projeto-omega");
  assert.deepEqual(custom.terms, ["omega", "lançamento secreto"]);
  assert.equal(custom.builtIn, false);
  assert.throws(() => policies.addPolicy(next, custom), /identificador/);
});

test("gera contexto estruturado para o pré-prompt", () => {
  const context = JSON.parse(policies.toPromptContext(undefined, "password da conta de produção"));
  assert.ok(context.policies.length >= 10);
  assert.ok(context.localMatches.includes("credentials-secrets"));
  assert.ok(context.policies.every((item) => Array.isArray(item.exceptions)));
  assert.ok(JSON.stringify(context).length <= policies.MAX_PROMPT_CONTEXT_LENGTH);
});
