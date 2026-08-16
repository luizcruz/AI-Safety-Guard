# AI Safety Guard v1.0

Extensão Chrome Manifest V3 que analisa localmente mensagens destinadas ao ChatGPT, Claude, Perplexity e Gemini. Quando encontra evidências de dados sensíveis, infraestrutura, propriedade intelectual, PCI/Banking, RH ou PII em logs, interrompe o evento de envio, informa as categorias possivelmente infringidas e solicita a remoção/anonimização.

## Arquitetura de regras

O catálogo declarativo fica em `src/rules.js`: categorias, expressões regulares, palavras-chave, pontuações, validadores e heurísticas. Expressões são armazenadas como `source` e `flags`, mantendo o catálogo serializável para uma futura API. `src/detector.js` compila e executa esse catálogo localmente.

## Instalação local

1. Acesse `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione este diretório.

## Desenvolvimento

```powershell
npm test
npm run check
```

## Privacidade

A análise é determinística e executada integralmente no content script. Nenhuma mensagem, ocorrência ou telemetria é transmitida para servidores externos. As únicas informações persistidas são as preferências de ativação no `chrome.storage.sync`.

## Limitações

Detecção baseada em padrões pode produzir falsos positivos ou negativos. A extensão complementa — não substitui — políticas corporativas de DLP. Alterações no DOM dos serviços suportados podem exigir atualização dos seletores de envio.
