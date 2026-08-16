"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const catalog = require("../src/rules.js");

test("catálogo é serializável e todas as expressões compilam", () => {
  const serialized = JSON.stringify(catalog);
  const copy = JSON.parse(serialized);
  assert.equal(copy.version, catalog.version);
  for (const rule of copy.patterns) assert.doesNotThrow(() => new RegExp(rule.source, rule.flags), rule.label);
});

test("todas as regras apontam para categorias existentes", () => {
  for (const rule of [...catalog.patterns, ...catalog.heuristics]) assert.ok(catalog.categories[rule.category], rule.category);
  for (const category of Object.keys(catalog.keywords)) assert.ok(catalog.categories[category], category);
});

test("manifest carrega catálogo antes do detector", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
  assert.deepEqual(manifest.content_scripts[0].js, ["src/rules.js", "src/detector.js", "src/content.js"]);
});

test("alerta explicita as categorias possivelmente infringidas", () => {
  const content = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");
  assert.match(content, /Possível infração nas categorias/);
  assert.match(content, /result\.categories\.map/);
});

test("identidade pública usa exclusivamente AI Safety Guard v1.0", () => {
  const root = path.join(__dirname, "..");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  const popup = fs.readFileSync(path.join(root, "src", "popup.html"), "utf8");
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  assert.equal(manifest.name, "AI Safety Guard v1.0");
  assert.equal(manifest.action.default_title, "AI Safety Guard v1.0");
  assert.doesNotMatch(`${popup}\n${readme}`, /AI Chat DLP Guard/i);
});
