"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { platforms, resolve } = require("../plugin/src/platforms.js");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "plugin", "manifest.json"), "utf8"));

test("resolve todos os hosts de chats suportados", () => {
  const expected = {
    "chatgpt.com": "ChatGPT",
    "chat.openai.com": "ChatGPT",
    "claude.ai": "Claude",
    "perplexity.ai": "Perplexity",
    "www.perplexity.ai": "Perplexity",
    "gemini.google.com": "Gemini",
    "copilot.microsoft.com": "Copilot",
    "www.copilot.microsoft.com": "Copilot",
    "chat.deepseek.com": "DeepSeek",
    "kimi.com": "Kimi",
    "www.kimi.com": "Kimi"
  };
  for (const [host, name] of Object.entries(expected)) assert.equal(resolve(host)?.name, name, host);
  assert.equal(resolve("example.com"), null);
  assert.equal(resolve(" COPILOT.MICROSOFT.COM ")?.name, "Copilot");
});

test("manifest injeta configuração antes do content script em todos os hosts", () => {
  const script = manifest.content_scripts[0];
  assert.equal(script.js[0], "src/platforms.js");
  assert.equal(script.js[1], "src/protection-policy.js");
  assert.equal(script.js.at(-1), "src/content.js");
  for (const entry of platforms) {
    for (const host of entry.hosts) {
      const match = `https://${host}/*`;
      assert.ok(script.matches.includes(match), match);
      assert.ok(manifest.web_accessible_resources[0].matches.includes(match), match);
    }
  }
});

test("novas plataformas possuem seletores específicos e fallback semântico", () => {
  const content = fs.readFileSync(path.join(root, "plugin", "src", "content.js"), "utf8");
  for (const host of ["copilot.microsoft.com", "chat.deepseek.com", "www.kimi.com"]) {
    const entry = resolve(host);
    assert.ok(entry.inputSelectors.length > 0, host);
    assert.ok(entry.sendSelectors.length > 0, host);
  }
  assert.match(content, /button\[type='submit'\]/);
  assert.match(content, /aria-label\*='发送'/);
  assert.match(content, /platform \? platform\.name/);
});
