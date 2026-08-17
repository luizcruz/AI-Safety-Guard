"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createServer } = require("../src/server.js");

const catalog = { version: "1.2.0", categories: { credentials: "Credenciais", personal: "Documentos pessoais" } };

async function withServer(run, upstream = defaultUpstream) {
  const calls = [];
  const server = createServer({
    config: { apiUrl: "http://rules-api:8000", apiToken: "server-secret", port: 3000 },
    fetchImpl: async (url, options) => { calls.push({ url, options }); return upstream(url, options); },
    logger: { error: () => undefined }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try { await run({ baseUrl, calls }); } finally { server.close(); await once(server, "close"); }
}

async function defaultUpstream(url, options) {
  if (url.endsWith("/v1/rulesets/latest")) return Response.json(catalog, { headers: { ETag: '"1.2.0"' } });
  if (url.endsWith("/v1/rules") && options.method === "GET") return Response.json([{ id: "keyword-1", kind: "keyword", category: "credentials", keyword: "api_key" }]);
  if (url.endsWith("/v1/rules") && options.method === "POST") return Response.json({ id: "keyword-2", ...JSON.parse(options.body) }, { status: 201, headers: { ETag: '"1.2.1"' } });
  if (url.includes("/v1/rules/") && options.method === "PUT") return Response.json({ id: "keyword-2", ...JSON.parse(options.body) }, { headers: { ETag: '"1.2.1"' } });
  if (url.includes("/v1/rules/") && options.method === "DELETE") return new Response(null, { status: 204, headers: { ETag: '"1.2.1"' } });
  return Response.json({ detail: "missing" }, { status: 404 });
}

test("serve interface, health e metadados sem expor token", async () => {
  await withServer(async ({ baseUrl, calls }) => {
    const page = await fetch(baseUrl);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Administração de regras/);
    assert.match(page.headers.get("content-security-policy"), /default-src 'self'/);
    assert.deepEqual(await (await fetch(`${baseUrl}/health`)).json(), { status: "ok" });
    const meta = await (await fetch(`${baseUrl}/admin/meta`)).json();
    assert.equal(meta.version, "1.2.0");
    assert.equal(meta.types.length, 4);
    assert.equal(meta.categories.credentials, "Credenciais");
    assert.equal(JSON.stringify(meta).includes("server-secret"), false);
    assert.equal(calls.at(-1).options.headers.Authorization, "Bearer server-secret");
  });
});

test("lista, cria, edita e remove regras com ETag", async () => {
  await withServer(async ({ baseUrl, calls }) => {
    const rules = await (await fetch(`${baseUrl}/admin/rules`)).json();
    assert.equal(rules[0].keyword, "api_key");
    const created = await fetch(`${baseUrl}/admin/rules`, {
      method: "POST", headers: { "Content-Type": "application/json", "If-Match": '"1.2.0"' },
      body: JSON.stringify({ kind: "keyword", category: "credentials", keyword: "secret" })
    });
    assert.equal(created.status, 201);
    assert.equal(calls.at(-1).options.headers["If-Match"], '"1.2.0"');
    const updated = await fetch(`${baseUrl}/admin/rules/keyword-2`, {
      method: "PUT", headers: { "Content-Type": "application/json", "If-Match": '"1.2.0"' },
      body: JSON.stringify({ kind: "keyword", category: "credentials", keyword: "updated_secret" })
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).keyword, "updated_secret");
    assert.equal(await (await fetch(`${baseUrl}/admin/rules/keyword-2`, { method: "DELETE" })).text(), "");
  });
});

test("rejeita origem externa, tipo de conteúdo e corpos grandes", async () => {
  await withServer(async ({ baseUrl }) => {
    const forbidden = await fetch(`${baseUrl}/admin/rules`, { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: "{}" });
    assert.equal(forbidden.status, 403);
    const unsupported = await fetch(`${baseUrl}/admin/rules`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
    assert.equal(unsupported.status, 415);
    const large = await fetch(`${baseUrl}/admin/rules`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "x".repeat(70_000) }) });
    assert.equal(large.status, 413);
  });
});
