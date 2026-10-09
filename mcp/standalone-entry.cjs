"use strict";

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const evaluator = require("./heuristic-evaluator.js");
const detector = require("./detector.js");

const TOOL_NAME = "evaluate_prompt";
const MAX_CONFIG_BYTES = 256_000;
const MAX_MESSAGE_BYTES = 1_000_000;

if (process.argv.includes("--hook")) runHook().catch(failHook);
else runServer();

function runServer() {
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on("line", async (line) => {
    if (Buffer.byteLength(line, "utf8") > MAX_MESSAGE_BYTES) return writeError(null, -32600, "Request is too large");
    let request;
    try { request = JSON.parse(line); } catch { return writeError(null, -32700, "Parse error"); }
    if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") return writeError(request && request.id, -32600, "Invalid Request");
    if (request.id === undefined) return;
    try {
      writeResult(request.id, await handleRequest(request));
    } catch (error) {
      writeError(request.id, -32603, safeMessage(error));
    }
  });
}

async function handleRequest(request) {
  if (request.method === "initialize") {
    return {
      protocolVersion: request.params && request.params.protocolVersion || "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "ai-safety-guard", version: "2.4.0" },
      instructions: "Call evaluate_prompt before submitting user text to an AI. Do not submit prompts whose decision is block."
    };
  }
  if (request.method === "ping") return {};
  if (request.method === "tools/list") return { tools: [toolDefinition()] };
  if (request.method === "tools/call") return callTool(request.params);
  throw new Error(`Unsupported method: ${request.method}`);
}

function toolDefinition() {
  return {
    name: TOOL_NAME,
    title: "Evaluate AI prompt",
    description: "Evaluate an AI prompt with AI Safety Guard deterministic and nuanced heuristic policies. Prompt text is never returned.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", minLength: 1, maxLength: evaluator.MAX_TEXT_LENGTH, description: "Prompt proposed for AI submission." } },
      required: ["text"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  };
}

function callTool(params) {
  if (!params || params.name !== TOOL_NAME) throw new Error("Unknown tool");
  const text = params.arguments && params.arguments.text;
  if (typeof text !== "string") throw new Error("text must be a string");
  const result = evaluator.evaluatePrompt(text, loadConfig());
  const compact = compactResult(result);
  return { content: [{ type: "text", text: JSON.stringify(compact) }], structuredContent: compact };
}

async function runHook() {
  const raw = await readAllStdin();
  if (!raw.trim()) return;
  let payload;
  try { payload = JSON.parse(raw); } catch { payload = raw; }
  const prompt = extractPrompt(payload);
  if (!prompt) return;
  const config = loadConfig();
  const result = evaluator.evaluatePrompt(prompt, config);
  if (!result.blocked) return;
  const reason = formatBlockReason(prompt, result, config);
  if (payload && payload.hook_event_name === "UserPromptSubmit") {
    process.stdout.write(`${JSON.stringify({
      decision: "block",
      reason,
      hookSpecificOutput: { hookEventName: "UserPromptSubmit", suppressOriginalPrompt: true }
    })}\n`);
    return;
  }
  process.stderr.write(`${reason}\n`);
  process.exitCode = 2;
}

function loadConfig() {
  const configuredPath = process.env.AI_SAFETY_CONFIG || path.join(__dirname, "config.json");
  let stored = {};
  if (fs.existsSync(configuredPath)) {
    const stat = fs.statSync(configuredPath);
    if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) throw new Error("Invalid AI Safety configuration file");
    stored = JSON.parse(fs.readFileSync(configuredPath, "utf8"));
  }
  const config = {
    mode: process.env.AI_SAFETY_MODE || stored.mode || "heuristic",
    enabledCategories: Array.isArray(stored.enabledCategories) ? stored.enabledCategories : undefined,
    obfuscateSensitiveData: stored.obfuscateSensitiveData === true,
    policies: Array.isArray(stored.policies) ? stored.policies : undefined
  };
  if (stored.rulesCatalog) detector.updateCatalog(stored.rulesCatalog);
  return config;
}

function formatBlockReason(prompt, result, config) {
  const categoryLabels = result.categories.map((category) => detector.CATEGORIES[category] || category);
  const findingLabels = [...new Set(result.findings.map((finding) => finding.label).filter(Boolean))];
  const lines = [
    "🛡️ AI Safety Guard bloqueou o envio para proteger dados sensíveis.",
    `Confiança: ${Math.round(result.confidence)}%`,
    `Categorias: ${categoryLabels.join(", ") || "Risco não classificado"}`,
    `Detecções: ${findingLabels.join(", ") || "Política heurística"}`,
    "O prompt original não foi enviado ao modelo."
  ];
  if (result.policyIds.length) lines.splice(4, 0, `Políticas: ${result.policyIds.join(", ")}`);
  if (config.obfuscateSensitiveData === true) {
    const obfuscated = evaluator.obfuscatePrompt(prompt, result, config);
    if (obfuscated) lines.push("", "Versão ofuscada para revisar e reenviar:", sanitizePreview(obfuscated));
    else lines.push("", "A ofuscação automática não encontrou um trecho substituível. Revise o conteúdo antes de reenviar.");
  } else {
    lines.push("Ative a ofuscação no plugin e baixe novamente o config.json para receber uma versão com [REDACTED].");
  }
  return lines.join("\n");
}

function sanitizePreview(value) {
  const clean = String(value).replace(/\x1B(?:\[[0-?]*[ -\/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  return clean.length > 4_000 ? `${clean.slice(0, 4_000)}\n[… conteúdo ofuscado truncado …]` : clean;
}

function compactResult(result) {
  return {
    enabled: result.enabled,
    mode: result.mode,
    decision: result.decision,
    blocked: result.blocked,
    confidence: result.confidence,
    categories: result.categories,
    policyIds: result.policyIds,
    findings: result.findings.slice(0, 8).map(({ source, category, label, score, policyId }) => ({ source, category, label, score, ...(policyId ? { policyId } : {}) })),
    engines: result.engines
  };
}

function extractPrompt(input) {
  if (typeof input === "string") return input.trim();
  if (!input || typeof input !== "object") return "";
  for (const key of ["prompt", "user_prompt", "userPrompt", "message", "input"]) if (typeof input[key] === "string") return input[key].trim();
  if (Array.isArray(input.messages)) {
    const message = [...input.messages].reverse().find((item) => item && item.role === "user" && typeof item.content === "string");
    if (message) return message.content.trim();
  }
  return "";
}

function readAllStdin() {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    process.stdin.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_MESSAGE_BYTES) {
        reject(new Error("Hook input is too large"));
        process.stdin.destroy();
      } else chunks.push(chunk);
    });
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

function writeResult(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function writeError(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: id === undefined ? null : id, error: { code, message } })}\n`);
}

function safeMessage(error) {
  return String(error && error.message || "Internal error").replace(/[\r\n]+/g, " ").slice(0, 240);
}

function failHook(error) {
  process.stderr.write(`AI Safety Guard evaluation failed: ${safeMessage(error)}\n`);
  process.exitCode = 2;
}
