"use strict";

const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { createHmac, createHash, timingSafeEqual } = require("node:crypto");
const { loadConfig } = require("./config.js");
const { RulesApiClient, RulesApiError } = require("./api-client.js");
const { createRulesCsv } = require("./csv.js");

const PUBLIC_ROOT = path.resolve(__dirname, "..", "public");
const STATIC_FILES = Object.freeze({
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/auth.css": ["auth.css", "text/css; charset=utf-8"]
});
const SESSION_COOKIE = "ai_safety_admin_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const RULE_TYPES = Object.freeze([
  { value: "pattern", label: "Padrão / expressão regular" },
  { value: "keyword", label: "Palavra-chave" },
  { value: "heuristic", label: "Heurística" },
  { value: "filename", label: "Nome de arquivo" }
]);
const VALIDATORS = Object.freeze([
  { value: "", label: "Nenhum" },
  { value: "luhn", label: "Luhn" },
  { value: "iban", label: "IBAN" },
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "pis", label: "PIS/PASEP" }
]);
const HEURISTICS = Object.freeze([
  "officialDocument", "clinicalDocument", "financialStatement", "corporateContract",
  "encodedConfigSecret", "plaintextConfig", "publicCodeShare", "unmaskedPaymentLog",
  "payrollTable", "unsanitizedObservability"
]);

function setSecurityHeaders(response) {
  response.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cache-Control", "no-store");
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  response.end(value === null ? "" : JSON.stringify(value));
}

function redirect(response, location, headers = {}) {
  response.writeHead(303, { Location: location, ...headers });
  response.end();
}

function secretEquals(left, right) {
  const leftHash = createHash("sha256").update(String(left)).digest();
  const rightHash = createHash("sha256").update(String(right)).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function createSessionToken(adminKey, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const signature = createHmac("sha256", adminKey).update(String(expiresAt)).digest("base64url");
  return `${expiresAt}.${signature}`;
}

function parseCookies(header = "") {
  return Object.fromEntries(String(header).split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf("=");
    return separator < 0 ? [part, ""] : [part.slice(0, separator), part.slice(separator + 1)];
  }));
}

function hasValidSession(request, adminKey, now = Date.now()) {
  const token = parseCookies(request.headers.cookie)[SESSION_COOKIE] || "";
  const separator = token.indexOf(".");
  if (separator < 1) return false;
  const expiresAt = Number(token.slice(0, separator));
  const signature = token.slice(separator + 1);
  const nowSeconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds || expiresAt > nowSeconds + SESSION_TTL_SECONDS) return false;
  const expected = createHmac("sha256", adminKey).update(String(expiresAt)).digest("base64url");
  return secretEquals(signature, expected);
}

async function readForm(request) {
  if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    throw new RulesApiError(415, "Content-Type deve ser application/x-www-form-urlencoded");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096) throw new RulesApiError(413, "Formulário excede 4 KiB");
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

async function sendLogin(response, publicRoot, invalid = false) {
  const template = await fs.readFile(path.join(publicRoot, "login.html"), "utf8");
  const message = invalid ? '<p class="login-error" role="alert">Chave de acesso inválida.</p>' : "";
  response.writeHead(invalid ? 401 : 200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(template.replace("{{ERROR}}", message));
}

function rulesQuery(url) {
  const query = new URLSearchParams();
  if (url.searchParams.get("category")) query.set("category", url.searchParams.get("category"));
  if (url.searchParams.get("kind")) query.set("kind", url.searchParams.get("kind"));
  return query;
}

async function readJson(request) {
  if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    throw new RulesApiError(415, "Content-Type deve ser application/json");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new RulesApiError(413, "Corpo da requisição excede 64 KiB");
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
    return value;
  } catch {
    throw new RulesApiError(400, "JSON inválido");
  }
}

function verifyOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return;
  try {
    if (new URL(origin).host !== request.headers.host) throw new Error();
  } catch {
    throw new RulesApiError(403, "Origem não permitida");
  }
}

