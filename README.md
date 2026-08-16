# AI Chat DLP Guard

Extensão Chrome Manifest V3 que analisa localmente mensagens destinadas ao ChatGPT, Claude, Perplexity e Gemini. Quando encontra evidências de documentos pessoais, médicos, financeiros, corporativos ou credenciais, interrompe o evento de envio e solicita a remoção/anonimização dos dados.

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
