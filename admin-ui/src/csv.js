"use strict";

const COLUMNS = Object.freeze([
  ["id", (rule) => rule.id],
  ["tipo", (rule) => rule.kind],
  ["tipo_descricao", (rule, context) => context.types.get(rule.kind) || rule.kind],
  ["categoria", (rule) => rule.category],
  ["categoria_descricao", (rule, context) => context.categories[rule.category] || rule.category],
  ["rotulo", (rule) => rule.label],
  ["pontuacao", (rule) => rule.score],
  ["expressao", (rule) => rule.source],
  ["flags", (rule) => rule.flags],
  ["validador", (rule) => rule.validator],
  ["palavra_chave", (rule) => rule.keyword],
  ["heuristica", (rule) => rule.heuristic_id],
  ["nomes_arquivos", (rule) => rule.file_names]
]);

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(" | ") : value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function createRulesCsv(rules, { types, categories }) {
  const context = { types: new Map(types.map((type) => [type.value, type.label])), categories };
  const lines = [COLUMNS.map(([name]) => csvCell(name)).join(",")];
  for (const rule of rules) lines.push(COLUMNS.map(([, value]) => csvCell(value(rule, context))).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

module.exports = { COLUMNS, csvCell, createRulesCsv };
