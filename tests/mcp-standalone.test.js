"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const bundledRules = require("../plugin/src/rules.js");

const bundle = path.join(__dirname, "..", "plugin", "mcp", "ai-safety-mcp.cjs");

test("standalone bundle is packaged and blocks risky hook prompts", () => {
  assert.ok(fs.statSync(bundle).size > 40_000);
  const risky = spawnSync(process.execPath, [bundle, "--hook"], {
    input: JSON.stringify({ prompt: "Este é um teste CPF 111.222.111-12" }),
    encoding: "utf8",
    timeout: 5_000
  });
  assert.equal(risky.status, 2);
  assert.match(risky.stderr, /AI Safety Guard bloqueou/);
  assert.match(risky.stderr, /Documentos pessoais/);
  assert.match(risky.stderr, /Detecções: CPF/);
  assert.doesNotMatch(risky.stderr, /111\.222\.111-12/);

  const safe = spawnSync(process.execPath, [bundle, "--hook"], {
    input: JSON.stringify({ prompt: "Explain a public JavaScript API." }),
    encoding: "utf8",
    timeout: 5_000
  });
  assert.equal(safe.status, 0);
});

test("standalone bundle returns a clean Claude response with an obfuscated prompt", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-safety-standalone-redacted-"));
  try {
    const target = path.join(directory, "ai-safety-mcp.cjs");
    fs.copyFileSync(bundle, target);
    fs.writeFileSync(path.join(directory, "config.json"), JSON.stringify({ mode: "heuristic", obfuscateSensitiveData: true }));
    const result = spawnSync(process.execPath, [target, "--hook"], {
      input: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "Este é um teste CPF 111.222.111-12" }),
      encoding: "utf8",
      timeout: 5_000
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    const response = JSON.parse(result.stdout);
    assert.equal(response.decision, "block");
    assert.equal(response.hookSpecificOutput.suppressOriginalPrompt, true);
    assert.match(response.reason, /Versão ofuscada para revisar e reenviar/);
    assert.match(response.reason, /CPF \[REDACTED\]/);
    assert.doesNotMatch(response.reason, /111\.222\.111-12/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("standalone bundle reads adjacent exported configuration", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-safety-standalone-"));
  try {
    const target = path.join(directory, "ai-safety-mcp.cjs");
    fs.copyFileSync(bundle, target);
    fs.writeFileSync(path.join(directory, "config.json"), JSON.stringify({ mode: "detect" }));
    const result = spawnSync(process.execPath, [target, "--hook"], {
      input: JSON.stringify({ prompt: "CPF 111.222.111-12" }),
      encoding: "utf8",
      timeout: 5_000
    });
    assert.equal(result.status, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("standalone hook uses the exported active rules catalog snapshot", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-safety-standalone-catalog-"));
  try {
    const target = path.join(directory, "ai-safety-mcp.cjs");
    const configPath = path.join(directory, "config.json");
    const customCatalog = {
      ...bundledRules,
      version: "99.0.0",
      patterns: [...bundledRules.patterns, {
        category: "personal",
        label: "Extension custom catalog marker",
        source: "\\bEXTENSION-CATALOG-[A-Z0-9]{6}\\b",
        flags: "g",
        score: 99,
        validator: null
      }]
    };
    fs.copyFileSync(bundle, target);
    fs.writeFileSync(configPath, JSON.stringify({ mode: "heuristic", rulesCatalog: customCatalog }));
    const result = spawnSync(process.execPath, [target, "--hook"], {
      input: JSON.stringify({ prompt: "Review EXTENSION-CATALOG-A1B2C3" }),
      encoding: "utf8",
      timeout: 5_000,
      env: { ...process.env, AI_SAFETY_CONFIG: configPath }
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Extension custom catalog marker/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("standalone bundle serves MCP over stdio", async (context) => {
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import("@modelcontextprotocol/client"),
    import("@modelcontextprotocol/client/stdio")
  ]);
  const transport = new StdioClientTransport({ command: process.execPath, args: [bundle], stderr: "pipe" });
  const client = new Client({ name: "standalone-test", version: "1.0.0" });
  context.after(async () => client.close());
  await client.connect(transport);
  const tools = await client.listTools();
  assert.ok(tools.tools.some((item) => item.name === "evaluate_prompt"));
  const response = await client.callTool({ name: "evaluate_prompt", arguments: { text: "CPF 111.222.111-12" } });
  assert.equal(response.structuredContent.decision, "block");
  assert.doesNotMatch(response.content[0].text, /111\.222\.111-12/);
});
