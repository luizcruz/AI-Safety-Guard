# MCP integration

AI Safety Guard provides WebMCP in Chrome and a standalone local MCP server for Claude Code and Codex. End users do not need the repository or `npm install`.

Open **AI Safety Guard > Open all settings > MCP**, download the server and current configuration, then follow the tab for your operating system. Download `config.json` again after changing categories, policies, or obfuscation.

When obfuscation is enabled, a blocked Claude Code prompt is hidden from the block message and a `[REDACTED]` version is shown for review and manual resubmission. Claude Code `UserPromptSubmit` hooks cannot replace the submitted prompt automatically.

## Windows

Install Node.js 18 or newer and Claude Code and/or Codex. Download the server and `config.json` from the extension, then paste this complete script into PowerShell:

```powershell
$ErrorActionPreference = "Stop"

Write-Host "`nAI Safety Guard MCP`n1) Install or update`n2) Remove"
$actionOption = Read-Host "Choose an action [1-2]"
if ($actionOption -notin @("1", "2")) { throw "Invalid option." }
$action = if ($actionOption -eq "1") { "install" } else { "remove" }

Write-Host "`n1) Claude Code`n2) ChatGPT Codex`n3) Both"
$clientOption = Read-Host "Choose the client [1-3]"
if ($clientOption -notin @("1", "2", "3")) { throw "Invalid option." }
$clients = switch ($clientOption) {
  "1" { @("claude") }
  "2" { @("codex") }
  "3" { @("claude", "codex") }
}

$installDir = Join-Path $HOME ".ai-safety-guard"
$server = Join-Path $installDir "ai-safety-mcp.cjs"
$configFile = Join-Path $installDir "config.json"

Write-Host "[1/5] Checking requirements..."
if ($action -eq "install") {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Install Node.js 18 or newer on Windows." }
  $nodeVersionText = & node -p "process.versions.node"
  $nodeVersion = [version]($nodeVersionText.Trim())
  if ($nodeVersion.Major -lt 18) { throw "Node.js 18 or newer is required." }
  foreach ($client in $clients) {
    if (-not (Get-Command $client -ErrorAction SilentlyContinue)) { throw "$client was not found in PATH." }
  }
}

if ($action -eq "install") {
  Write-Host "[2/5] Installing local files..."
  $downloads = Join-Path $HOME "Downloads"
  $serverDownload = Join-Path $downloads "ai-safety-mcp.cjs"
  $configDownload = Join-Path $downloads "config.json"
  if (-not (Test-Path $serverDownload -PathType Leaf)) { $serverDownload = Read-Host "Full path to ai-safety-mcp.cjs" }
  if (-not (Test-Path $configDownload -PathType Leaf)) { $configDownload = Read-Host "Full path to config.json" }
  if (-not (Test-Path $serverDownload -PathType Leaf)) { throw "MCP server not found: $serverDownload" }
  if (-not (Test-Path $configDownload -PathType Leaf)) { throw "config.json not found: $configDownload" }
  Get-Content -LiteralPath $configDownload -Raw | ConvertFrom-Json | Out-Null
  New-Item -ItemType Directory -Path $installDir -Force | Out-Null
  Copy-Item -LiteralPath $serverDownload -Destination $server -Force
  Copy-Item -LiteralPath $configDownload -Destination $configFile -Force
} else {
  Write-Host "[2/5] Preparing removal..."
}

function Update-AiSafetyHook([string]$client, [string]$operation, [string]$serverPath) {
  $relativePath = if ($client -eq "claude") { ".claude/settings.json" } else { ".codex/hooks.json" }
  $settingsPath = Join-Path $HOME $relativePath
  $settingsDirectory = Split-Path -Parent $settingsPath
  if ($operation -eq "remove" -and -not (Test-Path $settingsPath -PathType Leaf)) { return }
  if (Test-Path $settingsPath -PathType Leaf) { $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json }
  else { $settings = ConvertFrom-Json "{}" }
  if (-not $settings.PSObject.Properties["hooks"]) { $settings | Add-Member -MemberType NoteProperty -Name hooks -Value ([pscustomobject]@{}) }
  $hooks = $settings.hooks
  $current = @()
  if ($hooks.PSObject.Properties["UserPromptSubmit"]) { $current = @($hooks.UserPromptSubmit) }
  $next = @($current | Where-Object {
    $entryJson = ConvertTo-Json -InputObject $_ -Depth 50 -Compress
    $entryJson -notmatch [regex]::Escape("ai-safety-mcp.cjs")
  })
  if ($operation -eq "install") {
    $handler = [pscustomobject]@{ type = "command"; command = "node `"$serverPath`" --hook"; timeout = 15 }
    $next += [pscustomobject]@{ hooks = @($handler) }
  }
  if ($next.Count -gt 0) { $hooks | Add-Member -MemberType NoteProperty -Name UserPromptSubmit -Value @($next) -Force }
  else { $hooks.PSObject.Properties.Remove("UserPromptSubmit") }
  New-Item -ItemType Directory -Path $settingsDirectory -Force | Out-Null
  $temporaryPath = "$settingsPath.$PID.tmp"
  ConvertTo-Json -InputObject $settings -Depth 100 | Set-Content -LiteralPath $temporaryPath -Encoding UTF8
  Move-Item -LiteralPath $temporaryPath -Destination $settingsPath -Force
}

Write-Host "[3/5] Configuring MCP..."
foreach ($client in $clients) {
  $available = Get-Command $client -ErrorAction SilentlyContinue
  if ($action -eq "remove") {
    if ($available) { & $client mcp remove ai-safety-guard 2>$null; $global:LASTEXITCODE = 0 }
  } elseif ($client -eq "claude") {
    & claude mcp remove ai-safety-guard 2>$null; $global:LASTEXITCODE = 0
    & claude mcp add --scope user ai-safety-guard -- node $server
    if ($LASTEXITCODE -ne 0) { throw "Could not register MCP in Claude Code." }
  } else {
    & codex mcp remove ai-safety-guard 2>$null; $global:LASTEXITCODE = 0
    & codex mcp add ai-safety-guard -- node $server
    if ($LASTEXITCODE -ne 0) { throw "Could not register MCP in Codex." }
  }
}

Write-Host "[4/5] Updating selected hooks..."
foreach ($client in $clients) { Update-AiSafetyHook -client $client -operation $action -serverPath $server }

Write-Host "[5/5] Finishing..."
if ($action -eq "install") {
  foreach ($client in $clients) { & $client mcp list }
  Write-Host "Installation complete. Restart the selected clients."
} else {
  Write-Host "Integration removed from the selected clients. Local files were kept."
}
```

The script asks whether to install or remove and which client to configure. It merges hooks and keeps unrelated settings. Removal leaves the local files in place.

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
