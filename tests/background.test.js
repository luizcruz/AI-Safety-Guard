"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { compareVersions, validateCatalog, downloadRules, sanitizeAuditEntry, appendAuditLog, prepareNano, requestNano, register } = require("../plugin/src/background.js");
const bundled = require("../plugin/src/rules.js");

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

test("sanitiza registros de auditoria sem conteúdo multilinha", () => {
  const entry = sanitizeAuditEntry({ timestamp: "inválida", ai: "Gemini\nforjado", mode: "heuristic", confidence: 87, decision: "block", policyIds: ["credentials-secrets", "inválida!", "credentials-secrets"], policies: ["Credenciais\ncríticas", "Credenciais\ncríticas"], findings: [{ category: "Credenciais", label: "JWT\r\nToken", sample: "eyJ***", source: "prompt" }] }, () => new Date("2026-08-16T12:00:00Z"));
  assert.equal(entry.timestamp, "2026-08-16T12:00:00.000Z");
  assert.equal(entry.ai, "Gemini forjado");
  assert.equal(entry.findings[0].label, "JWT Token");
  assert.equal(entry.confidence, 87);
  assert.equal(entry.decision, "block");
  assert.equal(entry.mode, "heuristic");
  assert.deepEqual(entry.policyIds, ["credentials-secrets"]);
  assert.deepEqual(entry.policies, ["Credenciais críticas"]);
  assert.equal(sanitizeAuditEntry({ confidence: 999, decision: "invalid" }).confidence, 100);
  assert.equal(sanitizeAuditEntry({ confidence: 999, decision: "invalid" }).decision, "allow");
  assert.equal(sanitizeAuditEntry({ mode: "invalid" }).mode, "unknown");
});

test("persiste auditoria silenciosamente no armazenamento local", async () => {
  const state = {};
  const chromeApi = {
    storage: { local: {
      get: async (defaults) => ({ ...defaults, ...state }),
      set: async (values) => Object.assign(state, values)
    } }
  };
  await appendAuditLog(chromeApi, { timestamp: "2026-08-16T12:00:00Z", ai: "ChatGPT", findings: [{ category: "Documentos pessoais", label: "CPF", sample: "123.***.***-09", source: "prompt" }] });
  await appendAuditLog(chromeApi, { timestamp: "2026-08-16T12:01:00Z", ai: "Gemini", findings: [{ category: "Credenciais", label: "JWT", sample: "eyJ***", source: "arquivo.pdf" }] });
  assert.equal(state.auditLog.length, 2);
  assert.equal(state.auditLog[0].ai, "ChatGPT");
  assert.equal(state.auditLog[1].ai, "Gemini");
  assert.ok(state.auditLogUpdatedAt);
});

test("limita retenção da auditoria local", async () => {
  const state = { auditLog: Array.from({ length: 500 }, (_, index) => ({ timestamp: `old-${index}`, ai: "Teste", findings: [] })) };
  const chromeApi = {
    storage: { local: {
      get: async (defaults) => ({ ...defaults, ...state }),
      set: async (values) => Object.assign(state, values)
    } }
  };
  await appendAuditLog(chromeApi, { timestamp: "2026-08-16T12:00:00Z", ai: "Claude", findings: [] });
  assert.equal(state.auditLog.length, 500);
  assert.equal(state.auditLog.at(-1).ai, "Claude");
  assert.equal(state.auditLog[0].timestamp, "old-1");
});

test("prepara Gemini Nano automaticamente ou exige conclusão assistida", async () => {
  const state = {};
  const chromeApi = { storage: { local: { set: async (values) => Object.assign(state, values) } } };
  const ready = { availability: async () => "available", install: async () => assert.fail("não deve criar sessão para validar"), UNSUPPORTED_MESSAGE: "sem suporte" };
  assert.equal((await prepareNano(chromeApi, ready)).state, "available");
  const activationRequired = { availability: async () => "downloadable", install: async () => { throw new Error("user activation required"); }, UNSUPPORTED_MESSAGE: "sem suporte" };
  assert.equal((await prepareNano(chromeApi, activationRequired)).state, "setup-required");
  const unavailable = { availability: async () => "unavailable", install: async () => assert.fail("não deve instalar"), UNSUPPORTED_MESSAGE: "sem suporte" };
  assert.deepEqual(await prepareNano(chromeApi, unavailable), { state: "unavailable", message: "sem suporte" });
});

test("encaminha Gemini Nano para documento offscreen da extensão", async () => {
  let created = false;
  let creationOptions;
  let forwarded;
  const chromeApi = {
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`,
      getContexts: async () => created ? [{}] : [],
      sendMessage: async (message) => {
        forwarded = message;
        return { ok: true, state: "available" };
      }
    },
    offscreen: {
      createDocument: async (options) => {
        created = true;
        creationOptions = options;
      }
    }
  };
  const response = await requestNano(chromeApi, { type: "NANO_AVAILABILITY" });
  assert.deepEqual(response, { ok: true, state: "available" });
  assert.equal(creationOptions.url, "src/offscreen.html");
  assert.deepEqual(creationOptions.reasons, ["WORKERS"]);
  assert.deepEqual(forwarded, { type: "NANO_AVAILABILITY", target: "nano-offscreen" });
});

test("registra eventos do Chrome, descarta cache antigo e persiste catálogo atualizado", async () => {
  const state = { apiUrl: "https://rules.example", apiToken: "secret", rulesVersion: "1.1.0" };
  const listeners = {};
  let optionsOpened = 0;
  const chromeApi = {
    storage: { local: {
      get: async (defaults) => ({ ...defaults, ...state }),
      set: async (values) => Object.assign(state, values)
    } },
    runtime: {
      onStartup: { addListener: (listener) => { listeners.startup = listener; } },
      onInstalled: { addListener: (listener) => { listeners.installed = listener; } },
      onMessage: { addListener: (listener) => { listeners.message = listener; } },
      openOptionsPage: async () => { optionsOpened += 1; }
    }
  };
  const catalog = { ...bundled, version: "1.3.1" };
  const updater = register(chromeApi, async () => ({ ok: true, json: async () => catalog }));
  const result = await updater.refresh();
  assert.equal(result.updated, true);
  assert.equal(state.rulesVersion, "1.3.1");
  assert.equal(state.rulesCatalog.version, "1.3.1");
  assert.equal(typeof listeners.startup, "function");
  assert.equal(typeof listeners.installed, "function");
  listeners.installed({ reason: "install" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.nanoStatus.state, "setup-required");
  assert.equal(optionsOpened, 1);
  assert.equal(listeners.message({ type: "IGNORED" }, null, () => undefined), false);
  const optionsResponse = await new Promise((resolve) => {
    assert.equal(listeners.message({ type: "OPEN_OPTIONS" }, null, resolve), true);
  });
  assert.equal(optionsResponse.ok, true);
  assert.equal(optionsOpened, 2);
  const auditResponse = await new Promise((resolve) => {
    assert.equal(listeners.message({ type: "RECORD_DETECTION", entry: { ai: "Gemini", findings: [] } }, null, resolve), true);
  });
  assert.equal(auditResponse.ok, true);
  assert.equal(state.auditLog.length, 1);
});
