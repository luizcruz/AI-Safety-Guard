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

test("exclui políticas iniciais com marcador persistente e permite restaurá-las", () => {
  const removedId = "credentials-secrets";
  const stored = policies.serializePolicies(policies.normalizePolicies(), [removedId]);
  assert.deepEqual(policies.getDeletedBuiltInPolicyIds(stored), [removedId]);
  assert.equal(policies.normalizePolicies(stored).some((item) => item.id === removedId), false);
  assert.equal(policies.evaluate("password da conta de produção", stored).some((item) => item.id === removedId), false);

  const restored = policies.serializePolicies(policies.normalizePolicies(stored), []);
  assert.equal(policies.normalizePolicies(restored).some((item) => item.id === removedId), true);
  assert.deepEqual(policies.getDeletedBuiltInPolicyIds(restored), []);
});

test("ignora marcadores de exclusão para políticas que não são iniciais", () => {
  const stored = policies.serializePolicies([], ["custom-policy", "unknown"]);
  assert.deepEqual(policies.getDeletedBuiltInPolicyIds(stored), []);
  assert.equal(policies.normalizePolicies(stored).length, policies.DEFAULT_POLICIES.length);
});
