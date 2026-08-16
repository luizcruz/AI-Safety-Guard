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

test("detecta infraestrutura e bancos de dados", () => {
  const result = analyze("DATABASE_URL=postgres://admin:secret@10.1.2.3:5432/producao");
  assert.equal(result.blocked, true);
  assert.ok(result.findings.some((item) => item.label === "String de conexão"));
  assert.ok(result.categories.includes("infrastructure"));
});

test("detecta artefatos expostos de infraestrutura", () => {
  const result = analyze("https://backup-prod.s3.amazonaws.com/dump.sql\nterraform/prod.tfstate\nredis_auth=segredo");
  assert.ok(result.findings.some((item) => item.label === "Bucket S3 exposto"));
  assert.ok(result.findings.some((item) => item.label === "Estado do Terraform"));
});

test("detecta configuração com segredo em texto puro", () => {
  const result = analyze("Arquivo .env commitado\ndb_password=segredo123");
  assert.ok(result.findings.some((item) => item.label === "Arquivo de configuração com senha em texto puro"));
});

test("detecta propriedade intelectual e compartilhamento público", () => {
  const result = analyze("CONFIDENTIAL\nhttps://gist.github.com/user/abc\n```js\nconst trade_secret = true;\n```");
  assert.equal(result.blocked, true);
  assert.ok(result.findings.some((item) => item.label === "Código potencialmente interno em compartilhamento público"));
});

test("detecta licença e pacote potencialmente proprietários", () => {
  const result = analyze("Copyright (c) 2026 ACME Corp\nimport '@acme/pacote-interno';");
  assert.ok(result.findings.some((item) => item.label === "Aviso de copyright corporativo"));
  assert.ok(result.findings.some((item) => item.label === "Pacote privado"));
});

test("detecta dados PCI e bancários globais", () => {
  const result = analyze('IBAN GB82WEST12345698765432, SWIFT DEUTDEFF e "cvv": "123"');
  assert.equal(result.blocked, true);
  assert.ok(result.findings.some((item) => item.label === "IBAN"));
  assert.ok(result.findings.some((item) => item.label === "SWIFT/BIC"));
  assert.ok(result.findings.some((item) => item.label === "CVV/CVC exposto"));
});

test("detecta payload de pagamento sem masking", () => {
  const result = analyze('application log payload {"card_number":"4111111111111111","cvv":"123"}');
  assert.ok(result.findings.some((item) => item.label === "Payload de pagamento sem mascaramento"));
});

test("detecta estrutura de folha de pagamento", () => {
  const result = analyze("folha.xlsx\nNome;CPF;Cargo;Salário\nAna;123.456.789-09;Diretora;R$ 25.000,00");
  assert.equal(result.blocked, true);
  assert.ok(result.findings.some((item) => item.label === "Tabela de RH/folha de pagamento"));
});

test("detecta matrícula funcional e termos de RH", () => {
  const result = analyze("Holerite da matrícula ABC-123456 com Bônus Executivo");
  assert.ok(result.findings.some((item) => item.label === "Matrícula funcional"));
  assert.ok(result.categories.includes("hrPayroll"));
});

test("detecta PII em telemetria e logs", () => {
  const result = analyze("Datadog request_body={nome: Ana, cpf: 123.456.789-09}\nGET /login?password=segredo");
  assert.equal(result.blocked, true);
  assert.ok(result.findings.some((item) => item.label === "Credencial em parâmetro GET"));
  assert.ok(result.findings.some((item) => item.label === "PII não sanitizada em observabilidade"));
});

test("detecta stacktrace de aplicação", () => {
  const result = analyze("Uncaught Exception\n  at handler (/app/server.js:10:15)");
  assert.ok(result.findings.some((item) => item.label === "Stacktrace"));
});

test("valida checksum IBAN", () => {
  assert.equal(_internal.isIbanMatch("GB82WEST12345698765432"), true);
  assert.equal(_internal.isIbanMatch("GB00WEST12345698765432"), false);
  assert.equal(analyze("IBAN inválido GB00WEST12345698765432").findings.some((item) => item.label === "IBAN"), false);
});

test("aplica catálogo remoto sem recarregar a página", () => {
  const remote = {
    version: "9.0.0",
    categories: { custom: "Categoria remota" },
    patterns: [{ category: "custom", label: "Regra remota", source: "REMOTE_SECRET_[0-9]+", flags: "g", score: 100, validator: null }],
    keywords: { custom: [] },
    heuristics: []
  };
  assert.equal(require("../src/detector.js").updateCatalog(remote), "9.0.0");
  const result = analyze("REMOTE_SECRET_123");
  assert.equal(result.blocked, true);
  assert.deepEqual(result.categories, ["custom"]);
});