function sessionCookie(value, request, maxAge = SESSION_TTL_SECONDS) {
  const secure = request.socket.encrypted || String(request.headers["x-forwarded-proto"] || "").toLowerCase() === "https";
  return `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

function createServer({ config = loadConfig(), fetchImpl = fetch, publicRoot = PUBLIC_ROOT, logger = console } = {}) {
  const client = new RulesApiClient({ baseUrl: config.apiUrl, token: config.apiToken, fetchImpl });
  return http.createServer(async (request, response) => {
    setSecurityHeaders(response);
    try {
      const url = new URL(request.url, "http://localhost");
      if (request.method === "GET" && url.pathname === "/health") return sendJson(response, 200, { status: "ok" });

      if (request.method === "GET" && ["/styles.css", "/auth.css"].includes(url.pathname)) {
        const [name, contentType] = STATIC_FILES[url.pathname];
        const content = await fs.readFile(path.join(publicRoot, name));
        response.writeHead(200, { "Content-Type": contentType });
        return response.end(content);
      }

      if (request.method === "GET" && url.pathname === "/login") {
        if (hasValidSession(request, config.adminKey)) return redirect(response, "/");
        return sendLogin(response, publicRoot);
      }

      if (request.method === "POST" && url.pathname === "/login") {
        verifyOrigin(request);
        const form = await readForm(request);
        if (!secretEquals(form.get("access_key") || "", config.adminKey)) return sendLogin(response, publicRoot, true);
        const token = createSessionToken(config.adminKey);
        return redirect(response, "/", { "Set-Cookie": sessionCookie(token, request) });
      }

      const authenticated = hasValidSession(request, config.adminKey);
      if (request.method === "POST" && url.pathname === "/logout") {
        verifyOrigin(request);
        return redirect(response, "/login", { "Set-Cookie": sessionCookie("", request, 0) });
      }

      if (!authenticated) {
        if (url.pathname.startsWith("/admin/")) return sendJson(response, 401, { detail: "Autenticação administrativa necessária" });
        return redirect(response, "/login");
      }

      if (request.method === "GET" && STATIC_FILES[url.pathname]) {
        const [name, contentType] = STATIC_FILES[url.pathname];
        const content = await fs.readFile(path.join(publicRoot, name));
        response.writeHead(200, { "Content-Type": contentType });
        return response.end(content);
      }

      if (request.method === "GET" && url.pathname === "/admin/meta") {
        const result = await client.request("/v1/rulesets/latest");
        return sendJson(response, 200, {
          version: result.data.version,
          categories: result.data.categories,
          types: RULE_TYPES,
          validators: VALIDATORS,
          heuristics: HEURISTICS
        });
      }

      if (request.method === "GET" && url.pathname === "/admin/rules") {
        const query = rulesQuery(url);
        const result = await client.request(`/v1/rules${query.size ? `?${query}` : ""}`);
        return sendJson(response, 200, result.data);
      }

      if (request.method === "GET" && url.pathname === "/admin/rules.csv") {
        const query = rulesQuery(url);
        const [catalog, rules] = await Promise.all([
          client.request("/v1/rulesets/latest"),
          client.request(`/v1/rules${query.size ? `?${query}` : ""}`)
        ]);
        const csv = createRulesCsv(rules.data, { types: RULE_TYPES, categories: catalog.data.categories });
        const version = String(catalog.data.version).replace(/[^0-9.]/g, "") || "atual";
        response.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="ai-safety-guard-rules-v${version}.csv"`
        });
        return response.end(csv);
      }

      const match = url.pathname.match(/^\/admin\/rules(?:\/([a-z0-9-]+))?$/i);
      if (match && ["POST", "PUT", "DELETE"].includes(request.method)) {
        verifyOrigin(request);
        const id = match[1];
        if ((request.method === "POST" && id) || (request.method !== "POST" && !id)) return sendJson(response, 405, { detail: "Método não permitido" });
        const body = request.method === "DELETE" ? undefined : await readJson(request);
        const apiPath = id ? `/v1/rules/${encodeURIComponent(id)}` : "/v1/rules";
        const result = await client.request(apiPath, { method: request.method, body, ifMatch: request.headers["if-match"] });
        const headers = result.etag ? { ETag: result.etag } : {};
        return sendJson(response, request.method === "POST" ? 201 : request.method === "DELETE" ? 204 : 200, result.data, headers);
      }

      return sendJson(response, 404, { detail: "Rota não encontrada" });
    } catch (error) {
      if (error instanceof RulesApiError) return sendJson(response, error.status, { detail: error.message });
      logger.error(error);
      return sendJson(response, 500, { detail: "Erro interno do painel" });
    }
  });
}

if (require.main === module) {
  const config = loadConfig();
  createServer({ config }).listen(config.port, "0.0.0.0", () => console.log(`AI Safety Guard Admin ouvindo na porta ${config.port}`));
}

module.exports = { createServer, readJson, readForm, verifyOrigin, rulesQuery, createSessionToken, hasValidSession, secretEquals, RULE_TYPES, VALIDATORS, HEURISTICS };
