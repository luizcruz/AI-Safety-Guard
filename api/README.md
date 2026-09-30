# Rules API

FastAPI service for querying and managing the AI Safety Guard catalog.

Rules routes require `Authorization: Bearer <token>`. Mutations increment the patch version and create a snapshot in `data/rulesets`.

## Setup

In WSL:

```bash
cp api/.env.example api/.env
AI_SAFETY_TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
AI_SAFETY_ADMIN_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
sed -i "s|^AI_SAFETY_API_TOKEN=.*|AI_SAFETY_API_TOKEN=${AI_SAFETY_TOKEN}|" api/.env
sed -i "s|^AI_SAFETY_ADMIN_KEY=.*|AI_SAFETY_ADMIN_KEY=${AI_SAFETY_ADMIN_KEY}|" api/.env
unset AI_SAFETY_TOKEN AI_SAFETY_ADMIN_KEY
```

## Run

With Docker:

```bash
./bin/deploy
curl --fail http://127.0.0.1:8000/health
```

Without Docker:

```bash
python3 -m venv api/.venv
api/.venv/bin/python -m pip install -r api/requirements.txt
cd api
.venv/bin/python -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000
```

- API: `http://127.0.0.1:8000`
- OpenAPI: `http://127.0.0.1:8000/docs`
- Admin UI: `http://127.0.0.1:3000`

The admin UI uses `AI_SAFETY_ADMIN_KEY`; the bearer token remains on the server.

## Endpoints

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Checks API health. |
| `GET` | `/v1/rulesets/latest` | Returns the current catalog. |
| `GET` | `/v1/rules` | Lists rules. |
| `GET` | `/v1/rules/{id}` | Returns one rule. |
| `POST` | `/v1/rules` | Creates a rule. |
| `PUT` | `/v1/rules/{id}` | Replaces a rule. |
| `DELETE` | `/v1/rules/{id}` | Deletes a rule. |

Kinds: `pattern`, `keyword`, `heuristic`, and `filename`. Validators: `luhn`, `iban`, `cpf`, `cnpj`, and `pis`.

Use `If-Match: "<version>"` for mutations. The current version is returned in `ETag`.

```bash
AI_SAFETY_TOKEN="$(sed -n 's/^AI_SAFETY_API_TOKEN=//p' api/.env)"
curl --fail-with-body -X POST http://127.0.0.1:8000/v1/rules \
  -H "Authorization: Bearer ${AI_SAFETY_TOKEN}" \
  -H 'If-Match: "1.3.0"' \
  -H 'Content-Type: application/json' \
  --data '{"kind":"keyword","category":"credentials","keyword":"client_secret"}'
unset AI_SAFETY_TOKEN
```

## Production

- Use HTTPS.
- Persist `/data/rulesets` in a volume.
- Run one worker per instance.
- Do not expose `api/.env` or the full output of `docker compose config`.
