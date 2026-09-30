"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_MODE, MODES, normalizeMode, actionFor, enforceNanoAvailability, createEmissionGate } = require("../plugin/src/protection-policy.js");
const { analyze } = require("../plugin/src/detector.js");

test("migra modo block legado para detecção", () => {
  assert.equal(DEFAULT_MODE, "detect");
  assert.deepEqual(MODES, ["log", "warn", "detect", "heuristic"]);
  assert.equal(normalizeMode("block"), "detect");
  assert.equal(normalizeMode(undefined), "detect");
  assert.equal(normalizeMode("detect"), "detect");
  assert.equal(normalizeMode("warn"), "warn");
  assert.equal(normalizeMode("log"), "log");
});

test("modo heurística bloqueia qualquer score acionável a partir de 50", () => {
  assert.equal(actionFor("heuristic", "block"), "block");
  assert.equal(actionFor("heuristic", "warn"), "block");
  assert.equal(actionFor("heuristic", "allow"), "allow");

  const medium = analyze("Servidor interno 192.168.10.20");
  assert.equal(medium.confidence >= 50, true);
  assert.equal(medium.decision, "warn");
  assert.equal(actionFor("heuristic", medium.decision), "block");

  const invalidCpf = analyze("Este é um teste CPF 111.222.111-12");
  assert.equal(invalidCpf.decision, "warn");
  assert.equal(actionFor("heuristic", invalidCpf.decision), "block");
});

test("modo detecção bloqueia regras e heurística requer Gemini Nano", () => {
  assert.equal(actionFor("detect", "block"), "block");
  assert.equal(actionFor("detect", "warn"), "block");
  assert.equal(actionFor("detect", "allow"), "allow");
  assert.equal(enforceNanoAvailability("heuristic", false), "detect");
  assert.equal(enforceNanoAvailability("heuristic", true), "heuristic");
  assert.equal(enforceNanoAvailability("warn", false), "warn");
});

test("modos avisar e registrar sempre permitem resultados acionáveis", () => {
  assert.equal(actionFor("warn", "block"), "warn");
  assert.equal(actionFor("warn", "warn"), "warn");
  assert.equal(actionFor("log", "block"), "log");
  assert.equal(actionFor("log", "warn"), "log");

  const invalidCpf = analyze("Este é um teste CPF 111.222.111-12");
  assert.equal(actionFor("warn", invalidCpf.decision), "warn");
  assert.equal(actionFor("log", invalidCpf.decision), "log");
});

test("avisos e logs repetidos são emitidos novamente em cada tentativa", () => {
  let timestamp = 1_000;
  const shouldEmit = createEmissionGate({ windowMs: 250, now: () => timestamp });
  assert.equal(shouldEmit("warn", "cpf"), true);
  assert.equal(shouldEmit("warn", "cpf"), false, "suprime somente eventos duplicados do mesmo clique");
  timestamp += 250;
  assert.equal(shouldEmit("warn", "cpf"), true);
  assert.equal(shouldEmit("log", "cpf"), true, "aviso e auditoria são canais independentes");
  timestamp += 250;
  assert.equal(shouldEmit("log", "cpf"), true);
});
