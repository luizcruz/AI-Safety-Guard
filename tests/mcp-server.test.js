"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

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
