# AI Safety Guard

<<<<<<< HEAD
Extensão Chrome Manifest V3 que analisa localmente mensagens e anexos PDF/DOCX/DOC destinados ao ChatGPT, Claude, Perplexity, Gemini, Copilot, DeepSeek e Kimi. Quando encontra evidências de dados sensíveis, infraestrutura, propriedade intelectual, PCI/Banking, RH ou PII em logs, aplica o modo configurado e informa as categorias possivelmente infringidas.
=======
**Local-first AI security and (kind off) DLP for ChatGPT, Claude, Gemini, Perplexity, DeepSeek and Kimi.**
>>>>>>> origin/main

AI Safety Guard is a Chrome Manifest V3 extension that detects sensitive data before it is submitted to web-based AI tools.

It analyzes prompts and PDF/DOCX/DOC attachments locally using configurable heuristic rules, then **blocks, warns, or logs** potential policy violations. 

<<<<<<< HEAD
O detector normaliza Unicode, valida checksums e correlaciona padrões, palavras-chave e estrutura documental. No modo `Heurística`, confiança média ou alta bloqueia e evidências abaixo do limiar permanecem silenciosas.

A API em `api/` oferece CRUD autenticado e snapshots versionados. O service worker consulta `/v1/rulesets/latest` ao instalar/iniciar o Chrome, aceita somente versões mais recentes e catálogos válidos, e os distribui aos content scripts via `chrome.storage.local`. Falhas de rede preservam o último catálogo válido ou o conjunto embarcado.

O painel Node.js em `admin-ui/` disponibiliza a administração visual do catálogo em `http://127.0.0.1:3000` quando iniciado pelo Docker Compose. O acesso exige a chave `AI_SAFETY_ADMIN_KEY` configurada em `api/.env`. O painel usa a API Python pela rede interna, mantém o Bearer token no servidor e aplica controle de versão otimista nas alterações.
=======
## Features

* Local-first sensitive data detection
* Chrome Manifest V3
* ChatGPT, Claude, Gemini, Perplexity, DeepSeek and Kimi support
* Prompt and attachment scanning
* PDF, DOCX, and legacy DOC analysis
* PII detection
* PCI and banking data detection
* Infrastructure and credential patterns
* Intellectual property detection
* HR and confidential data rules
* Sensitive filename detection
* Block, Warn, or Log modes
* Configurable heuristic rule engine
* Versioned remote rulesets
* Web-based rule management
* Offline fallback to the last valid ruleset
* Masked security logs
* No prompt content sent to the rules API
>>>>>>> origin/main

## How it works

Rules are defined in:

```text
plugin/src/rules.js
```

<<<<<<< HEAD
No modo `Heurística`, o envio permanece bloqueado enquanto a análise estiver pendente ou quando o arquivo não puder ser lido. PDFs digitalizados e documentos compostos apenas por imagens exigem OCR/conversão prévia; o conteúdo dos anexos nunca é enviado à API de regras.

Eventos de seleção, arrastar/soltar e colar arquivos são interrompidos antes de chegarem ao site. Após a análise local, o modo `Heurística` bloqueia scores iguais ou superiores a 50 e rejeita anexos ilegíveis; os modos `Avisar` e `Registrar` liberam o upload conforme configurado.
=======
The ruleset contains:

* categories
* regular expressions
* keywords
* scores
* validators
* heuristics
* filename rules
>>>>>>> origin/main

`plugin/src/detector.js` compiles and runs these rules directly in the browser.

Detection is deterministic and does not require an LLM or external inference service.

<<<<<<< HEAD
- `Heurística`: avalia validade, contexto e combinação de evidências; bloqueia confiança média ou alta (score ≥50).
- `Avisar`: apresenta uma única advertência por detecção e permite o envio.
- `Registrar`: permite o envio e persiste silenciosamente no `chrome.storage.local` a data/hora, IA acessada, categorias, regras acionadas e amostras mascaradas. O botão `Download log` exporta manualmente esses registros para `ai-safety-guard.log`.
=======
## Rule Management
>>>>>>> origin/main

The Python API under `api/` provides:

* authenticated (simple) CRUD
* versioned rulesets
* ruleset validation
* `/v1/rulesets/latest`

The Chrome service worker checks for newer rulesets when the extension starts.

Valid rules are stored in `chrome.storage.local` and distributed to the content scripts.

If the API is unavailable, AI Safety Guard keeps using the last valid ruleset or the built-in default rules.

## Admin UI

`admin-ui/` provides a Node.js web interface for managing rules.

When started with Docker Compose:

```text
http://127.0.0.1:3000
```

The UI communicates with the Python API internally and keeps the Bearer token server-side.

Rule updates use optimistic version control to prevent accidental overwrites.

## Attachment Scanning

Supported formats:

| Format | Detection                          |
| ------ | ---------------------------------- |
| PDF    | PDF.js local text extraction       |
| DOCX   | Mammoth.js local extraction        |
| DOC    | Defensive embedded text extraction |

Limits:

* 15 MB per file
* 200 PDF pages
* 2 million characters
* 20 seconds per analysis

Scanned PDFs and image-only documents require OCR before they can be inspected. Local network rules should apply. And sometimes file load streams are not correctly captured. 

Attachment contents are never sent to the rules API.

### Upload protection

File selection, drag-and-drop, and paste events can be intercepted before the file reaches the AI website.

In **Block** mode, suspicious or unreadable attachments are rejected.

In **Warn** and **Log** modes, uploads continue according to the configured policy.

Filename detection always runs, even when document extraction is unavailable.

## Modes

### Heuristic

Stops submission when sensitive content is detected, if scores are higher than 50. 

The user must remove or anonymize the detected information before continuing.

### Warn

Displays one warning for each detection event and allows the user to continue.

### Log

Allows the submission and stores a local security event containing:

* timestamp
* AI service
* detected categories
* triggered rules
* masked samples

Logs are stored in `chrome.storage.local`. Chrome extension could not write files. 

Use **Download log** from the extension popup to export:

```text
ai-safety-guard.log
```

## Privacy

AI Safety Guard is designed around **local processing**.

Prompt and document analysis happens inside the browser.

The rules API receives **no chat messages, prompts, documents, or detected content**.

Extension preferences use:

```text
chrome.storage.sync
```

Security events generated by Log mode use:

```text
chrome.storage.local
```

Only masked samples are stored.

## Local Installation

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `plugin/` directory.

## Run the Services

From WSL:

```bash
./bin/deploy
```

The launcher checks the remote branch, applies fast-forward updates, and starts the API and admin interface with Docker Compose.

Check for updates only:

```bash
./bin/deploy --check-only
```

Start without checking the remote repository:

```bash
./bin/deploy --no-update
```

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
api/.venv/bin/python -m pytest api/tests --cov=api/app
```


## Limitations

Heuristic and pattern-based detection can produce false positives and false negatives. It´s simple yet efficient way to do it. 

AI Safety Guard complements existing enterprise security and  (kind off) Data Loss Prevention (DLP) controls; it is not a replacement for them.

Changes to the DOM of supported AI websites may require selector updates.

## Keywords

`ai-security` · `llm-security` · `ai-governance` · `data-loss-prevention` · `chrome-extension`
