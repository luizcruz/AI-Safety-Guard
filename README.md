# AI Safety Guard

Extensão Chrome Manifest V3 que detecta dados sensíveis antes do envio para ChatGPT, Claude, Gemini, Perplexity, Copilot, DeepSeek e Kimi.

Prompts, anexos e eventos de auditoria são processados localmente. A API de regras nunca recebe o conteúdo analisado.

## Recursos

- Detecção de dados pessoais, médicos, financeiros, corporativos, credenciais, infraestrutura, código e RH.
- Análise local de prompts e anexos PDF, DOCX e DOC.
- Regras versionadas com funcionamento offline.
- Indicador de risco junto ao campo do prompt.
- Auditoria local com amostras mascaradas.
- Análise semântica opcional com Gemini Nano.

## Níveis de proteção

| Nível | Comportamento |
| --- | --- |
| **Registrar** | Permite o envio e grava a ocorrência localmente. |
| **Avisar** | Exibe um alerta e permite o envio. |
| **Detecção** | Bloqueia riscos encontrados pelas regras determinísticas. |
| **Heurística** | Adiciona análise semântica local com Gemini Nano e bloqueia riscos. |

Se o Gemini Nano não estiver disponível, **Heurística** é desativada e **Detecção** assume automaticamente.

## Instalação local

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Selecione **Carregar sem compactação**.
4. Escolha a pasta `plugin/`.
5. Na página aberta, conclua a instalação do Gemini Nano.

O Chrome pode exigir um clique para iniciar o download. Consulte os [requisitos da IA integrada](https://developer.chrome.com/docs/ai/get-started).

## Configuração

Clique no ícone da extensão para abrir as opções. Nessa página é possível:

- selecionar o nível de proteção;
- habilitar categorias;
- instalar ou verificar o Gemini Nano;
- configurar a API de regras;
- baixar `ai-safety-guard.log`.

## Anexos

| Formato | Processamento local |
| --- | --- |
| PDF | PDF.js |
| DOCX | Mammoth.js |
| DOC | Extração defensiva de texto |

Limites: 15 MB, 200 páginas, 2 milhões de caracteres e 20 segundos por análise. PDFs somente com imagem exigem OCR prévio.

## Serviços locais

Crie `api/.env` a partir de `api/.env.example` e execute no WSL:

```bash
./bin/deploy
```

- API: `http://127.0.0.1:8000`
- Painel administrativo: `http://127.0.0.1:3000`

Opções do launcher:

```bash
./bin/deploy --check-only
./bin/deploy --no-update
```

Detalhes da API: [api/README.md](api/README.md).

## Desenvolvimento

```bash
npm test
npm run check
npm run build:vendor
```

Testes da API:

```bash
python3 -m venv api/.venv
api/.venv/bin/python -m pip install -r api/requirements-dev.txt
api/.venv/bin/python -m pytest api/tests
```

## Estrutura

- `plugin/src/rules.js`: catálogo embarcado.
- `plugin/src/detector.js`: detecção determinística.
- `plugin/src/nano.js`: integração com Gemini Nano.
- `plugin/src/content.js`: interceptação e indicador de risco.
- `plugin/src/options.html`: configurações da extensão.
- `api/`: API FastAPI de regras.
- `admin-ui/`: painel administrativo.

## Limitações

- Detecções podem produzir falsos positivos ou negativos.
- Alterações nas páginas das IAs podem exigir novos seletores.
- Gemini Nano depende do navegador, sistema, hardware e armazenamento disponíveis.
- A extensão complementa controles DLP; não os substitui.
