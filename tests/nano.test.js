"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const nano = require("../plugin/src/nano.js");
const policyApi = require("../plugin/src/policies.js");

test("detecta indisponibilidade e estados suportados do Gemini Nano", async () => {
  assert.equal(await nano.availability(null), "unavailable");
  for (const state of ["available", "downloadable", "downloading"]) {
    const model = { availability: async () => state, create: async () => ({}) };
    assert.equal(await nano.availability(model), state);
  }
  assert.equal(await nano.availability({ availability: async () => "unknown", create: async () => ({}) }), "unavailable");
});

test("instala o modelo com progresso e encerra a sessão de preparação", async () => {
  const progress = [];
  let destroyed = false;
  const model = {
    availability: async () => "downloadable",
    create: async (options) => {
      options.monitor({ addEventListener: (name, listener) => {
        assert.equal(name, "downloadprogress");
        listener({ loaded: 0.4 });
        listener({ loaded: 1 });
      } });
      return { destroy: () => { destroyed = true; } };
    }
  };
  assert.deepEqual(await nano.install({ languageModel: model, onProgress: (value) => progress.push(value) }), { state: "available", downloaded: true });
  assert.deepEqual(progress, [0.4, 1]);
  assert.equal(destroyed, true);
});

test("classifica com saída estruturada e converte risco em detecção", async () => {
  let captured;
  const session = {
    prompt: async (prompt, options) => {
      captured = { prompt, options };
      return JSON.stringify({ risk: true, severity: "high", category: "credentials", reason: "Segredo exposto\nno texto", sensitiveTerms: ["password de produção", "valor inexistente"], policyIds: ["credentials-secrets", "unknown"] });
    }
  };
  const classification = await nano.classify("password de produção", { session, policies: policyApi.normalizePolicies() });
  assert.equal(captured.options.responseConstraint, nano.RESPONSE_SCHEMA);
  assert.match(captured.prompt, /USER_TEXT_START[\s\S]*password de produção[\s\S]*USER_TEXT_END/);
  assert.match(captured.prompt, /Assign severity=low[\s\S]*medium[\s\S]*high[\s\S]*critical/);
  assert.match(captured.prompt, /POLICY_JSON_START[\s\S]*credentials-secrets[\s\S]*POLICY_JSON_END/);
  assert.deepEqual(classification, { risk: true, severity: "high", category: "credentials", reason: "Segredo exposto no texto", sensitiveTerms: ["password de produção"], policyIds: ["credentials-secrets"] });
  const detection = nano.toDetection(classification);
  assert.equal(detection.decision, "block");
  assert.equal(detection.confidence, 80);
  assert.equal(detection.findings[0].family, "local-ai");
  assert.deepEqual(detection.sensitiveTerms, ["password de produção"]);
  assert.deepEqual(detection.policyIds, ["credentials-secrets"]);
});

test("resultado seguro não cria achados e entrada vazia não chama o modelo", async () => {
  const safe = nano.toDetection({ risk: false, severity: "low", category: "corporate", reason: "público", sensitiveTerms: [] });
  assert.equal(safe.decision, "allow");
  assert.deepEqual(safe.findings, []);
  assert.deepEqual(await nano.classify("", { session: { prompt: () => assert.fail("não deve chamar") } }), { risk: false, severity: "low", category: "corporate", reason: "Empty input", sensitiveTerms: [], policyIds: [] });
});

test("cada classificação usa e encerra uma sessão isolada", async () => {
  let created = 0;
  let destroyed = 0;
  const languageModel = {
    create: async () => {
      created += 1;
      return {
        prompt: async () => JSON.stringify({ risk: false, severity: "low", category: "corporate", reason: "public", sensitiveTerms: [], policyIds: [] }),
        destroy: () => { destroyed += 1; }
      };
    }
  };
  await nano.classify("primeiro", { languageModel });
  await nano.classify("segundo", { languageModel });
  assert.equal(created, 2);
  assert.equal(destroyed, 2);
});

test("interrompe inferência travada e encerra a sessão", async () => {
  let destroyed = false;
  let aborted = false;
  const languageModel = {
    create: async () => ({
      prompt: (_prompt, options) => new Promise(() => {
        options.signal.addEventListener("abort", () => { aborted = true; });
      }),
      destroy: () => { destroyed = true; }
    })
  };
  await assert.rejects(() => nano.classify("texto", { languageModel, timeoutMs: 5 }), /Tempo limite do modelo local excedido/);
  assert.equal(aborted, true);
  assert.equal(destroyed, true);
});

test("falha fechada para resposta inválida e navegador incompatível", async () => {
  await assert.rejects(() => nano.install({ languageModel: {} }), new RegExp(nano.UNSUPPORTED_MESSAGE));
  await assert.rejects(() => nano.classify("texto", { session: { prompt: async () => "{}" } }), /Resposta inválida/);
});
