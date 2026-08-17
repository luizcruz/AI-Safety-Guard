"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const publicRoot = path.join(__dirname, "..", "public");
const html = fs.readFileSync(path.join(publicRoot, "index.html"), "utf8");
const script = fs.readFileSync(path.join(publicRoot, "app.js"), "utf8");

test("interface contém seletores, formulário e ações CRUD", () => {
  for (const id of ["filter-kind", "filter-category", "kind", "category", "rule-form", "add-rule", "rules"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(script, /method: id \? "PUT" : "POST"/);
  assert.match(script, /method: "DELETE"/);
  assert.match(script, /"If-Match"/);
  assert.doesNotMatch(`${html}\n${script}`, /AI_SAFETY_API_TOKEN|Bearer /);
});

test("interface usa APIs seguras de texto para dados do catálogo", () => {
  assert.match(script, /textContent =/);
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML|document\.write/);
});
