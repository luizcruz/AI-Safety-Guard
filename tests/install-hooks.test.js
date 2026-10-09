"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const installer = path.join(__dirname, "..", "scripts", "install-hooks.mjs");
const codexHookExample = path.join(__dirname, "..", "integrations", "codex", "hooks.example.json");
const claudeHookExample = path.join(__dirname, "..", "integrations", "claude", "settings.example.json");

test("Codex hook example follows the matcher-group schema", () => {
  const config = JSON.parse(fs.readFileSync(codexHookExample, "utf8"));
  const group = config.hooks.UserPromptSubmit[0];
  assert.ok(Array.isArray(group.hooks));
  assert.deepEqual(group.hooks[0], {
    type: "command",
    command: "node ~/.codex/hooks/evaluator-bridge.js",
    timeout: 15
  });
});

test("Claude hook example follows the matcher-group schema", () => {
  const config = JSON.parse(fs.readFileSync(claudeHookExample, "utf8"));
  const group = config.hooks.UserPromptSubmit[0];
  assert.ok(Array.isArray(group.hooks));
  assert.deepEqual(group.hooks[0], {
    type: "command",
    command: "node ~/.claude/hooks/evaluator-bridge.js",
    timeout: 15
  });
});

test("installer creates isolated Claude and Codex hook runtimes and preserves configuration", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-safety-hooks-"));
  try {
    const first = spawnSync(process.execPath, [installer, "--target=all"], { encoding: "utf8", env: { ...process.env, AI_SAFETY_INSTALL_HOME: home } });
    assert.equal(first.status, 0, first.stderr);
    for (const target of ["claude", "codex"]) {
      const hooks = path.join(home, `.${target}`, "hooks");
      assert.ok(fs.existsSync(path.join(hooks, "evaluator-bridge.js")));
      assert.ok(fs.existsSync(path.join(hooks, "ai-safety-runtime", "heuristic-evaluator.js")));
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(hooks, "ai-safety-runtime", "config.json"), "utf8")), { mode: "heuristic" });
    }

    const configPath = path.join(home, ".claude", "hooks", "ai-safety-runtime", "config.json");
    fs.writeFileSync(configPath, '{"mode":"detect"}\n');
    const second = spawnSync(process.execPath, [installer, "--target=claude"], { encoding: "utf8", env: { ...process.env, AI_SAFETY_INSTALL_HOME: home } });
    assert.equal(second.status, 0, second.stderr);
    assert.equal(JSON.parse(fs.readFileSync(configPath, "utf8")).mode, "detect");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
