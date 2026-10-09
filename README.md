# AI Safety Guard

Chrome Manifest V3 extension that detects sensitive data before it is sent to ChatGPT, Claude, Gemini, Perplexity, Copilot, DeepSeek, or Kimi.

Prompts, attachments, and audit events are processed locally. The rules API never receives analyzed content.

## Features

- Detects personal, medical, financial, corporate, credential, infrastructure, source code, and HR data.
- Analyzes prompts and PDF, DOCX, and DOC attachments locally.
- Uses versioned rules with offline support.
- Displays a risk indicator beside the prompt field.
- Keeps the status banner above the page in the bottom-right corner.
- Optionally replaces detected prompt values with `[REDACTED]` before review.
- Stores a local audit trail with masked samples.
- Records Heuristic-mode blocks with matched policy IDs.
- Provides optional semantic analysis with Gemini Nano.
- Includes configurable heuristic policies with context and exceptions.
- Exposes heuristic evaluation through WebMCP and a local stdio MCP server.
- Provides an MCP settings tab with a browser toggle and manual Claude Code/Codex setup commands.
- Bundles a downloadable standalone MCP server; end users do not need the source repository or npm dependencies.
- Limits live scanning, oversized prompts, and local-model execution to protect browser responsiveness.

## Protection levels

| Level | Behavior |
| --- | --- |
| **Log** | Allows submission and records the event locally. |
| **Warn** | Displays a warning and allows submission. |
| **Detection** | Blocks risks found by deterministic rules. |
| **Heuristic** | Adds local Gemini Nano analysis and blocks risks. |

If Gemini Nano is unavailable, **Heuristic** is disabled and **Detection** is selected automatically.

## Local installation

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the `plugin/` directory.
5. Complete the Gemini Nano installation on the options page.

Chrome may require a click to start the download. See the [built-in AI requirements](https://developer.chrome.com/docs/ai/get-started).

## Configuration

Click the extension icon to select the protection level. Use **Open all settings** for the complete configuration page, where you can:

- select the protection level;
- enable prompt obfuscation for Detection and Heuristic modes;
- install or validate Gemini Nano and run a local risk test;
- enable categories;
- manage built-in and custom heuristic policies;
- inspect and download the local audit log;
- configure and refresh the rules API.

## Attachments

| Format | Local processing |
| --- | --- |
| PDF | PDF.js |
| DOCX | Mammoth.js |
| DOC | Defensive text extraction |

Limits: 5 MB, 50 pages, 500,000 characters, and 10 seconds per analysis. Files are scanned sequentially. Image-only PDFs require OCR first.

## Local services

Create `api/.env` from `api/.env.example`, then run in WSL:

```bash
./bin/deploy
```

- API: `http://127.0.0.1:8000`
- Admin UI: `http://127.0.0.1:3000`

Launcher options:

```bash
./bin/deploy --check-only
./bin/deploy --no-update
```

API details: [api/README.md](api/README.md).

## Development

```bash
npm test
npm run check
npm run build:vendor
npm run build:mcp
```

MCP and hook setup: [docs/MCP.md](docs/MCP.md).

API tests:

```bash
python3 -m venv api/.venv
api/.venv/bin/python -m pip install -r api/requirements-dev.txt
api/.venv/bin/python -m pytest api/tests
```

## Structure

- `plugin/src/rules.js`: bundled rule catalog.
- `plugin/src/detector.js`: deterministic detection.
- `plugin/src/nano.js`: Gemini Nano integration.
- `plugin/src/offscreen.js`: extension-context inference bridge.
- `plugin/src/policies.js`: nuanced heuristic policy catalog.
- `plugin/src/heuristic-evaluator.js`: shared heuristic evaluation engine.
- `plugin/src/webmcp.js`: WebMCP tool registered in supported Chrome pages.
- `plugin/src/content.js`: interception and risk indicator.
- `mcp/`: local MCP server for coding agents.
- `plugin/mcp/ai-safety-mcp.cjs`: dependency-free MCP download bundled with the extension.
- `integrations/`: Claude Code and Codex hook examples.
- `plugin/src/options.html`: extension settings.
- `api/`: FastAPI rules API.
- `admin-ui/`: administration interface.

## Limitations

- Detection may produce false positives or false negatives.
- Changes to AI websites may require new selectors.
- Gemini Nano depends on browser, operating system, hardware, and storage availability.
- The extension complements DLP controls; it does not replace them.
