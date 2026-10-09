"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const bridge = path.join(__dirname, "..", "integrations", "hooks", "evaluator-bridge.js");

function execute(payload, mode = "heuristic") {
  return spawnSync(process.execPath, [bridge], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, AI_SAFETY_MODE: mode },
    timeout: 5_000
  });
}

test("hook allows safe prompts", () => {
  const result = execute({ prompt: "Explain a public JavaScript API." });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("hook blocks risky prompts without echoing sensitive input", () => {
  const result = execute({ user_prompt: "Este é um teste CPF 111.222.111-12" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /AI Safety Guard blocked/);
  assert.match(result.stderr, /personal/);
  assert.doesNotMatch(result.stderr, /111\.222\.111-12/);
});

test("hook remains inactive outside heuristic mode", () => {
  const result = execute({ prompt: "CPF 111.222.111-12" }, "detect");
  assert.equal(result.status, 0);
});

test("hook supports the messages input shape", () => {
  const result = execute({ messages: [{ role: "user", content: "A aquisição está em due diligence com valuation do alvo" }] });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /mergers-acquisitions/);
});
