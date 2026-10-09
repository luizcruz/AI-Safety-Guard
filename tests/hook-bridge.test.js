"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const bridge = path.join(__dirname, "..", "integrations", "hooks", "evaluator-bridge.js");

function execute(payload, mode = "heuristic", environment = {}) {
  return spawnSync(process.execPath, [bridge], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, AI_SAFETY_MODE: mode, ...environment },
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
  assert.match(result.stderr, /AI Safety Guard bloqueou/);
  assert.match(result.stderr, /Documentos pessoais/);
  assert.doesNotMatch(result.stderr, /111\.222\.111-12/);
});

test("Claude hook blocks with structured output and offers a redacted prompt", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-safety-hook-config-"));
  try {
    const config = path.join(directory, "config.json");
    fs.writeFileSync(config, JSON.stringify({ mode: "heuristic", obfuscateSensitiveData: true }));
    const result = execute(
      { hook_event_name: "UserPromptSubmit", prompt: "Este é um teste CPF 111.222.111-12" },
      "heuristic",
      { AI_SAFETY_CONFIG: config }
    );
    assert.equal(result.status, 0, result.stderr);
    const response = JSON.parse(result.stdout);
    assert.equal(response.decision, "block");
    assert.equal(response.hookSpecificOutput.suppressOriginalPrompt, true);
    assert.match(response.reason, /CPF \[REDACTED\]/);
    assert.doesNotMatch(response.reason, /111\.222\.111-12/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
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
