"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const bundledRules = require("../plugin/src/rules.js");

test("MCP server advertises and executes the heuristic evaluator", async (context) => {
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import("@modelcontextprotocol/client"),
    import("@modelcontextprotocol/client/stdio")
  ]);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, "..", "mcp", "server.mjs")],
    env: { ...process.env, AI_SAFETY_MODE: "heuristic" },
    stderr: "pipe"
  });
  const client = new Client({ name: "ai-safety-guard-test", version: "1.0.0" });
  context.after(async () => client.close());
  await client.connect(transport);

  const tools = await client.listTools();
  const tool = tools.tools.find((item) => item.name === "evaluate_prompt");
  assert.ok(tool);
  assert.equal(tool.annotations.readOnlyHint, true);

  const response = await client.callTool({ name: "evaluate_prompt", arguments: { text: "Este é um teste CPF 111.222.111-12" } });
  assert.equal(response.structuredContent.decision, "block");
  assert.ok(response.structuredContent.categories.includes("personal"));
  assert.doesNotMatch(response.content[0].text, /111\.222\.111-12/);
});

test("local MCP uses the exported active rules catalog snapshot", async (context) => {
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import("@modelcontextprotocol/client"),
    import("@modelcontextprotocol/client/stdio")
  ]);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-safety-mcp-catalog-"));
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
  fs.writeFileSync(configPath, JSON.stringify({ mode: "heuristic", rulesCatalog: customCatalog }));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, "..", "mcp", "server.mjs")],
    env: { ...process.env, AI_SAFETY_CONFIG: configPath },
    stderr: "pipe"
  });
  const client = new Client({ name: "ai-safety-catalog-test", version: "1.0.0" });
  context.after(async () => {
    await client.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await client.connect(transport);
  const result = await client.callTool({ name: "evaluate_prompt", arguments: { text: "Review EXTENSION-CATALOG-A1B2C3" } });
  assert.equal(result.structuredContent.decision, "block", JSON.stringify(result));
  assert.ok(result.structuredContent.findings.some((finding) => finding.label === "Extension custom catalog marker"));
});
