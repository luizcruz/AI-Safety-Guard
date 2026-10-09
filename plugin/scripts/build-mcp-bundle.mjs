import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const modules = [
  ["./rules.js", "plugin/src/rules.js"],
  ["./detector.js", "plugin/src/detector.js"],
  ["./policies.js", "plugin/src/policies.js"],
  ["./protection-policy.js", "plugin/src/protection-policy.js"],
  ["./heuristic-evaluator.js", "plugin/src/heuristic-evaluator.js"],
  ["./standalone-entry.cjs", "mcp/standalone-entry.cjs"]
];
const definitions = modules.map(([id, relativePath]) => {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  return `${JSON.stringify(id)}: function(module, exports, require) {\n${source}\n}`;
}).join(",\n");
const bundle = `#!/usr/bin/env node\n"use strict";\nconst __modules = {\n${definitions}\n};\nconst __cache = Object.create(null);\nfunction __require(id) {\n  if (!__modules[id]) return require(id);\n  if (__cache[id]) return __cache[id].exports;\n  const module = { exports: {} };\n  __cache[id] = module;\n  __modules[id](module, module.exports, __require);\n  return module.exports;\n}\n__require("./standalone-entry.cjs");\n`;
const outputDirectory = path.join(root, "plugin", "mcp");
const outputPath = path.join(outputDirectory, "ai-safety-mcp.cjs");
if (process.argv.includes("--check")) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== bundle) throw new Error("Standalone MCP bundle is stale; run npm run build:mcp");
  process.exit(0);
}
fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(outputPath, bundle, "utf8");
