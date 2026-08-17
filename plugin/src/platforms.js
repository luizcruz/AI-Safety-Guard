(function exposePlatforms(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AISafetyPlatforms = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlatforms() {
  "use strict";

  const platforms = Object.freeze([
    platform("chatgpt", "ChatGPT", ["chatgpt.com", "chat.openai.com"]),
    platform("claude", "Claude", ["claude.ai"]),
    platform("perplexity", "Perplexity", ["perplexity.ai", "www.perplexity.ai"]),
    platform("gemini", "Gemini", ["gemini.google.com"]),
    platform("copilot", "Copilot", ["copilot.microsoft.com", "www.copilot.microsoft.com"], [
      "textarea[data-testid='composer-input']",
      "textarea#userInput"
    ], [
      "button[data-testid='composer-submit-button']",
      "button[data-testid='submit-button']"
    ]),
    platform("deepseek", "DeepSeek", ["chat.deepseek.com"], [
      "textarea#chat-input",
      "textarea[data-testid='chat-input']",
      "[contenteditable='true'][data-testid='chat-input']"
    ], [
      "button[data-testid='send-button']",
      "button[data-testid='chat-input-send-button']"
    ]),
    platform("kimi", "Kimi", ["kimi.com", "www.kimi.com"], [
      ".chat-input-editor[contenteditable='true']"
    ], [
      "button[data-testid='send-button']",
      "button[aria-label*='发送']",
      "button.send-button"
    ])
  ]);

  const byHost = new Map(platforms.flatMap((entry) => entry.hosts.map((host) => [host, entry])));

  function platform(id, name, hosts, inputSelectors = [], sendSelectors = []) {
    return Object.freeze({
      id,
      name,
      hosts: Object.freeze(hosts),
      inputSelectors: Object.freeze(inputSelectors),
      sendSelectors: Object.freeze(sendSelectors)
    });
  }

  function resolve(hostname) {
    return byHost.get(String(hostname || "").trim().toLowerCase()) || null;
  }

  return Object.freeze({ platforms, resolve });
});
