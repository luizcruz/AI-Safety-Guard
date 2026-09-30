# AI Safety Guard

Chrome Manifest V3 extension that detects sensitive data before it is sent to ChatGPT, Claude, Gemini, Perplexity, Copilot, DeepSeek, or Kimi.

Prompts, attachments, and audit events are processed locally. The rules API never receives analyzed content.

## Features

- Detects personal, medical, financial, corporate, credential, infrastructure, source code, and HR data.
- Analyzes prompts and PDF, DOCX, and DOC attachments locally.
- Uses versioned rules with offline support.
- Displays a risk indicator beside the prompt field.
- Stores a local audit trail with masked samples.
- Provides optional semantic analysis with Gemini Nano.

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

Click the extension icon to open its options. You can:

- select the protection level;
- enable categories;
- install or check Gemini Nano;
- configure the rules API;
- download `ai-safety-guard.log`.

## Attachments

| Format | Local processing |
| --- | --- |
| PDF | PDF.js |
| DOCX | Mammoth.js |
| DOC | Defensive text extraction |

Limits: 15 MB, 200 pages, 2 million characters, and 20 seconds per analysis. Image-only PDFs require OCR first.

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
```

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
- `plugin/src/content.js`: interception and risk indicator.
- `plugin/src/options.html`: extension settings.
- `api/`: FastAPI rules API.
- `admin-ui/`: administration interface.

## Limitations

- Detection may produce false positives or false negatives.
- Changes to AI websites may require new selectors.
- Gemini Nano depends on browser, operating system, hardware, and storage availability.
- The extension complements DLP controls; it does not replace them.
