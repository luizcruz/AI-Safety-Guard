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
  assert.deepEqual(manifest.content_scripts[0].js, ["src/platforms.js", "src/protection-policy.js", "src/rules.js", "src/detector.js", "src/attachments.js", "src/policies.js", "src/heuristic-evaluator.js", "src/nano.js", "src/webmcp.js", "src/content.js"]);
  assert.equal(manifest.background.service_worker, "src/background.js");
  assert.deepEqual(manifest.permissions, ["storage", "offscreen"]);
});

test("manifest referencia todos os ícones nos tamanhos corretos", () => {
  const root = path.join(__dirname, "..");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "plugin", "manifest.json"), "utf8"));
  const expected = {
    "16": "icons/ai-safety-guard-16.png",
    "32": "icons/ai-safety-guard-32.png",
    "48": "icons/ai-safety-guard-48.png",
    "128": "icons/ai-safety-guard-128.png"
  };

  assert.deepEqual(manifest.icons, expected);
  assert.deepEqual(manifest.action.default_icon, expected);

  for (const [size, relativePath] of Object.entries(expected)) {
    const png = fs.readFileSync(path.join(root, "plugin", relativePath));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], relativePath);
    assert.equal(png.readUInt32BE(16), Number(size), `${relativePath} width`);
    assert.equal(png.readUInt32BE(20), Number(size), `${relativePath} height`);
  }
});

test("bibliotecas de documentos são empacotadas localmente", () => {
  const root = path.join(__dirname, "..");
  for (const name of ["pdf.mjs", "pdf.worker.mjs", "mammoth.browser.min.mjs"]) {
    assert.ok(fs.statSync(path.join(root, "plugin", "vendor", name)).size > 100_000, name);
  }
});

test("PDF usa Web Worker real para não bloquear a interface", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "plugin", "src", "attachments.js"), "utf8");
  const pdfBundle = fs.readFileSync(path.join(__dirname, "..", "plugin", "vendor", "pdf.mjs"), "utf8");
  assert.match(source, /new root\.Worker\(workerUrl, \{ type: "module", name: "ai-safety-pdf" \}\)/);
  assert.match(source, /GlobalWorkerOptions\.workerPort/);
  assert.match(pdfBundle, /static #isWorkerDisabled = false;/);
  assert.doesNotMatch(pdfBundle, /static #isWorkerDisabled = true;/);
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
  assert.match(content, /AISafetyProtectionPolicy\.normalizeMode/);
  assert.match(content, /AISafetyProtectionPolicy\.actionFor/);
  assert.match(content, /createEmissionGate/);
  assert.match(content, /RECORD_DETECTION/);
  assert.match(content, /settings\.mode === "heuristic"\) recordAudit\(result\.findings/);
  assert.match(content, /settings\.mode === "heuristic"\) recordAudit\(findings, \{ decision: "block", confidence: 100 \}\)/);
  assert.match(content, /policyIds: Array\.isArray\(result\.policyIds\)/);
  assert.match(content, /AI Safety Guard - Aviso/);
  assert.doesNotMatch(content, /warnedDetections|recentAuditRecords|handledMode|showWarningOnce/);
});

test("conteúdo integra indicador flutuante, Gemini Nano e fallback seguro", () => {
  const content = fs.readFileSync(path.join(__dirname, "..", "plugin", "src", "content.js"), "utf8");
  assert.match(content, /createRiskIndicator\(\)/);
  assert.match(content, /ai-safety-guard-indicator/);
  assert.match(content, /right:18px!important;bottom:18px!important/);
  assert.match(content, /z-index:2147483647!important/);
  assert.match(content, /documentObserver\.observe\(document, \{ childList: true \}\)/);
  assert.match(content, /rootObserver\.observe\(observedRoot, \{ childList: true \}\)/);
  assert.doesNotMatch(content, /observer\.observe\(document, \{ childList: true, subtree: true \}\)/);
  assert.match(content, /MAX_LIVE_SCAN_CHARS = 20_000/);
  assert.match(content, /MAX_PROMPT_CHARS = 100_000/);
  assert.match(content, /button\[data-state='risk'\]/);
  assert.match(content, /obfuscatePromptInput/);
  assert.match(content, /AISafetyGuard\.obfuscate/);
  assert.match(content, /requestNano\("NANO_CLASSIFY", \{ text: originalText, policies: settings\.policies, timeoutMs: NANO_TIMEOUT_MS \}\)/);
  assert.match(content, /blockEvent\(event\);\s*inspectWithNano/);
  assert.match(content, /replaySubmission\(replay, input\)/);
  assert.match(content, /AISafetyProtectionPolicy\.DEFAULT_MODE/);
  assert.match(content, /Seu Browser não suporta modelo de IA do Chrome local|AISafetyNano\.UNSUPPORTED_MESSAGE/);
});

