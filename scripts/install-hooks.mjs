#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installationHome = process.env.AI_SAFETY_INSTALL_HOME || os.homedir();
const requested = process.argv.find((argument) => argument.startsWith("--target="))?.split("=")[1] || "all";
const targets = requested === "all" ? ["claude", "codex"] : [requested];
if (targets.some((target) => !["claude", "codex"].includes(target))) throw new Error("Use --target=claude, --target=codex, or --target=all");

for (const target of targets) install(target);

function install(target) {
  const hooksDirectory = path.join(installationHome, `.${target}`, "hooks");
  const runtimeDirectory = path.join(hooksDirectory, "ai-safety-runtime");
  fs.mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
  fs.copyFileSync(path.join(repository, "integrations", "hooks", "evaluator-bridge.js"), path.join(hooksDirectory, "evaluator-bridge.js"));
  for (const file of ["rules.js", "detector.js", "policies.js", "protection-policy.js", "heuristic-evaluator.js"]) {
    fs.copyFileSync(path.join(repository, "plugin", "src", file), path.join(runtimeDirectory, file));
  }
  fs.copyFileSync(path.join(repository, "mcp", "config.cjs"), path.join(runtimeDirectory, "config.cjs"));
  const configPath = path.join(runtimeDirectory, "config.json");
  if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, `${JSON.stringify({ mode: "heuristic" }, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`Installed ${target} hook at ${hooksDirectory}\n`);
}
