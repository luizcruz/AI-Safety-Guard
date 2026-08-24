# Rules API

API FastAPI para administrar o catálogo do AI Safety Guard. Todos os endpoints de regras exigem `Authorization: Bearer <token>`. Cada `POST`, `PUT` ou `DELETE` incrementa a versão patch e cria um snapshot JSON imutável em `data/rulesets`.

## Execução no WSL

No Ubuntu/WSL, instale o Python e o suporte a ambientes virtuais:

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip
```

Entre no repositório pelo filesystem do WSL. Ajuste o caminho se o usuário ou a unidade forem diferentes:

```bash
cd /mnt/c/Users/luizcruz_lance/Documents/AISafety
```

Crie o `.env`, gere um token seguro e mantenha o arquivo fora do Git:

```bash
cp api/.env.example api/.env
AI_SAFETY_TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
AI_SAFETY_ADMIN_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
sed -i "s|^AI_SAFETY_API_TOKEN=.*|AI_SAFETY_API_TOKEN=${AI_SAFETY_TOKEN}|" api/.env
sed -i "s|^AI_SAFETY_ADMIN_KEY=.*|AI_SAFETY_ADMIN_KEY=${AI_SAFETY_ADMIN_KEY}|" api/.env
unset AI_SAFETY_TOKEN AI_SAFETY_ADMIN_KEY
```

Para desenvolvimento local sem Docker, crie o ambiente virtual, instale as dependências e inicie a API diretamente:

```bash
python3 -m venv api/.venv
api/.venv/bin/python -m pip install --upgrade pip
api/.venv/bin/python -m pip install -r api/requirements.txt
cd api
.venv/bin/python -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000
```

A API ficará disponível em `http://127.0.0.1:8000`. Interrompa com `Ctrl+C`.

## Execução com Docker no WSL

O launcher da raiz consulta atualizações do repositório, aceita somente fast-forward e então inicia a API e o painel. O `docker-compose.yml` carrega `api/.env` diretamente:

```bash
./bin/deploy
curl --fail http://127.0.0.1:8000/health
```

Use `./bin/deploy --check-only` para apenas consultar atualizações e `./bin/deploy --no-update` para não acessar o remoto. O launcher recusa atualização quando há alterações locais, branch divergente ou HEAD destacado.

O painel administrativo fica em `http://127.0.0.1:3000`. Entre com o valor de `AI_SAFETY_ADMIN_KEY` definido em `api/.env`; a sessão autenticada expira após oito horas. Ele permite filtrar, adicionar, editar, remover e exportar regras em CSV usando os tipos e categorias do catálogo ativo. A exportação respeita os filtros selecionados. O painel acessa a API pela rede interna do Compose; o Bearer token não é entregue ao navegador.

Para acompanhar ou encerrar o serviço:

```bash
docker compose logs -f rules-api
docker compose down
```

Não use `docker compose config` sem `--quiet` em ambientes compartilhados, pois a configuração renderizada pode exibir variáveis do container.

Em produção, use volume persistente para `/data/rulesets`, HTTPS e apenas um worker por instância, pois o repositório é baseado em arquivos.

## Endpoints

- `GET /health` — health check público.
- `GET /v1/rulesets/latest` — catálogo consumido pela extensão.
- `GET /v1/rules` e `GET /v1/rules/{id}` — consulta.
- `POST /v1/rules` — cadastro.
- `PUT /v1/rules/{id}` — edição completa.
- `DELETE /v1/rules/{id}` — remoção.

Tipos aceitos em `kind`: `pattern`, `keyword`, `heuristic` e `filename`. Regras `filename` usam `label`, `score` e `file_names`, e são distribuídas à extensão dentro de `fileNameRules`. Regras `pattern` aceitam os validadores `luhn`, `iban`, `cpf`, `cnpj` e `pis`.

Use `If-Match: "<versão>"` nas mutações para evitar sobrescrita concorrente. A resposta devolve a versão atual em `ETag`.

```bash
AI_SAFETY_TOKEN="$(sed -n 's/^AI_SAFETY_API_TOKEN=//p' api/.env)"
curl --fail-with-body -X POST http://127.0.0.1:8000/v1/rules \
  -H "Authorization: Bearer ${AI_SAFETY_TOKEN}" \
  -H 'If-Match: "1.3.0"' \
  -H 'Content-Type: application/json' \
  --data '{"kind":"keyword","category":"credentials","keyword":"client_secret"}'
unset AI_SAFETY_TOKEN
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