test("Gemini Nano em sites usa contexto offscreen da extensão", () => {
  const root = path.join(__dirname, "..", "plugin", "src");
  const html = fs.readFileSync(path.join(root, "offscreen.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "offscreen.js"), "utf8");
  assert.match(html, /<script src="policies\.js"><\/script>[\s\S]*<script src="nano\.js"><\/script>[\s\S]*<script src="offscreen\.js"><\/script>/);
  assert.match(script, /target !== "nano-offscreen"/);
  assert.match(script, /AISafetyNano\.availability\(\)/);
  assert.match(script, /AISafetyNano\.classify/);
  assert.match(script, /classificationQueue/);
});

test("página de opções apresenta os quatro níveis e instalação do Gemini Nano", () => {
  const root = path.join(__dirname, "..");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "plugin", "manifest.json"), "utf8"));
  const options = fs.readFileSync(path.join(root, "plugin", "src", "options.html"), "utf8");
  const optionsScript = fs.readFileSync(path.join(root, "plugin", "src", "options.js"), "utf8");
  assert.equal(manifest.options_ui.page, "src/options.html");
  assert.equal(manifest.options_ui.open_in_tab, true);
  assert.equal(manifest.action.default_popup, "src/popup.html");
  assert.ok(manifest.web_accessible_resources[0].resources.includes("icons/ai-safety-guard-32.png"));
  for (const tab of ["protection", "local-ai", "rules", "policies", "audit", "mcp", "server"]) {
    assert.match(options, new RegExp(`data-tab="${tab}"`));
    assert.match(options, new RegExp(`data-panel="${tab}"`));
  }
  for (const mode of ["log", "warn", "detect", "heuristic"]) assert.match(options, new RegExp(`value="${mode}"`));
  assert.match(options, /id="install-nano"/);
  assert.match(options, /id="nano-test-form"/);
  assert.match(options, /id="nano-test-input"/);
  assert.match(options, /id="nano-test-result"/);
  assert.match(options, /id="categories"/);
  assert.match(options, /id="policies-list"/);
  assert.match(options, /id="policy-form"/);
  assert.match(options, /id="policy-form-title"/);
  assert.match(options, /id="save-policy"/);
  assert.match(options, /id="cancel-policy-edit"[^>]*hidden/);
  assert.match(options, /id="restore-default-policies"[^>]*>Restaurar iniciais<\/button>/);
  assert.match(options, /id="obfuscate-sensitive-data"/);
  assert.match(options, /id="audit-status"/);
  assert.match(options, /id="audit-log-preview"[^>]*readonly/);
  assert.match(options, /id="download-audit"[^>]*>Baixar log<\/button>/);
  assert.match(options, /id="api-settings"/);
  assert.match(options, /id="mcp-enabled"[^>]*role="switch"/);
  assert.match(options, /id="download-mcp-server"[^>]*ai-safety-mcp\.cjs/);
  assert.match(options, /id="download-mcp-config"/);
  assert.match(options, /\.ai-safety-guard/);
  assert.match(options, /data-mcp-platform="windows"/);
  assert.match(options, /data-mcp-platform="wsl"/);
  assert.match(options, /data-mcp-platform-panel="windows"/);
  assert.match(options, /data-mcp-platform-panel="wsl"[^>]*hidden/);
  assert.match(options, /Linux \(WSL\)/);
  assert.match(options, /WINDOWS_USER="\$\(cmd\.exe \/c "echo %USERNAME%" 2>\/dev\/null \| tr -d '\\r'\)"/);
  assert.match(options, /WINDOWS_HOME="\/mnt\/c\/Users\/\$WINDOWS_USER"/);
  assert.match(options, /\$WINDOWS_HOME\/Downloads\/ai-safety-mcp\.cjs/);
  assert.match(options, /\$HOME\/\.ai-safety-guard\/ai-safety-mcp\.cjs/);
  assert.match(options, /claude mcp add --scope user ai-safety-guard/);
  assert.match(options, /codex mcp add ai-safety-guard/);
  assert.match(options, /claude mcp remove ai-safety-guard/);
  assert.match(options, /codex mcp remove ai-safety-guard/);
  assert.match(options, /~\/\.claude\/settings\.json/);
  assert.match(options, /~\/\.codex\/hooks\.json/);
  assert.match(options, /<script src="policies\.js"><\/script>[\s\S]*<script src="nano\.js"><\/script>/);
  assert.match(optionsScript, /AISafetyNano\.install/);
  assert.match(optionsScript, /initializeMcpPlatformTabs\(\)/);
  assert.match(optionsScript, /activateMcpPlatform\(mcpPlatformTabs\[next\]\.dataset\.mcpPlatform, true\)/);
  assert.doesNotMatch(optionsScript, /state === "available"\) \{[\s\S]{0,120}AISafetyNano\.install/);
  assert.match(optionsScript, /AISafetyNano\.classify\(message, \{ policies: heuristicPolicies \}\)/);
  assert.match(optionsScript, /AISafetyPolicies\.addPolicy/);
  assert.match(optionsScript, /AISafetyPolicies\.serializePolicies/);
  assert.match(optionsScript, /deletedDefaultPolicyIds\.add\(item\.id\)/);
  assert.match(optionsScript, /beginPolicyEdit\(item\)/);
  assert.match(optionsScript, /editingPolicyId/);
  assert.match(optionsScript, /Salvar alterações/);
  assert.match(optionsScript, /item\.id === current\.id \? value : item/);
  assert.doesNotMatch(optionsScript, /if \(!item\.builtIn\) \{\s*const remove/);
  assert.match(optionsScript, /enforceNanoAvailability/);
  assert.match(optionsScript, /obfuscateSensitiveData/);
  assert.match(optionsScript, /AISafetyAuditLog\.serialize\(entries\)/);
  assert.match(optionsScript, /AISafetyAuditLog\.download\(auditLog\)/);
  assert.match(optionsScript, /REFRESH_RULES/);
  assert.match(optionsScript, /mcpEnabled/);
  assert.match(optionsScript, /downloadJson\("config\.json"/);
  assert.doesNotMatch(options, /npm install|scripts\/install-hooks|CAMINHO\\AISafety|mcp\/server\.mjs/);
  assert.match(optionsScript, /ArrowRight/);
});

test("popup permite selecionar nível por controle deslizante", () => {
  const root = path.join(__dirname, "..");
  const popup = fs.readFileSync(path.join(root, "plugin", "src", "popup.html"), "utf8");
  const popupScript = fs.readFileSync(path.join(root, "plugin", "src", "popup.js"), "utf8");
  assert.match(popup, /id="mode-slider"[^>]*type="range"[^>]*min="0"[^>]*max="3"/);
  for (const label of ["Registrar", "Avisar", "Detecção", "Heurística"]) assert.match(popup, new RegExp(label));
  assert.match(popup, /id="open-options"[^>]*>Abrir todas as configurações<\/button>/);
  assert.match(popupScript, /AISafetyNano\.availability\(\)/);
  assert.match(popupScript, /enforceNanoAvailability/);
  assert.match(popupScript, /chrome\.storage\.sync\.set\(\{ mode \}\)/);
  assert.match(popupScript, /chrome\.runtime\.openOptionsPage\(\)/);
});

test("identidade pública usa exclusivamente AI Safety Guard v2.0", () => {
  const root = path.join(__dirname, "..");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "plugin", "manifest.json"), "utf8"));
  const packageManifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const options = fs.readFileSync(path.join(root, "plugin", "src", "options.html"), "utf8");
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  assert.equal(manifest.version, "2.0.0");
  assert.equal(packageManifest.version, manifest.version);
  assert.equal(packageLock.version, manifest.version);
  assert.equal(packageLock.packages[""].version, manifest.version);
  assert.equal(manifest.name, "AI Safety Guard v2.0");
  assert.equal(manifest.action.default_title, "AI Safety Guard v2.0");
  assert.doesNotMatch(`${options}\n${readme}`, /AI Chat DLP Guard/i);
});
