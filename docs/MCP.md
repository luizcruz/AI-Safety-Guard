# MCP integration

AI Safety Guard provides WebMCP in Chrome and a standalone local MCP server for Claude Code and Codex. No repository checkout or `npm install` is required for end users.

## Download from the extension

1. Open **AI Safety Guard > Open all settings > MCP**.
2. Select **Download MCP server** and **Download current configuration**.
3. Install Node.js 18 or newer.
4. Move both downloads to a permanent directory.

PowerShell:

```powershell
New-Item -ItemType Directory -Force "$HOME\.ai-safety-guard"
Move-Item "$HOME\Downloads\ai-safety-mcp.cjs" "$HOME\.ai-safety-guard\ai-safety-mcp.cjs" -Force
Move-Item "$HOME\Downloads\config.json" "$HOME\.ai-safety-guard\config.json" -Force
```

The downloaded `config.json` contains the extension's currently enabled categories and heuristic policies. Download it again after changing those settings.

## Claude Code

Replace `SEU_USUARIO` with the Windows user name:

```powershell
claude mcp add --scope user ai-safety-guard -- node "C:/Users/SEU_USUARIO/.ai-safety-guard/ai-safety-mcp.cjs"
claude mcp list
```

Merge this into `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"C:/Users/SEU_USUARIO/.ai-safety-guard/ai-safety-mcp.cjs\" --hook",
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

Restart Claude Code. Use `/hooks` and `/mcp` to validate. To disable it, remove the `UserPromptSubmit` group and run:

```powershell
claude mcp remove ai-safety-guard
```

## Codex

```powershell
codex mcp add ai-safety-guard -- node "C:/Users/SEU_USUARIO/.ai-safety-guard/ai-safety-mcp.cjs"
codex mcp list
```

Merge this into `~/.codex/hooks.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"C:/Users/SEU_USUARIO/.ai-safety-guard/ai-safety-mcp.cjs\" --hook",
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

Restart Codex, run `/hooks`, and trust the hook. To disable it, remove the `UserPromptSubmit` group and run:

```powershell
codex mcp remove ai-safety-guard
```

## WebMCP

The MCP tab controls browser WebMCP independently. Its `evaluate_ai_prompt` tool is registered only when both MCP and Heuristic mode are enabled. During the Chrome preview, enable `chrome://flags/#enable-webmcp-testing` or use the applicable origin trial.

## Development

Regenerate the standalone artifact after changing rules, policies, or the evaluator:

```bash
npm run build:mcp
```
