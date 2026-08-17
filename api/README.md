# Rules API

API FastAPI para administrar o catálogo do AI Safety Guard. Todos os endpoints de regras exigem `Authorization: Bearer <token>`. Cada `POST`, `PUT` ou `DELETE` incrementa a versão patch e cria um snapshot JSON imutável em `data/rulesets`.

## Execução

Crie `api/.env` a partir do exemplo e substitua o token:

```dotenv
AI_SAFETY_API_TOKEN=gere-um-token-aleatorio-com-pelo-menos-32-caracteres
```

Instale as dependências uma vez e execute o launcher a partir de qualquer diretório:

```powershell
python -m venv api\.venv
api\.venv\Scripts\python.exe -m pip install -r api\requirements.txt
api\.venv\Scripts\python.exe api\bin\deploy
```

Em Linux/macOS:

```bash
python3 -m venv api/.venv
api/.venv/bin/python -m pip install -r api/requirements.txt
api/.venv/bin/python api/bin/deploy
```

Em produção, use volume persistente para `/data/rulesets`, HTTPS e apenas um worker por instância, pois o repositório é baseado em arquivos.

## Endpoints

- `GET /health` — health check público.
- `GET /v1/rulesets/latest` — catálogo consumido pela extensão.
- `GET /v1/rules` e `GET /v1/rules/{id}` — consulta.
- `POST /v1/rules` — cadastro.
- `PUT /v1/rules/{id}` — edição completa.
- `DELETE /v1/rules/{id}` — remoção.

Tipos aceitos em `kind`: `pattern`, `keyword`, `heuristic` e `filename`. Regras `filename` usam `label`, `score` e `file_names`, e são distribuídas à extensão dentro de `fileNameRules`.

Use `If-Match: "<versão>"` nas mutações para evitar sobrescrita concorrente. A resposta devolve a versão atual em `ETag`.

```powershell
$headers = @{ Authorization = "Bearer $env:AI_SAFETY_API_TOKEN"; "If-Match" = '"1.1.0"' }
$body = @{ kind="keyword"; category="credentials"; keyword="client_secret" } | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:8000/v1/rules -Method Post -Headers $headers -ContentType application/json -Body $body
```

Exemplo de regra de nome de arquivo:

```json
{
  "kind": "filename",
  "category": "sensitiveFileNames",
  "label": "Backups de banco",
  "score": 90,
  "file_names": ["dump.sql", "db_backup.tar.gz"]
}
```

Documentação OpenAPI: `http://127.0.0.1:8000/docs`.
