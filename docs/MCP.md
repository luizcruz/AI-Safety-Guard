# MCP integration

AI Safety Guard provides WebMCP in Chrome and a standalone local MCP server for Claude Code and Codex. End users do not need the repository or `npm install`.

Open **AI Safety Guard > Open all settings > MCP**, download the server and current configuration, then follow the tab for your operating system. Download `config.json` again after changing categories or policies.

## Windows

Install Node.js 18 or newer on Windows. In PowerShell:

```powershell
New-Item -ItemType Directory -Force "$HOME\.ai-safety-guard"
Move-Item "$HOME\Downloads\ai-safety-mcp.cjs" "$HOME\.ai-safety-guard\ai-safety-mcp.cjs" -Force
Move-Item "$HOME\Downloads\config.json" "$HOME\.ai-safety-guard\config.json" -Force
```

Replace `SEU_USUARIO` with the Windows user name.

### Claude Code

```powershell
claude mcp add --scope user ai-safety-guard -- node "C:/Users/SEU_USUARIO/.ai-safety-guard/ai-safety-mcp.cjs"
claude mcp list
```

Merge into `~/.claude/settings.json`:

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

### Codex

```powershell
codex mcp add ai-safety-guard -- node "C:/Users/SEU_USUARIO/.ai-safety-guard/ai-safety-mcp.cjs"
codex mcp list
```

Merge into `~/.codex/hooks.json` using the same hook structure and this command:

```json
"command": "node \"C:/Users/SEU_USUARIO/.ai-safety-guard/ai-safety-mcp.cjs\" --hook"
```

## Linux (WSL)

Install Node.js 18 or newer inside WSL. Chrome downloads the files on Windows; copy them from the mounted Windows directory:

```bash
WINDOWS_USER="$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r')"
WINDOWS_HOME="/mnt/c/Users/$WINDOWS_USER"
mkdir -p "$HOME/.ai-safety-guard"
cp "$WINDOWS_HOME/Downloads/ai-safety-mcp.cjs" "$HOME/.ai-safety-guard/ai-safety-mcp.cjs"
cp "$WINDOWS_HOME/Downloads/config.json" "$HOME/.ai-safety-guard/config.json"
```

### Claude Code

```bash
claude mcp add --scope user ai-safety-guard -- node "$HOME/.ai-safety-guard/ai-safety-mcp.cjs"
claude mcp list
```

Merge into `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.ai-safety-guard/ai-safety-mcp.cjs\" --hook",
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

### Codex

```bash
codex mcp add ai-safety-guard -- node "$HOME/.ai-safety-guard/ai-safety-mcp.cjs"
codex mcp list
```

Merge into `~/.codex/hooks.json` using the same hook structure and this command:

```json
"command": "node \"$HOME/.ai-safety-guard/ai-safety-mcp.cjs\" --hook"
```

Restart the client and validate its MCP and hooks. To disable the integration, remove `UserPromptSubmit` and run the applicable command:

```bash
claude mcp remove ai-safety-guard
codex mcp remove ai-safety-guard
```

## WebMCP

The MCP tab controls browser WebMCP independently. Its `evaluate_ai_prompt` tool is registered only when MCP and Heuristic mode are enabled. During the Chrome preview, enable `chrome://flags/#enable-webmcp-testing` or use the applicable origin trial.

## Development

Regenerate the standalone artifact after changing rules, policies, or the evaluator:

```bash
npm run build:mcp
```
