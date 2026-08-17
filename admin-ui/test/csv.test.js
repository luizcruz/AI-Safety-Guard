"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { csvCell, createRulesCsv } = require("../src/csv.js");

test("gera CSV UTF-8 com cabeçalho e rótulos do catálogo", () => {
  const csv = createRulesCsv([
    { id: "keyword-1", kind: "keyword", category: "credentials", keyword: "api_key" },
    { id: "filename-1", kind: "filename", category: "files", label: "Configs", score: 90, file_names: [".env", "config.json"] }
  ], {
    types: [{ value: "keyword", label: "Palavra-chave" }, { value: "filename", label: "Nome de arquivo" }],
    categories: { credentials: "Credenciais", files: "Arquivos" }
  });
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.match(csv, /^\uFEFF"id","tipo","tipo_descricao"/);
  assert.match(csv, /"Palavra-chave","credentials","Credenciais"/);
  assert.match(csv, /"\.env \| config\.json"/);
  assert.ok(csv.endsWith("\r\n"));
});

test("escapa aspas, quebras de linha e fórmulas de planilha", () => {
  assert.equal(csvCell('texto "citado"\nlinha'), '"texto ""citado""\nlinha"');
  for (const value of ["=1+1", "+cmd", "-2+3", "@SUM(A1)"]) assert.equal(csvCell(value).startsWith('"\''), true);
  assert.equal(csvCell(null), '""');
});
