import json

from fastapi.testclient import TestClient

from api.app.config import Settings
from api.app.main import create_app


TOKEN = "test-token-with-at-least-32-characters"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


def make_client(tmp_path):
    seed = tmp_path / "seed.json"
    seed.write_text(json.dumps({"version": "2.0.0", "categories": {"credentials": "Credenciais"}, "patterns": [], "keywords": {"credentials": []}, "heuristics": []}), encoding="utf-8")
    settings = Settings(api_token=TOKEN, data_dir=tmp_path / "rules", seed_file=seed)
    return TestClient(create_app(settings))


def test_requires_bearer_token(tmp_path):
    client = make_client(tmp_path)
    assert client.get("/v1/rules").status_code == 401
    assert client.get("/v1/rules", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/v1/rules", headers=AUTH).status_code == 200
    assert client.get("/health").json() == {"status": "ok"}


def test_api_crud_and_etag(tmp_path):
    client = make_client(tmp_path)
    payload = {"kind": "pattern", "category": "credentials", "label": "API key", "score": 90, "source": "key_[A-Z]+", "flags": "g"}
    created = client.post("/v1/rules", headers={**AUTH, "If-Match": '"2.0.0"'}, json=payload)
    assert created.status_code == 201
    assert created.headers["etag"] == '"2.0.1"'
    rule = created.json()
    assert client.get(f"/v1/rules/{rule['id']}", headers=AUTH).json()["label"] == "API key"

    payload["label"] = "Access key"
    updated = client.put(f"/v1/rules/{rule['id']}", headers={**AUTH, "If-Match": '"2.0.1"'}, json=payload)
    assert updated.status_code == 200
    assert updated.json()["label"] == "Access key"

    deleted = client.delete(f"/v1/rules/{updated.json()['id']}", headers=AUTH)
    assert deleted.status_code == 204
    assert client.get(f"/v1/rules/{updated.json()['id']}", headers=AUTH).status_code == 404


def test_latest_ruleset_and_optimistic_conflict(tmp_path):
    client = make_client(tmp_path)
    latest = client.get("/v1/rulesets/latest", headers=AUTH)
    assert latest.status_code == 200
    assert latest.headers["etag"] == '"2.0.0"'
    payload = {"kind": "keyword", "category": "credentials", "keyword": "api_secret"}
    assert client.post("/v1/rules", headers={**AUTH, "If-Match": '"1.9.9"'}, json=payload).status_code == 409


def test_validation_and_not_found(tmp_path):
    client = make_client(tmp_path)
    invalid = {"kind": "pattern", "category": "unknown", "label": "X", "score": 90, "source": "x"}
    assert client.post("/v1/rules", headers=AUTH, json=invalid).status_code == 422
    assert client.delete("/v1/rules/missing", headers=AUTH).status_code == 404
