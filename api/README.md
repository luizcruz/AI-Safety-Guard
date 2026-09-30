# API de regras

API FastAPI para consultar e administrar o catálogo do AI Safety Guard.

Rotas de regras exigem `Authorization: Bearer <token>`. Mutações incrementam a versão patch e criam um snapshot em `data/rulesets`.

## Configuração

No WSL:

```bash
cp api/.env.example api/.env
AI_SAFETY_TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
AI_SAFETY_ADMIN_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
sed -i "s|^AI_SAFETY_API_TOKEN=.*|AI_SAFETY_API_TOKEN=${AI_SAFETY_TOKEN}|" api/.env
sed -i "s|^AI_SAFETY_ADMIN_KEY=.*|AI_SAFETY_ADMIN_KEY=${AI_SAFETY_ADMIN_KEY}|" api/.env
unset AI_SAFETY_TOKEN AI_SAFETY_ADMIN_KEY
```

## Execução

Com Docker:

```bash
./bin/deploy
curl --fail http://127.0.0.1:8000/health
```

Sem Docker:

```bash
python3 -m venv api/.venv
api/.venv/bin/python -m pip install -r api/requirements.txt
cd api
.venv/bin/python -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000
```

- API: `http://127.0.0.1:8000`
- OpenAPI: `http://127.0.0.1:8000/docs`
- Painel: `http://127.0.0.1:3000`

O painel usa `AI_SAFETY_ADMIN_KEY`; o token Bearer permanece no servidor.

## Endpoints

| Método | Rota | Função |
| --- | --- | --- |
| `GET` | `/health` | Verifica a API. |
| `GET` | `/v1/rulesets/latest` | Retorna o catálogo atual. |
| `GET` | `/v1/rules` | Lista regras. |
| `GET` | `/v1/rules/{id}` | Consulta uma regra. |
| `POST` | `/v1/rules` | Cria uma regra. |
| `PUT` | `/v1/rules/{id}` | Substitui uma regra. |
| `DELETE` | `/v1/rules/{id}` | Remove uma regra. |

Tipos: `pattern`, `keyword`, `heuristic` e `filename`. Validadores: `luhn`, `iban`, `cpf`, `cnpj` e `pis`.

Use `If-Match: "<versão>"` nas mutações. A versão atual é retornada em `ETag`.

```bash
AI_SAFETY_TOKEN="$(sed -n 's/^AI_SAFETY_API_TOKEN=//p' api/.env)"
curl --fail-with-body -X POST http://127.0.0.1:8000/v1/rules \
  -H "Authorization: Bearer ${AI_SAFETY_TOKEN}" \
  -H 'If-Match: "1.3.0"' \
  -H 'Content-Type: application/json' \
  --data '{"kind":"keyword","category":"credentials","keyword":"client_secret"}'
unset AI_SAFETY_TOKEN
```

## Produção

- Use HTTPS.
- Persista `/data/rulesets` em volume.
- Execute um worker por instância.
- Não exponha `api/.env` nem a saída completa de `docker compose config`.
