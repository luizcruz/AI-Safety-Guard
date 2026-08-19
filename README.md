# AI Safety Guard v1.2

Extensão Chrome Manifest V3 que analisa localmente mensagens e anexos PDF/DOCX/DOC destinados ao ChatGPT, Claude, Perplexity, Gemini, Copilot, DeepSeek e Kimi. Quando encontra evidências de dados sensíveis, infraestrutura, propriedade intelectual, PCI/Banking, RH ou PII em logs, aplica o modo configurado e informa as categorias possivelmente infringidas.

## Arquitetura de regras

O catálogo declarativo embarcado fica em `plugin/src/rules.js`: categorias, expressões regulares, palavras-chave, pontuações, validadores e heurísticas. Expressões são armazenadas como `source` e `flags`, no mesmo formato serializável entregue pela API. `plugin/src/detector.js` compila e executa esse catálogo localmente.

O detector normaliza Unicode, valida checksums e correlaciona padrões, palavras-chave e estrutura documental. No modo `Heurística`, confiança média ou alta bloqueia e evidências abaixo do limiar permanecem silenciosas.

A API em `api/` oferece CRUD autenticado e snapshots versionados. O service worker consulta `/v1/rulesets/latest` ao instalar/iniciar o Chrome, aceita somente versões mais recentes e catálogos válidos, e os distribui aos content scripts via `chrome.storage.local`. Falhas de rede preservam o último catálogo válido ou o conjunto embarcado.

O painel Node.js em `admin-ui/` disponibiliza a administração visual do catálogo em `http://127.0.0.1:3000` quando iniciado pelo Docker Compose. O painel usa a API Python pela rede interna, mantém o Bearer token no servidor e aplica controle de versão otimista nas alterações.

Configure a URL e o Bearer token no popup da extensão. O token fica apenas no armazenamento local do perfil do Chrome; nenhuma mensagem de chat é enviada à API.

## Análise de anexos

- PDF: extração textual local com PDF.js, limitada a 200 páginas e executada sem worker `blob:`, para respeitar a CSP dos sites suportados.
- DOCX: extração textual local com Mammoth.js.
- DOC legado: recuperação defensiva de cadeias textuais embutidas.
- Limites: 15 MB por arquivo, 2 milhões de caracteres e 20 segundos por operação.

No modo `Heurística`, o envio permanece bloqueado enquanto a análise estiver pendente ou quando o arquivo não puder ser lido. PDFs digitalizados e documentos compostos apenas por imagens exigem OCR/conversão prévia; o conteúdo dos anexos nunca é enviado à API de regras.

Eventos de seleção, arrastar/soltar e colar arquivos são interrompidos antes de chegarem ao site. Após a análise local, o modo `Heurística` bloqueia scores iguais ou superiores a 50 e rejeita anexos ilegíveis; os modos `Avisar` e `Registrar` liberam o upload conforme configurado.

O nome de todo anexo é comparado localmente com a categoria `Nomes de arquivos sensíveis`, inclusive quando não existe leitor ou a extração falha. O catálogo inicial contém 79 nomes em sete grupos, administráveis pela API através de regras `kind: filename`.

## Modos de operação

- `Heurística`: avalia validade, contexto e combinação de evidências; bloqueia confiança média ou alta (score ≥50).
- `Avisar`: apresenta uma única advertência por detecção e permite o envio.
- `Registrar`: permite o envio e persiste silenciosamente no `chrome.storage.local` a data/hora, IA acessada, categorias, regras acionadas e amostras mascaradas. O botão `Download log` exporta manualmente esses registros para `ai-safety-guard.log`.

## Instalação local

1. Acesse `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta `plugin/`.

## Inicialização dos serviços

No WSL, o launcher raiz verifica a branch remota, aplica somente atualizações fast-forward e inicia a API e o painel administrativo pelo Docker Compose:

```bash
./bin/deploy
```

Use `./bin/deploy --check-only` para apenas consultar atualizações ou `./bin/deploy --no-update` para iniciar sem acessar o repositório remoto.

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
api/.venv/bin/python -m pytest api/tests --cov=api/app
```

## Privacidade

A análise é determinística e executada integralmente no content script. Nenhuma mensagem ou ocorrência é transmitida para a API de regras. Preferências ficam no `chrome.storage.sync`; no modo `Registrar`, ocorrências mascaradas são mantidas silenciosamente no `chrome.storage.local` e podem ser exportadas manualmente pelo popup.

## Limitações

Detecção baseada em padrões pode produzir falsos positivos ou negativos. A extensão complementa — não substitui — políticas corporativas de DLP. Alterações no DOM dos serviços suportados podem exigir atualização dos seletores de envio.
