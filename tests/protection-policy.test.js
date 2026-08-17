"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeMode, actionFor } = require("../plugin/src/protection-policy.js");

test("migra modo block legado para heuristic", () => {
  assert.equal(normalizeMode("block"), "heuristic");
  assert.equal(normalizeMode(undefined), "heuristic");
  assert.equal(normalizeMode("warn"), "warn");
  assert.equal(normalizeMode("log"), "log");
});

test("modo heurística bloqueia alta e avisa média", () => {
  assert.equal(actionFor("heuristic", "block"), "block");
  assert.equal(actionFor("heuristic", "warn"), "warn");
  assert.equal(actionFor("heuristic", "allow"), "allow");
});

test("modos avisar e registrar sempre permitem resultados acionáveis", () => {
  assert.equal(actionFor("warn", "block"), "warn");
  assert.equal(actionFor("warn", "warn"), "warn");
  assert.equal(actionFor("log", "block"), "log");
  assert.equal(actionFor("log", "warn"), "log");
});
