"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const catalog = require("../plugin/src/rules.js");

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
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "plugin", "manifest.json"), "utf8"));
  assert.deepEqual(manifest.content_scripts[0].js, ["src/platforms.js", "src/rules.js", "src/detector.js", "src/attachments.js", "src/content.js"]);
  assert.equal(manifest.background.service_worker, "src/background.js");
  assert.deepEqual(manifest.permissions, ["storage"]);
});

test("bibliotecas de documentos são empacotadas localmente", () => {
  const root = path.join(__dirname, "..");
  for (const name of ["pdf.mjs", "pdf.worker.mjs", "mammoth.browser.min.mjs"]) {
    assert.ok(fs.statSync(path.join(root, "plugin", "vendor", name)).size > 100_000, name);
  }
});

test("worker PDF é carregado antes da biblioteca para evitar worker blob", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "plugin", "src", "attachments.js"), "utf8");
  const pdfBundle = fs.readFileSync(path.join(__dirname, "..", "plugin", "vendor", "pdf.mjs"), "utf8");
  const workerImport = source.indexOf("await import(workerUrl)");
  const pdfImport = source.indexOf('await import(root.chrome.runtime.getURL("vendor/pdf.mjs"))');
  assert.ok(workerImport >= 0 && pdfImport > workerImport);
  assert.match(pdfBundle, /static #isWorkerDisabled = true;/);
  assert.doesNotMatch(pdfBundle, /static #isWorkerDisabled = false;/);
});

test("seed da API corresponde ao catálogo embarcado", () => {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "api", "seed-ruleset.json"), "utf8"));
  assert.deepEqual(seed, catalog);
});

test("catálogo contém os nomes de arquivos sensíveis iniciais", () => {
  assert.equal(catalog.fileNameRules.length, 7);
  assert.equal(catalog.fileNameRules.reduce((total, rule) => total + rule.names.length, 0), 79);
  assert.ok(catalog.fileNameRules.every((rule) => rule.category === "sensitiveFileNames"));
});

test("alerta explicita as categorias possivelmente infringidas", () => {
  const content = fs.readFileSync(path.join(__dirname, "..", "plugin", "src", "content.js"), "utf8");
  assert.match(content, /AI Safety Guard - Envio bloqueado/);
  assert.match(content, /Possível dado sensível detectado\. Remova ou anonimize os dados abaixo antes de tentar novamente\./);
  assert.match(content, /Possível infração nas categorias/);
  assert.match(content, /result\.categories\.map/);
  assert.match(content, /captureDroppedFiles/);
  assert.match(content, /finding\.source/);
  assert.match(content, /document\.addEventListener\("input", captureFileInput, true\)/);
  assert.match(content, /blockEvent\(event\);[\s\S]*attachments\.wait\(ids\)/);
  assert.match(content, /dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
  assert.match(content, /mode: \["block", "warn", "log"\]/);
  assert.match(content, /RECORD_DETECTION/);
  assert.match(content, /AI Safety Guard - Aviso/);
});

test("popup apresenta regras e modos operacionais", () => {
  const popup = fs.readFileSync(path.join(__dirname, "..", "plugin", "src", "popup.html"), "utf8");
  const popupScript = fs.readFileSync(path.join(__dirname, "..", "plugin", "src", "popup.js"), "utf8");
  assert.match(popup, /<h2>Regras<\/h2>/);
  assert.match(popup, /<h2>Modo de bloqueio<\/h2>/);
  for (const mode of ["block", "warn", "log"]) assert.match(popup, new RegExp(`value="${mode}"`));
  assert.match(popup, /id="audit-status"/);
  assert.match(popup, /id="download-audit"[^>]*>Download log<\/button>/);
  assert.match(popup, /<script src="audit-log\.js"><\/script>/);
  assert.match(popupScript, /chrome\.storage\.local\.get\(\{ auditLog: \[\] \}\)/);
  assert.match(popupScript, /AISafetyAuditLog\.download\(auditLog\)/);
  assert.doesNotMatch(popup, /Bloqueio local de dados sensíveis em prompts e anexos PDF\/DOCX\/DOC\./);
});

test("identidade pública usa exclusivamente AI Safety Guard v1.2", () => {
  const root = path.join(__dirname, "..");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "plugin", "manifest.json"), "utf8"));
  const packageManifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const popup = fs.readFileSync(path.join(root, "plugin", "src", "popup.html"), "utf8");
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  assert.equal(manifest.version, "1.2.4");
  assert.equal(packageManifest.version, manifest.version);
  assert.equal(packageLock.version, manifest.version);
  assert.equal(packageLock.packages[""].version, manifest.version);
  assert.equal(manifest.name, "AI Safety Guard v1.2");
  assert.equal(manifest.action.default_title, "AI Safety Guard v1.2");
  assert.doesNotMatch(`${popup}\n${readme}`, /AI Chat DLP Guard/i);
});
