#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MAX_INPUT_BYTES = 1_000_000;

async function main() {
  const input = await readStdin();
  const prompt = extractPrompt(input);
  if (!prompt) return;
  const { evaluator, detector, loadConfig } = loadRuntime();
  const config = loadConfig(process.env);
  const result = evaluator.evaluatePrompt(prompt, config);
  if (!result.blocked) return;
  const reason = formatBlockReason(prompt, result, config, evaluator, detector);
  if (input && input.hook_event_name === "UserPromptSubmit") {
    process.stdout.write(`${JSON.stringify({ decision: "block", reason, hookSpecificOutput: { hookEventName: "UserPromptSubmit", suppressOriginalPrompt: true } })}\n`);
    return;
  }
  process.stderr.write(`${reason}\n`);
  process.exitCode = 2;
}

function loadRuntime() {
  const installed = path.join(__dirname, "ai-safety-runtime");
  const repository = path.resolve(__dirname, "..", "..");
  const root = fs.existsSync(path.join(installed, "heuristic-evaluator.js")) ? installed : path.join(repository, "plugin", "src");
  const configPath = fs.existsSync(path.join(installed, "config.cjs")) ? path.join(installed, "config.cjs") : path.join(repository, "mcp", "config.cjs");
  return { evaluator: require(path.join(root, "heuristic-evaluator.js")), detector: require(path.join(root, "detector.js")), loadConfig: require(configPath).loadConfig };
}

function formatBlockReason(prompt, result, config, evaluator, detector) {
  const categories = result.categories.map((category) => detector.CATEGORIES[category] || category);
  const detections = [...new Set(result.findings.map((finding) => finding.label).filter(Boolean))];
  const lines = [
    "🛡️ AI Safety Guard bloqueou o envio para proteger dados sensíveis.",
    `Confiança: ${Math.round(result.confidence)}%`,
    `Categorias: ${categories.join(", ") || "Risco não classificado"}`,
    `Detecções: ${detections.join(", ") || "Política heurística"}`,
    "O prompt original não foi enviado ao modelo."
  ];
  if (result.policyIds.length) lines.splice(4, 0, `Políticas: ${result.policyIds.join(", ")}`);
  if (config.obfuscateSensitiveData === true) {
    const obfuscated = evaluator.obfuscatePrompt(prompt, result, config);
    if (obfuscated) lines.push("", "Versão ofuscada para revisar e reenviar:", obfuscated.slice(0, 4_000));
    else lines.push("", "A ofuscação automática não encontrou um trecho substituível. Revise o conteúdo antes de reenviar.");
  } else lines.push("Ative a ofuscação no plugin e atualize o config.json para receber uma versão com [REDACTED].");
  return lines.join("\n");
}

function extractPrompt(input) {
  if (typeof input === "string") return input.trim();
  if (!input || typeof input !== "object") return "";
  for (const key of ["prompt", "user_prompt", "userPrompt", "message"]) {
    if (typeof input[key] === "string") return input[key].trim();
  }
  if (typeof input.input === "string") return input.input.trim();
  if (Array.isArray(input.messages)) {
    const message = [...input.messages].reverse().find((item) => item && item.role === "user" && typeof item.content === "string");
    if (message) return message.content.trim();
  }
  return "";
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    process.stdin.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_INPUT_BYTES) {
        reject(new Error("Hook input is too large"));
        process.stdin.destroy();
        return;
      }
      chunks.push(chunk);
    });
    process.stdin.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve("");
      try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
    });
    process.stdin.on("error", reject);
  });
}

main().catch((error) => {
  process.stderr.write(`AI Safety Guard evaluation failed: ${error.message}\n`);
  process.exitCode = 2;
});
