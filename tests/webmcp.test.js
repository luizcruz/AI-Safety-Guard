"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "plugin", "src", "webmcp.js"), "utf8");

function load(mode) {
  let registration;
  const listeners = [];
  const controller = new AbortController();
  const context = {
    AbortController,
    console: { warn() {} },
    document: {
      readyState: "complete",
      modelContext: { async registerTool(tool, options) { registration = { tool, options }; } },
      addEventListener() {}
    },
    chrome: {
      storage: {
        sync: { async get(defaults) { return { ...defaults, mode }; } },
        local: { async get(defaults) { return defaults; } },
        onChanged: { addListener(listener) { listeners.push(listener); } }
      },
      runtime: { async sendMessage() { return { ok: false }; } }
    },
    AISafetyProtectionPolicy: { DEFAULT_MODE: "detect", normalizeMode(value) { return value; } },
    AISafetyGuard: { CATEGORIES: { personal: {} } },
    AISafetyPolicies: { normalizePolicies() { return []; } },
    AISafetyHeuristicEvaluator: {
      MAX_TEXT_LENGTH: 100_000,
      evaluatePrompt(text, settings) {
        return { enabled: settings.mode === "heuristic", decision: text.includes("CPF") ? "block" : "allow", confidence: 50, categories: ["personal"], policyIds: [], findings: [{ source: "deterministic-rule", category: "personal", label: "CPF", score: 50 }], engines: { semantic: "not-run" } };
      },
      mergeSemantic(result) { return result; }
    },
    __controller: controller
  };
  vm.runInNewContext(source, context);
  return new Promise((resolve) => setImmediate(() => resolve({ registration, listeners })));
}

test("registers WebMCP only in heuristic mode with safe annotations", async () => {
  const enabled = await load("heuristic");
  assert.equal(enabled.registration.tool.name, "evaluate_ai_prompt");
  assert.equal(enabled.registration.tool.annotations.readOnlyHint, true);
  assert.equal(enabled.registration.tool.annotations.untrustedContentHint, true);
  assert.equal(enabled.registration.tool.inputSchema.additionalProperties, false);
  const output = JSON.parse(await enabled.registration.tool.execute({ text: "CPF" }));
  assert.equal(output.decision, "block");
  assert.doesNotMatch(JSON.stringify(output), /111\.222/);

  const disabled = await load("detect");
  assert.equal(disabled.registration, undefined);
});
