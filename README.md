# AI Safety Guard v1.1

Extensão Chrome Manifest V3 que analisa localmente mensagens e anexos PDF/DOCX/DOC destinados ao ChatGPT, Claude, Perplexity e Gemini. Quando encontra evidências de dados sensíveis, infraestrutura, propriedade intelectual, PCI/Banking, RH ou PII em logs, interrompe o evento de envio, informa as categorias possivelmente infringidas e solicita a remoção/anonimização.

## Arquitetura de regras

O catálogo declarativo embarcado fica em `src/rules.js`: categorias, expressões regulares, palavras-chave, pontuações, validadores e heurísticas. Expressões são armazenadas como `source` e `flags`, no mesmo formato serializável entregue pela API. `src/detector.js` compila e executa esse catálogo localmente.

A API em `api/` oferece CRUD autenticado e snapshots versionados. O service worker consulta `/v1/rulesets/latest` ao instalar/iniciar o Chrome, aceita somente versões mais recentes e catálogos válidos, e os distribui aos content scripts via `chrome.storage.local`. Falhas de rede preservam o último catálogo válido ou o conjunto embarcado.

Configure a URL e o Bearer token no popup da extensão. O token fica apenas no armazenamento local do perfil do Chrome; nenhuma mensagem de chat é enviada à API.

## Análise de anexos

- PDF: extração textual local com PDF.js, limitada a 200 páginas e executada sem worker `blob:`, para respeitar a CSP dos sites suportados.
- DOCX: extração textual local com Mammoth.js.
- DOC legado: recuperação defensiva de cadeias textuais embutidas.
- Limites: 15 MB por arquivo, 2 milhões de caracteres e 20 segundos por operação.

O envio permanece bloqueado enquanto a análise estiver pendente ou quando o arquivo não puder ser lido. PDFs digitalizados e documentos compostos apenas por imagens exigem OCR/conversão prévia; o conteúdo dos anexos nunca é enviado à API de regras.

Eventos de seleção, arrastar/soltar e colar arquivos são interrompidos antes de chegarem ao site. A extensão somente libera um novo evento de upload após concluir localmente que todos os anexos são seguros; arquivos suspeitos ou ilegíveis nunca são liberados para o fluxo de upload da página.

O nome de todo anexo é comparado localmente com a categoria `Nomes de arquivos sensíveis`, inclusive quando não existe leitor ou a extração falha. O catálogo inicial contém 79 nomes em sete grupos, administráveis pela API através de regras `kind: filename`.

## Instalação local

1. Acesse `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione este diretório.

## Desenvolvimento

```powershell
npm test
npm run check
npm run build:vendor
```

Testes da API:

```powershell
pip install -r api/requirements-dev.txt
pytest api/tests --cov=api/app
```

## Privacidade

A análise é determinística e executada integralmente no content script. Nenhuma mensagem, ocorrência ou telemetria é transmitida para servidores externos. As únicas informações persistidas são as preferências de ativação no `chrome.storage.sync`.

## Limitações

Detecção baseada em padrões pode produzir falsos positivos ou negativos. A extensão complementa — não substitui — políticas corporativas de DLP. Alterações no DOM dos serviços suportados podem exigir atualização dos seletores de envio.
