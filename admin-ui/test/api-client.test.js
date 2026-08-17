"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { RulesApiClient, RulesApiError } = require("../src/api-client.js");

test("cliente autentica e encaminha corpo e controle de versão", async () => {
  let captured;
  const client = new RulesApiClient({ baseUrl: "http://api:8000", token: "secret", fetchImpl: async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ id: "rule-1" }), { status: 201, headers: { ETag: '"1.2.1"' } });
  } });
  const result = await client.request("/v1/rules", { method: "POST", body: { kind: "keyword" }, ifMatch: '"1.2.0"' });
  assert.equal(captured.url, "http://api:8000/v1/rules");
  assert.equal(captured.options.headers.Authorization, "Bearer secret");
  assert.equal(captured.options.headers["If-Match"], '"1.2.0"');
  assert.equal(JSON.parse(captured.options.body).kind, "keyword");
  assert.equal(result.etag, '"1.2.1"');
});

test("cliente normaliza erros HTTP, timeout e resposta inválida", async () => {
  const unauthorized = new RulesApiClient({ baseUrl: "http://api", token: "x", fetchImpl: async () => new Response('{"detail":"negado"}', { status: 401 }) });
  await assert.rejects(() => unauthorized.request("/v1/rules"), (error) => error instanceof RulesApiError && error.status === 401 && error.message === "negado");
  const unavailable = new RulesApiClient({ baseUrl: "http://api", token: "x", fetchImpl: async () => { throw new Error("offline"); } });
  await assert.rejects(() => unavailable.request("/v1/rules"), (error) => error.status === 502);
  const invalid = new RulesApiClient({ baseUrl: "http://api", token: "x", fetchImpl: async () => new Response("html", { status: 500 }) });
  await assert.rejects(() => invalid.request("/v1/rules"), /Resposta inválida/);
});
