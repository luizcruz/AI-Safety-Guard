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

Install Node.js 18 or newer inside WSL, download both files in Chrome, then paste this entire interactive script into WSL:

```bash
set -euo pipefail

printf '\nAI Safety Guard MCP\n1) Install or update\n2) Remove\n'
read -r -p "Choose an action [1-2]: " ACTION_OPTION
case "$ACTION_OPTION" in
  1) ACTION="install" ;;
  2) ACTION="remove" ;;
  *) echo "Invalid option." >&2; exit 1 ;;
esac

printf '\n1) Claude Code\n2) ChatGPT Codex\n3) Both\n'
read -r -p "Choose the client [1-3]: " CLIENT_OPTION
CONFIGURE_CLAUDE=0
CONFIGURE_CODEX=0
case "$CLIENT_OPTION" in
  1) CONFIGURE_CLAUDE=1 ;;
  2) CONFIGURE_CODEX=1 ;;
  3) CONFIGURE_CLAUDE=1; CONFIGURE_CODEX=1 ;;
  *) echo "Invalid option." >&2; exit 1 ;;
esac

INSTALL_DIR="$HOME/.ai-safety-guard"
SERVER="$INSTALL_DIR/ai-safety-mcp.cjs"
CONFIG_FILE="$INSTALL_DIR/config.json"

echo "[1/5] Validating environment..."
command -v node >/dev/null 2>&1 || { echo "Install Node.js 18 or newer inside WSL." >&2; exit 1; }
NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
[ "$NODE_MAJOR" -ge 18 ] || { echo "Node.js 18 or newer is required." >&2; exit 1; }

if [ "$ACTION" = "install" ]; then
  [ "$CONFIGURE_CLAUDE" -eq 0 ] || command -v claude >/dev/null 2>&1 || { echo "Claude Code was not found inside WSL." >&2; exit 1; }
  [ "$CONFIGURE_CODEX" -eq 0 ] || command -v codex >/dev/null 2>&1 || { echo "ChatGPT Codex was not found inside WSL." >&2; exit 1; }
  WINDOWS_USER="$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r\n')"
  WINDOWS_HOME="/mnt/c/Users/$WINDOWS_USER"
  DOWNLOAD_SERVER="$WINDOWS_HOME/Downloads/ai-safety-mcp.cjs"
  DOWNLOAD_CONFIG="$WINDOWS_HOME/Downloads/config.json"
  [ -f "$DOWNLOAD_SERVER" ] || { echo "File not found: $DOWNLOAD_SERVER" >&2; exit 1; }
  [ -f "$DOWNLOAD_CONFIG" ] || { echo "File not found: $DOWNLOAD_CONFIG" >&2; exit 1; }

  echo "[2/5] Installing local files..."
  install -d -m 700 "$INSTALL_DIR"
  install -m 600 "$DOWNLOAD_SERVER" "$SERVER"
  install -m 600 "$DOWNLOAD_CONFIG" "$CONFIG_FILE"
else
  echo "[2/5] Preparing removal..."
fi

echo "[3/5] Configuring MCP clients..."
if [ "$CONFIGURE_CLAUDE" -eq 1 ]; then
  if command -v claude >/dev/null 2>&1; then
    claude mcp remove ai-safety-guard >/dev/null 2>&1 || true
    [ "$ACTION" = "remove" ] || claude mcp add --scope user ai-safety-guard -- node "$SERVER"
  else
    echo "Warning: Claude Code not found; only its hook will be removed."
  fi
fi
if [ "$CONFIGURE_CODEX" -eq 1 ]; then
  if command -v codex >/dev/null 2>&1; then
    codex mcp remove ai-safety-guard >/dev/null 2>&1 || true
    [ "$ACTION" = "remove" ] || codex mcp add ai-safety-guard -- node "$SERVER"
  else
    echo "Warning: ChatGPT Codex not found; only its hook will be removed."
  fi
fi

echo "[4/5] Updating hooks without overwriting other settings..."
export AI_SAFETY_ACTION="$ACTION"
export AI_SAFETY_MCP_PATH="$SERVER"
export AI_SAFETY_CONFIGURE_CLAUDE="$CONFIGURE_CLAUDE"
export AI_SAFETY_CONFIGURE_CODEX="$CONFIGURE_CODEX"
node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

function updateHook(relativePath) {
  const file = path.join(process.env.HOME, relativePath);
  if (process.env.AI_SAFETY_ACTION === "remove" && !fs.existsSync(file)) return;
  const config = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : {};
  const hooks = config.hooks && typeof config.hooks === "object" ? config.hooks : {};
  const current = Array.isArray(hooks.UserPromptSubmit) ? hooks.UserPromptSubmit : [];
  const command = `node "${process.env.AI_SAFETY_MCP_PATH}" --hook`;
  const aiSafetyHook = { hooks: [{ type: "command", command, timeout: 15 }] };
  const next = current.filter((entry) => !JSON.stringify(entry).includes("ai-safety-mcp.cjs"));
  if (process.env.AI_SAFETY_ACTION === "install") next.push(aiSafetyHook);
  config.hooks = { ...hooks };
  if (next.length) config.hooks.UserPromptSubmit = next;
  else delete config.hooks.UserPromptSubmit;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

if (process.env.AI_SAFETY_CONFIGURE_CLAUDE === "1") updateHook(".claude/settings.json");
if (process.env.AI_SAFETY_CONFIGURE_CODEX === "1") updateHook(".codex/hooks.json");
NODE

echo "[5/5] Finishing..."
if [ "$ACTION" = "install" ]; then
  [ "$CONFIGURE_CLAUDE" -eq 0 ] || claude mcp list
  [ "$CONFIGURE_CODEX" -eq 0 ] || codex mcp list
  echo "Installation complete. Restart the selected client."
else
  if [ "$CONFIGURE_CLAUDE" -eq 1 ] && [ "$CONFIGURE_CODEX" -eq 1 ]; then
    rm -f "$SERVER" "$CONFIG_FILE"
    rmdir "$INSTALL_DIR" 2>/dev/null || true
  fi
  echo "Removal complete for the selected client."
fi
```

The script asks whether to install or remove the integration and whether to configure Claude Code, ChatGPT Codex, or both. It preserves unrelated hooks.

## WebMCP

The MCP tab controls browser WebMCP independently. Its `evaluate_ai_prompt` tool is registered only when MCP and Heuristic mode are enabled. During the Chrome preview, enable `chrome://flags/#enable-webmcp-testing` or use the applicable origin trial.

## Development

Regenerate the standalone artifact after changing rules, policies, or the evaluator:

```bash
npm run build:mcp
```
