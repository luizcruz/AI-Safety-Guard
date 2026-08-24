import json

import pytest

from api.app.models import RuleInput
from api.app.repository import RuleNotFoundError, RuleRepository, RuleValidationError


@pytest.fixture
def repository(tmp_path):
    seed = tmp_path / "seed.json"
    seed.write_text(
        json.dumps(
            {
                "version": "1.0.0",
                "categories": {"credentials": "Credenciais", "sensitiveFileNames": "Nomes de arquivos sensíveis"},
                "patterns": [],
                "keywords": {"credentials": [], "sensitiveFileNames": []},
                "heuristics": [],
                "fileNameRules": [],
            }
        ),
        encoding="utf-8",
    )
    return RuleRepository(tmp_path / "snapshots", seed)


def pattern(source="secret_[a-z]+", label="Segredo"):
    return RuleInput(kind="pattern", category="credentials", label=label, score=90, source=source, flags="gi")


def test_crud_creates_immutable_versioned_snapshots(repository):
    created = repository.create(pattern())
    assert repository.version == "1.0.1"
    assert repository.get(created["id"])["source"] == "secret_[a-z]+"

    updated = repository.update(created["id"], pattern("token_[a-z]+", "Token"))
    assert repository.version == "1.0.2"
    assert updated["id"] != created["id"]

    repository.delete(updated["id"])
    assert repository.version == "1.0.3"
    assert repository.list() == []
    assert [item.name for item in sorted(repository._data_dir.glob("ruleset-v*.json"))] == [
        "ruleset-v1.0.0.json", "ruleset-v1.0.1.json", "ruleset-v1.0.2.json", "ruleset-v1.0.3.json"
    ]
    with pytest.raises(RuleNotFoundError):
        repository.get(updated["id"])


def test_supports_keyword_and_heuristic_rules(repository):
    keyword = repository.create(RuleInput(kind="keyword", category="credentials", keyword="secret_key"))
    heuristic = repository.create(RuleInput(kind="heuristic", category="credentials", heuristic_id="encodedConfigSecret", label="Config", score=80))
    assert keyword["kind"] == "keyword"
    assert heuristic["kind"] == "heuristic"
    assert {item["kind"] for item in repository.list()} == {"keyword", "heuristic"}


def test_supports_filename_rules(repository):
    created = repository.create(RuleInput(kind="filename", category="sensitiveFileNames", label="Configuração", score=90, file_names=[".env", "config.json"]))
    assert created["kind"] == "filename"
    assert created["file_names"] == [".env", "config.json"]
    updated = repository.update(created["id"], RuleInput(kind="filename", category="sensitiveFileNames", label="Configuração", score=95, file_names=[".env.production"]))
    assert updated["score"] == 95


@pytest.mark.parametrize("validator", ["cpf", "cnpj", "pis", "luhn", "iban"])
def test_supports_checksum_validators(repository, validator):
    created = repository.create(RuleInput(kind="pattern", category="credentials", label=validator.upper(), score=90, source=f"{validator}_[0-9]+", validator=validator))
    assert created["validator"] == validator


def test_rejects_unknown_category_missing_fields_and_duplicates(repository):
    with pytest.raises(RuleValidationError, match="Categoria inexistente"):
        repository.create(RuleInput(kind="keyword", category="unknown", keyword="x"))
    with pytest.raises(RuleValidationError, match="Campos obrigatórios"):
        repository.create(RuleInput(kind="pattern", category="credentials", label="Sem regex", score=80))
    repository.create(pattern())
    with pytest.raises(RuleValidationError, match="duplicadas"):
        repository.create(pattern())
    with pytest.raises(RuleValidationError, match="Validador não suportado"):
        repository.create(RuleInput(kind="pattern", category="credentials", label="X", score=80, source="x", validator="custom"))
    with pytest.raises(RuleValidationError, match="Heurística não suportada"):
        repository.create(RuleInput(kind="heuristic", category="credentials", heuristic_id="arbitraryCode", label="X", score=80))


def test_reloads_latest_snapshot(repository):
    repository.create(pattern())
    reloaded = RuleRepository(repository._data_dir, repository._seed_file)
    assert reloaded.version == "1.0.1"
    assert len(reloaded.list()) == 1


def test_recovers_latest_pointer_from_immutable_snapshots(repository):
    repository.create(pattern())
    (repository._data_dir / "latest.json").unlink()
    recovered = RuleRepository(repository._data_dir, repository._seed_file)
    assert recovered.version == "1.0.1"
    assert (repository._data_dir / "latest.json").exists()


def test_migrates_old_catalog_to_filename_schema(tmp_path):
    old = {"version": "1.1.5", "categories": {"credentials": "Credenciais"}, "patterns": [], "keywords": {"credentials": []}, "heuristics": []}
    seed = {"version": "1.2.0", "categories": {"credentials": "Credenciais", "sensitiveFileNames": "Nomes"}, "patterns": [], "keywords": {"credentials": [], "sensitiveFileNames": []}, "heuristics": [], "fileNameRules": [{"category": "sensitiveFileNames", "label": "Config", "names": [".env"], "score": 90}]}
    seed_file = tmp_path / "seed.json"
    seed_file.write_text(json.dumps(seed), encoding="utf-8")
    data_dir = tmp_path / "snapshots"
    data_dir.mkdir()
    (data_dir / "latest.json").write_text(json.dumps(old), encoding="utf-8")
    migrated = RuleRepository(data_dir, seed_file)
    assert migrated.version == "1.2.0"
    assert migrated.latest()["fileNameRules"][0]["names"] == [".env"]
    assert (data_dir / "ruleset-v1.2.0.json").exists()


def test_migrates_builtin_validators_without_removing_custom_rules(tmp_path):
    source = r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b"
    old = {
        "version": "1.2.9", "categories": {"personal": "Pessoal", "custom": "Custom", "sensitiveFileNames": "Nomes"},
        "patterns": [
            {"category": "personal", "label": "CPF", "source": source, "flags": "g", "score": 90, "validator": None},
            {"category": "custom", "label": "Custom", "source": "CUSTOM", "flags": "g", "score": 80, "validator": None},
        ],
        "keywords": {"personal": [], "custom": [], "sensitiveFileNames": []}, "heuristics": [], "fileNameRules": [],
    }
    seed = {
        "version": "1.3.0", "categories": old["categories"],
        "patterns": [{"category": "personal", "label": "CPF", "source": source, "flags": "g", "score": 90, "validator": "cpf"}],
        "keywords": old["keywords"], "heuristics": [], "fileNameRules": [],
    }
    seed_file = tmp_path / "seed.json"
    seed_file.write_text(json.dumps(seed), encoding="utf-8")
    data_dir = tmp_path / "snapshots"
    data_dir.mkdir()
    (data_dir / "latest.json").write_text(json.dumps(old), encoding="utf-8")
    migrated = RuleRepository(data_dir, seed_file)
    assert migrated.version == "1.3.0"
    assert migrated.latest()["patterns"][0]["validator"] == "cpf"
    assert any(item["label"] == "Custom" for item in migrated.latest()["patterns"])
