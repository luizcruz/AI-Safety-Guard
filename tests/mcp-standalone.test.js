"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const bundle = path.join(__dirname, "..", "plugin", "mcp", "ai-safety-mcp.cjs");

test("standalone bundle is packaged and blocks risky hook prompts", () => {
  assert.ok(fs.statSync(bundle).size > 40_000);
  const risky = spawnSync(process.execPath, [bundle, "--hook"], {
    input: JSON.stringify({ prompt: "Este é um teste CPF 111.222.111-12" }),
    encoding: "utf8",
    timeout: 5_000
  });
  assert.equal(risky.status, 2);
  assert.match(risky.stderr, /AI Safety Guard blocked/);
  assert.doesNotMatch(risky.stderr, /111\.222\.111-12/);

  const safe = spawnSync(process.execPath, [bundle, "--hook"], {
    input: JSON.stringify({ prompt: "Explain a public JavaScript API." }),
    encoding: "utf8",
    timeout: 5_000
  });
  assert.equal(safe.status, 0);
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
