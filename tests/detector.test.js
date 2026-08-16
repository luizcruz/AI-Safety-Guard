"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { analyze, _internal } = require("../src/detector.js");

test("detecta documentos pessoais", () => {
  const result = analyze("CPF: 123.456.789-09\nRG: 12.345.678-X\nÓrgão Emissor: SSP");
  assert.equal(result.blocked, true);
  assert.deepEqual(new Set(result.findings.map((item) => item.label)), new Set(["CPF", "RG", "Termos sensíveis"]));
});

test("detecta CNH, PIS e passaporte", () => {
  const result = analyze("CNH: 12345678901\nPIS: 123.45678.90-1\nPassaporte AB123456");
  assert.equal(result.blocked, true);
  assert.ok(result.findings.some((item) => item.label === "CNH"));
  assert.ok(result.findings.some((item) => item.label === "PIS/PASEP"));
  assert.ok(result.findings.some((item) => item.label === "Passaporte"));
});

test("detecta documento médico por padrões combinados", () => {
  const result = analyze("Receita Médica\nCRM/SP 123456\nDiagnóstico CID-10: A09\nTomar 500 mg por dia");
  assert.equal(result.blocked, true);
  assert.ok(result.categories.includes("medical"));
});

test("detecta dados financeiros e valida cartão por Luhn", () => {
  const valid = analyze("Fatura do cartão 4111 1111 1111 1111 no valor de R$ 250,00");
  const invalid = analyze("número ilustrativo 1234 5678 9012 3456");
  assert.equal(valid.blocked, true);
  assert.ok(valid.findings.some((item) => item.label === "Cartão de pagamento"));
  assert.equal(invalid.blocked, false);
});

test("detecta chaves PIX somente com contexto", () => {
  assert.equal(analyze("Minha chave PIX: pessoa@example.com").blocked, true);
  assert.equal(analyze("Contato: pessoa@example.com").blocked, false);
});

test("detecta documento corporativo", () => {
  const result = analyze("Razão Social: ACME LTDA, CNPJ 12.345.678/0001-90. Contrato nº 12345/2026.");
  assert.equal(result.blocked, true);
  assert.ok(result.categories.includes("corporate"));
});

test("detecta credenciais críticas", () => {
  const result = analyze('AWS_KEY=AKIAIOSFODNN7EXAMPLE\n"password": "segredo-forte"');
  assert.equal(result.blocked, true);
  assert.equal(result.findings.filter((item) => item.category === "credentials").length, 2);
});

test("detecta estrutura de extrato financeiro", () => {
  const result = analyze("Banco Exemplo\nData | Histórico | Débito | Crédito | Saldo\n01/01 compra 10,00 90,00");
  assert.equal(result.blocked, true);
  assert.ok(result.findings.some((item) => item.label === "Estrutura de extrato financeiro"));
});

test("respeita categorias desativadas", () => {
  const result = analyze("CPF: 123.456.789-09", { enabledCategories: ["medical"] });
  assert.equal(result.blocked, false);
  assert.equal(result.findings.length, 0);
});

test("não bloqueia conversa comum", () => {
  const result = analyze("Explique Clean Architecture com um exemplo simples em JavaScript.");
  assert.equal(result.blocked, false);
  assert.equal(result.findings.length, 0);
});

test("redação não expõe o valor completo", () => {
  assert.equal(_internal.redact("123.456.789-09"), "123••••-09");
  assert.equal(_internal.isLuhnMatch("4111 1111 1111 1111"), true);
});
