"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { compareVersions, validateCatalog, downloadRules, register } = require("../src/background.js");
const bundled = require("../src/rules.js");

test("compara versões semânticas", () => {
  assert.ok(compareVersions("1.2.0", "1.1.9") > 0);
  assert.ok(compareVersions("2.0.0", "9.9.9") < 0);
  assert.equal(compareVersions("1.1.0", "1.1.0"), 0);
});

test("valida catálogo antes de persistir", () => {
  assert.equal(validateCatalog(bundled), true);
  assert.equal(validateCatalog({ ...bundled, version: "latest" }), false);
  assert.equal(validateCatalog({ ...bundled, patterns: [{ category: "personal", source: "[", score: 90 }] }), false);
  assert.equal(validateCatalog({ ...bundled, fileNameRules: [{ category: "missing", label: "X", names: ["x"], score: 90 }] }), false);
});

test("baixa catálogo autenticado mais recente", async () => {
  let request;
  const catalog = { ...bundled, version: "1.1.1" };
  const result = await downloadRules({ apiUrl: "https://rules.example", apiToken: "secret", currentVersion: "1.1.0" }, async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => catalog };
  });
  assert.equal(result.updated, true);
  assert.equal(request.url, "https://rules.example/v1/rulesets/latest");
  assert.equal(request.options.headers.Authorization, "Bearer secret");
});

test("não consulta API sem token e rejeita respostas HTTP", async () => {
  assert.deepEqual(await downloadRules({}), { updated: false, reason: "missing-token" });
  await assert.rejects(() => downloadRules({ apiToken: "x" }, async () => ({ ok: false, status: 401 })), /401/);
});

test("não envia bearer token por HTTP remoto", async () => {
  await assert.rejects(() => downloadRules({ apiUrl: "http://rules.example", apiToken: "secret" }, async () => assert.fail("fetch não deve ser chamado")), /HTTPS/);
});

test("não substitui catálogo por versão igual ou anterior", async () => {
  const response = { ok: true, json: async () => bundled };
  const result = await downloadRules({ apiToken: "x", currentVersion: bundled.version }, async () => response);
  assert.equal(result.updated, false);
  assert.equal(result.reason, "not-newer");
});

test("registra eventos do Chrome, descarta cache antigo e persiste catálogo atualizado", async () => {
  const state = { apiUrl: "https://rules.example", apiToken: "secret", rulesVersion: "1.1.0" };
  const listeners = {};
  const chromeApi = {
    storage: { local: {
      get: async (defaults) => ({ ...defaults, ...state }),
      set: async (values) => Object.assign(state, values)
    } },
    runtime: {
      onStartup: { addListener: (listener) => { listeners.startup = listener; } },
      onInstalled: { addListener: (listener) => { listeners.installed = listener; } },
      onMessage: { addListener: (listener) => { listeners.message = listener; } }
    }
  };
  const catalog = { ...bundled, version: "1.2.1" };
  const updater = register(chromeApi, async () => ({ ok: true, json: async () => catalog }));
  const result = await updater.refresh();
  assert.equal(result.updated, true);
  assert.equal(state.rulesVersion, "1.2.1");
  assert.equal(state.rulesCatalog.version, "1.2.1");
  assert.equal(typeof listeners.startup, "function");
  assert.equal(typeof listeners.installed, "function");
  assert.equal(listeners.message({ type: "IGNORED" }, null, () => undefined), false);
});
