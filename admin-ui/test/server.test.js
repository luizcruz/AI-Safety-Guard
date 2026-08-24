"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createServer, createSessionToken, hasValidSession } = require("../src/server.js");

const catalog = { version: "1.2.0", categories: { credentials: "Credenciais", personal: "Documentos pessoais" } };
const ADMIN_KEY = "admin-key-with-at-least-32-characters";

async function withServer(run, upstream = defaultUpstream) {
  const calls = [];
  const server = createServer({
    config: { apiUrl: "http://rules-api:8000", apiToken: "server-secret", adminKey: ADMIN_KEY, port: 3000 },
    fetchImpl: async (url, options) => { calls.push({ url, options }); return upstream(url, options); },
    logger: { error: () => undefined }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${baseUrl}/login`, {
    method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_key: ADMIN_KEY })
  });
  const cookie = login.headers.get("set-cookie").split(";", 1)[0];
  try { await run({ baseUrl, calls, auth: { Cookie: cookie } }); } finally { server.close(); await once(server, "close"); }
}

async function defaultUpstream(url, options) {
  if (url.endsWith("/v1/rulesets/latest")) return Response.json(catalog, { headers: { ETag: '"1.2.0"' } });
  if (new URL(url).pathname === "/v1/rules" && options.method === "GET") return Response.json([{ id: "keyword-1", kind: "keyword", category: "credentials", keyword: "api_key" }]);
  if (url.endsWith("/v1/rules") && options.method === "POST") return Response.json({ id: "keyword-2", ...JSON.parse(options.body) }, { status: 201, headers: { ETag: '"1.2.1"' } });
  if (url.includes("/v1/rules/") && options.method === "PUT") return Response.json({ id: "keyword-2", ...JSON.parse(options.body) }, { headers: { ETag: '"1.2.1"' } });
  if (url.includes("/v1/rules/") && options.method === "DELETE") return new Response(null, { status: 204, headers: { ETag: '"1.2.1"' } });
  return Response.json({ detail: "missing" }, { status: 404 });
}

test("exige chave administrativa e cria sessão segura", async () => {
  await withServer(async ({ baseUrl, auth }) => {
    const denied = await fetch(baseUrl, { redirect: "manual" });
    assert.equal(denied.status, 303);
    assert.equal(denied.headers.get("location"), "/login");
    assert.equal((await fetch(`${baseUrl}/admin/meta`)).status, 401);
    const invalid = await fetch(`${baseUrl}/login`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "access_key=invalid-access-key" });
    assert.equal(invalid.status, 401);
    assert.equal(invalid.headers.has("set-cookie"), false);
    const page = await fetch(baseUrl, { headers: auth });
    assert.equal(page.status, 200);
    const logout = await fetch(`${baseUrl}/logout`, { method: "POST", redirect: "manual", headers: auth });
    assert.equal(logout.status, 303);
    assert.match(logout.headers.get("set-cookie"), /HttpOnly; SameSite=Strict; Path=\/; Max-Age=0/);
  });
});

test("valida assinatura e expiração da sessão", () => {
  const now = Date.parse("2026-08-19T12:00:00Z");
  const token = createSessionToken(ADMIN_KEY, now);
  assert.equal(hasValidSession({ headers: { cookie: `ai_safety_admin_session=${token}` } }, ADMIN_KEY, now), true);
  assert.equal(hasValidSession({ headers: { cookie: `ai_safety_admin_session=${token}x` } }, ADMIN_KEY, now), false);
  assert.equal(hasValidSession({ headers: { cookie: `ai_safety_admin_session=${token}` } }, ADMIN_KEY, now + 8 * 60 * 60 * 1000), false);
});

test("serve interface, health e metadados sem expor token", async () => {
  await withServer(async ({ baseUrl, calls, auth }) => {
    const page = await fetch(baseUrl, { headers: auth });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Administração de regras/);
    assert.match(page.headers.get("content-security-policy"), /default-src 'self'/);
    assert.deepEqual(await (await fetch(`${baseUrl}/health`)).json(), { status: "ok" });
    const meta = await (await fetch(`${baseUrl}/admin/meta`, { headers: auth })).json();
    assert.equal(meta.version, "1.2.0");
    assert.equal(meta.types.length, 4);
    assert.deepEqual(meta.validators.map((item) => item.value), ["", "luhn", "iban", "cpf", "cnpj", "pis"]);
    assert.equal(meta.categories.credentials, "Credenciais");
    assert.equal(JSON.stringify(meta).includes("server-secret"), false);
    assert.equal(calls.at(-1).options.headers.Authorization, "Bearer server-secret");
  });
});

test("lista, cria, edita e remove regras com ETag", async () => {
  await withServer(async ({ baseUrl, calls, auth }) => {
    const rules = await (await fetch(`${baseUrl}/admin/rules`, { headers: auth })).json();
    assert.equal(rules[0].keyword, "api_key");
    const created = await fetch(`${baseUrl}/admin/rules`, {
      method: "POST", headers: { ...auth, "Content-Type": "application/json", "If-Match": '"1.2.0"' },
      body: JSON.stringify({ kind: "keyword", category: "credentials", keyword: "secret" })
    });
    assert.equal(created.status, 201);
    assert.equal(calls.at(-1).options.headers["If-Match"], '"1.2.0"');
    const updated = await fetch(`${baseUrl}/admin/rules/keyword-2`, {
      method: "PUT", headers: { ...auth, "Content-Type": "application/json", "If-Match": '"1.2.0"' },
      body: JSON.stringify({ kind: "keyword", category: "credentials", keyword: "updated_secret" })
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).keyword, "updated_secret");
    assert.equal(await (await fetch(`${baseUrl}/admin/rules/keyword-2`, { method: "DELETE", headers: auth })).text(), "");
  });
});

test("exporta regras filtradas em CSV sem expor credenciais", async () => {
  await withServer(async ({ baseUrl, calls, auth }) => {
    const response = await fetch(`${baseUrl}/admin/rules.csv?kind=keyword&category=credentials`, { headers: auth });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/csv/);
    assert.equal(response.headers.get("content-disposition"), 'attachment; filename="ai-safety-guard-rules-v1.2.0.csv"');
    const csv = await response.text();
    assert.match(csv, /"keyword-1","keyword","Palavra-chave","credentials","Credenciais"/);
    assert.equal(csv.includes("server-secret"), false);
    assert.match(calls.at(-1).url, /\/v1\/rules\?category=credentials&kind=keyword$/);
  });
});

test("rejeita origem externa, tipo de conteúdo e corpos grandes", async () => {
  await withServer(async ({ baseUrl, auth }) => {
    const forbidden = await fetch(`${baseUrl}/admin/rules`, { method: "POST", headers: { ...auth, Origin: "https://evil.example", "Content-Type": "application/json" }, body: "{}" });
    assert.equal(forbidden.status, 403);
    const unsupported = await fetch(`${baseUrl}/admin/rules`, { method: "POST", headers: { ...auth, "Content-Type": "text/plain" }, body: "{}" });
    assert.equal(unsupported.status, 415);
    const large = await fetch(`${baseUrl}/admin/rules`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ value: "x".repeat(70_000) }) });
    assert.equal(large.status, 413);
  });
});
