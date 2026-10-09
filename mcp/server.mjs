#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import path from "node:path";
import { fileURLToPath } from "node:url";
import evaluator from "../plugin/src/heuristic-evaluator.js";
import configModule from "./config.cjs";

export function createServer(_serverContext = {}) {
  const server = new McpServer(
    { name: "ai-safety-guard", version: "2.4.0" },
    { instructions: "Call evaluate_prompt before submitting user text to an AI. If decision is block, do not submit it; ask the user to remove or anonymize the identified categories." }
  );

  server.registerTool(
    "evaluate_prompt",
    {
      title: "Evaluate AI prompt",
      description: "Evaluate an AI prompt with all enabled AI Safety Guard deterministic and nuanced heuristic policies. No prompt text is returned.",
      inputSchema: z.object({ text: z.string().min(1).max(evaluator.MAX_TEXT_LENGTH).describe("Prompt proposed for AI submission.") }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ text }) => {
      const config = configModule.loadConfig(process.env);
      if (config.rulesCatalog) evaluator.updateCatalog(config.rulesCatalog);
      const result = evaluator.evaluatePrompt(text, config);
      const compact = compactResult(result);
      return {
        content: [{ type: "text", text: JSON.stringify(compact) }],
        structuredContent: compact
      };
    }
  );
  return server;
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

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await serveStdio(createServer);
}
