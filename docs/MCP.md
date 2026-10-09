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

Install Node.js 18 or newer inside WSL, download both files in Chrome, then paste this entire block into WSL:

```bash
set -euo pipefail

WINDOWS_USER="$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r\n')"
WINDOWS_HOME="/mnt/c/Users/$WINDOWS_USER"
INSTALL_DIR="$HOME/.ai-safety-guard"
SERVER="$INSTALL_DIR/ai-safety-mcp.cjs"

install -d -m 700 "$INSTALL_DIR"
install -m 600 "$WINDOWS_HOME/Downloads/ai-safety-mcp.cjs" "$SERVER"
install -m 600 "$WINDOWS_HOME/Downloads/config.json" "$INSTALL_DIR/config.json"

export AI_SAFETY_MCP_PATH="$SERVER"
CONFIGURED_CLIENTS=0

if command -v claude >/dev/null 2>&1; then
  claude mcp remove ai-safety-guard >/dev/null 2>&1 || true
  claude mcp add --scope user ai-safety-guard -- node "$SERVER"
  export AI_SAFETY_CONFIGURE_CLAUDE=1
  CONFIGURED_CLIENTS=1
fi

if command -v codex >/dev/null 2>&1; then
  codex mcp remove ai-safety-guard >/dev/null 2>&1 || true
  codex mcp add ai-safety-guard -- node "$SERVER"
  export AI_SAFETY_CONFIGURE_CODEX=1
  CONFIGURED_CLIENTS=1
fi

if [ "$CONFIGURED_CLIENTS" -eq 0 ]; then
  echo "Claude Code or Codex was not found inside WSL." >&2
  exit 1
fi

node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

function installHook(relativePath) {
  const file = path.join(process.env.HOME, relativePath);
  const config = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : {};
  const hooks = config.hooks && typeof config.hooks === "object" ? config.hooks : {};
  const current = Array.isArray(hooks.UserPromptSubmit) ? hooks.UserPromptSubmit : [];
  const command = `node "${process.env.AI_SAFETY_MCP_PATH}" --hook`;
  const aiSafetyHook = { hooks: [{ type: "command", command, timeout: 15 }] };
  config.hooks = {
    ...hooks,
    UserPromptSubmit: [
      ...current.filter((entry) => !JSON.stringify(entry).includes("ai-safety-mcp.cjs")),
      aiSafetyHook
    ]
  };
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

if (process.env.AI_SAFETY_CONFIGURE_CLAUDE === "1") installHook(".claude/settings.json");
if (process.env.AI_SAFETY_CONFIGURE_CODEX === "1") installHook(".codex/hooks.json");
NODE

if [ "${AI_SAFETY_CONFIGURE_CLAUDE:-0}" = "1" ]; then claude mcp list; fi
if [ "${AI_SAFETY_CONFIGURE_CODEX:-0}" = "1" ]; then codex mcp list; fi

echo "AI Safety Guard MCP installed successfully."
```

The script configures whichever supported clients it finds and preserves unrelated hooks. Restart each configured client afterward.

## WebMCP

The MCP tab controls browser WebMCP independently. Its `evaluate_ai_prompt` tool is registered only when MCP and Heuristic mode are enabled. During the Chrome preview, enable `chrome://flags/#enable-webmcp-testing` or use the applicable origin trial.

## Development

Regenerate the standalone artifact after changing rules, policies, or the evaluator:

```bash
npm run build:mcp
```
