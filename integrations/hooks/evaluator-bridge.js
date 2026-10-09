#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MAX_INPUT_BYTES = 1_000_000;

async function main() {
  const input = await readStdin();
  const prompt = extractPrompt(input);
  if (!prompt) return;
  const { evaluator, loadConfig } = loadRuntime();
  const result = evaluator.evaluatePrompt(prompt, loadConfig(process.env));
  if (!result.blocked) return;
  const summary = {
    decision: result.decision,
    confidence: result.confidence,
    categories: result.categories,
    policyIds: result.policyIds
  };
  process.stderr.write(`AI Safety Guard blocked the prompt: ${JSON.stringify(summary)}\n`);
  process.exitCode = 2;
}

function loadRuntime() {
  const installed = path.join(__dirname, "ai-safety-runtime");
  const repository = path.resolve(__dirname, "..", "..");
  const root = fs.existsSync(path.join(installed, "heuristic-evaluator.js")) ? installed : path.join(repository, "plugin", "src");
  const configPath = fs.existsSync(path.join(installed, "config.cjs")) ? path.join(installed, "config.cjs") : path.join(repository, "mcp", "config.cjs");
  return { evaluator: require(path.join(root, "heuristic-evaluator.js")), loadConfig: require(configPath).loadConfig };
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
