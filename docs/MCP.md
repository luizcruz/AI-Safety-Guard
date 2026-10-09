# MCP integration

AI Safety Guard provides two local integrations:

- **WebMCP** registers `evaluate_ai_prompt` on supported Chrome pages only while **Heuristic** mode is enabled.
- **MCP stdio** registers `evaluate_prompt` for Claude Code and Codex.

Both run deterministic rules and every enabled nuanced policy locally. Outputs contain risk metadata, never the submitted prompt. Browser WebMCP also requests Gemini Nano semantic analysis.

## Requirements

- Node.js 18 or newer.
- `npm install` in the repository.
- For WebMCP, a compatible Chrome build. During the preview, enable `chrome://flags/#enable-webmcp-testing` or use the applicable origin trial.

## Install prompt hooks

```bash
node scripts/install-hooks.mjs --target=all
```

This copies the bridge and its rule runtime to `~/.claude/hooks` and `~/.codex/hooks`. Existing runtime configuration is preserved.

Claude Code settings:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "node ~/.claude/hooks/evaluator-bridge.js",
        "timeout": 15
      }
    ]
  }
}
```

Codex settings:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.codex/hooks/evaluator-bridge.js",
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

Save or merge this object into `~/.codex/hooks.json`, then open `/hooks` in Codex to review and trust it. The extra `hooks` nesting is required by Codex's matcher-group schema.

The hook exits with code `2` when a prompt is blocked. It stays inactive when its configured mode is not `heuristic`.

## Add the MCP server

Claude Code:

```bash
claude mcp add --scope user ai-safety-guard --env AI_SAFETY_MODE=heuristic -- node /absolute/path/to/AISafety/mcp/server.mjs
```

Alternatively, merge [`integrations/claude/mcp.example.json`](../integrations/claude/mcp.example.json) into the relevant MCP configuration.

Codex `config.toml`:

```toml
[mcp_servers.ai-safety-guard]
command = "node"
args = ["/absolute/path/to/AISafety/mcp/server.mjs"]
env = { AI_SAFETY_MODE = "heuristic" }
```

An equivalent file is available at [`integrations/codex/config.toml.example`](../integrations/codex/config.toml.example).

## Configuration

Set `AI_SAFETY_MODE=heuristic`. To customize categories or policies, copy [`mcp/config.example.json`](../mcp/config.example.json) and set `AI_SAFETY_CONFIG` to its absolute path. Installed hooks use `ai-safety-runtime/config.json` by default.

WebMCP follows the extension's protection level, categories, and policies automatically. Disabling Heuristic mode unregisters its tool.
