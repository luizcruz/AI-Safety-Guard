"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig } = require("../src/config.js");

test("carrega configuração segura do painel", () => {
  const config = loadConfig({ AI_SAFETY_API_TOKEN: "token-with-at-least-32-characters", RULES_API_URL: "http://api:8000/path", ADMIN_PORT: "3100" });
  assert.deepEqual(config, { apiToken: "token-with-at-least-32-characters", apiUrl: "http://api:8000", port: 3100 });
});

test("rejeita token, URL e porta inválidos", () => {
  assert.throws(() => loadConfig({}), /AI_SAFETY_API_TOKEN/);
  assert.throws(() => loadConfig({ AI_SAFETY_API_TOKEN: "x".repeat(20), RULES_API_URL: "file:///tmp/api" }), /HTTP/);
  assert.throws(() => loadConfig({ AI_SAFETY_API_TOKEN: "x".repeat(20), ADMIN_PORT: "70000" }), /ADMIN_PORT/);
});
