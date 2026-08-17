"use strict";

function loadConfig(environment = process.env) {
  const apiToken = String(environment.AI_SAFETY_API_TOKEN || "");
  if (apiToken.length < 16) throw new Error("AI_SAFETY_API_TOKEN deve ter pelo menos 16 caracteres");

  const apiUrl = new URL(environment.RULES_API_URL || "http://rules-api:8000");
  if (!["http:", "https:"].includes(apiUrl.protocol)) throw new Error("RULES_API_URL deve usar HTTP ou HTTPS");

  const port = Number(environment.ADMIN_PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("ADMIN_PORT inválida");

  return Object.freeze({ apiToken, apiUrl: apiUrl.origin, port });
}

module.exports = { loadConfig };
