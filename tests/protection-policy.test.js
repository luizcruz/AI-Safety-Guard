"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeMode, actionFor } = require("../plugin/src/protection-policy.js");
const { analyze } = require("../plugin/src/detector.js");

test("migra modo block legado para heuristic", () => {
  assert.equal(normalizeMode("block"), "heuristic");
  assert.equal(normalizeMode(undefined), "heuristic");
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

test("modos avisar e registrar sempre permitem resultados acionáveis", () => {
  assert.equal(actionFor("warn", "block"), "warn");
  assert.equal(actionFor("warn", "warn"), "warn");
  assert.equal(actionFor("log", "block"), "log");
  assert.equal(actionFor("log", "warn"), "log");

  const invalidCpf = analyze("Este é um teste CPF 111.222.111-12");
  assert.equal(actionFor("warn", invalidCpf.decision), "warn");
  assert.equal(actionFor("log", invalidCpf.decision), "log");
});
