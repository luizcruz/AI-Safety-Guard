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
                "categories": {"credentials": "Credenciais"},
                "patterns": [],
                "keywords": {"credentials": []},
                "heuristics": [],
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
