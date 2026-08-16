from __future__ import annotations

import hashlib
import json
import os
import threading
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from tempfile import NamedTemporaryFile

from .models import RuleInput


class RuleNotFoundError(KeyError):
    pass


class RuleValidationError(ValueError):
    pass


class RuleRepository:
    """Thread-safe repository backed by immutable versioned JSON snapshots."""

    SUPPORTED_VALIDATORS = {None, "luhn", "iban"}
    SUPPORTED_HEURISTICS = {
        "officialDocument", "clinicalDocument", "financialStatement", "corporateContract",
        "encodedConfigSecret", "plaintextConfig", "publicCodeShare", "unmaskedPaymentLog",
        "payrollTable", "unsanitizedObservability",
    }

    def __init__(self, data_dir: Path, seed_file: Path):
        self._data_dir = data_dir
        self._seed_file = seed_file
        self._lock = threading.RLock()
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._catalog = self._load_or_seed()

    @property
    def version(self) -> str:
        return self._catalog["version"]

    def latest(self) -> dict:
        with self._lock:
            return deepcopy(self._catalog)

    def list(self, category: str | None = None, kind: str | None = None) -> list[dict]:
        rules = self._flatten(self.latest())
        return [rule for rule in rules if (category is None or rule["category"] == category) and (kind is None or rule["kind"] == kind)]

    def get(self, rule_id: str) -> dict:
        for rule in self.list():
            if rule["id"] == rule_id:
                return rule
        raise RuleNotFoundError(rule_id)

    def create(self, value: RuleInput) -> dict:
        with self._lock:
            catalog = deepcopy(self._catalog)
            self._validate(value, catalog)
            if value.kind == "pattern":
                catalog["patterns"].append(self._pattern(value))
            elif value.kind == "keyword":
                keywords = catalog["keywords"].setdefault(value.category, [])
                if value.keyword.casefold() in {item.casefold() for item in keywords}:
                    raise RuleValidationError("Palavra-chave já cadastrada nesta categoria")
                keywords.append(value.keyword)
            else:
                if any(item["id"] == value.heuristic_id for item in catalog["heuristics"]):
                    raise RuleValidationError("Heurística já cadastrada")
                catalog["heuristics"].append(self._heuristic(value))
            self._commit(catalog)
            return self._find_equivalent(value)

    def update(self, rule_id: str, value: RuleInput) -> dict:
        with self._lock:
            old = self.get(rule_id)
            catalog = deepcopy(self._catalog)
            self._validate(value, catalog)
            self._remove(catalog, old)
            if value.kind == "pattern":
                catalog["patterns"].append(self._pattern(value))
            elif value.kind == "keyword":
                catalog["keywords"].setdefault(value.category, []).append(value.keyword)
            else:
                catalog["heuristics"].append(self._heuristic(value))
            self._commit(catalog)
            return self._find_equivalent(value)

    def delete(self, rule_id: str) -> None:
        with self._lock:
            old = self.get(rule_id)
            catalog = deepcopy(self._catalog)
            self._remove(catalog, old)
            self._commit(catalog)

    def _load_or_seed(self) -> dict:
        latest = self._data_dir / "latest.json"
        if latest.exists():
            return self._read_json(latest)
        snapshots = list(self._data_dir.glob("ruleset-v*.json"))
        if snapshots:
            recovered = max(snapshots, key=lambda path: self._version_key(path.stem.removeprefix("ruleset-v")))
            catalog = self._read_json(recovered)
            self._atomic_write(latest, catalog, replace=True)
            return catalog
        catalog = self._read_json(self._seed_file)
        self._validate_catalog(catalog)
        self._write_snapshot(catalog)
        return catalog

    @staticmethod
    def _read_json(path: Path) -> dict:
        try:
            with path.open("r", encoding="utf-8") as stream:
                return json.load(stream)
        except (OSError, json.JSONDecodeError) as error:
            raise RuntimeError(f"Não foi possível carregar o catálogo: {path}") from error

    def _commit(self, catalog: dict) -> None:
        catalog["version"] = self._next_version(self._catalog["version"])
        catalog["updatedAt"] = datetime.now(UTC).isoformat()
        self._validate_catalog(catalog)
        self._write_snapshot(catalog)
        self._catalog = catalog

    def _write_snapshot(self, catalog: dict) -> None:
        snapshot = self._data_dir / f"ruleset-v{catalog['version']}.json"
        if snapshot.exists():
            raise RuntimeError(f"Snapshot imutável já existe: {snapshot.name}")
        self._atomic_write(snapshot, catalog)
        self._atomic_write(self._data_dir / "latest.json", catalog, replace=True)

    @staticmethod
    def _atomic_write(path: Path, value: dict, replace: bool = False) -> None:
        if path.exists() and not replace:
            raise FileExistsError(path)
        temporary_name = None
        try:
            with NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False, suffix=".tmp") as stream:
                temporary_name = stream.name
                json.dump(value, stream, ensure_ascii=False, indent=2)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary_name, path)
        finally:
            if temporary_name and os.path.exists(temporary_name):
                os.unlink(temporary_name)

    @staticmethod
    def _next_version(version: str) -> str:
        parts = version.split(".")
        if len(parts) != 3 or not all(part.isdigit() for part in parts):
            raise RuntimeError(f"Versão inválida: {version}")
        major, minor, patch = map(int, parts)
        return f"{major}.{minor}.{patch + 1}"

    @staticmethod
    def _version_key(version: str) -> tuple[int, int, int]:
        parts = version.split(".")
        if len(parts) != 3 or not all(part.isdigit() for part in parts):
            return (0, 0, 0)
        return tuple(map(int, parts))

    @staticmethod
    def _id(prefix: str, *parts: str) -> str:
        digest = hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()[:16]
        return f"{prefix}-{digest}"

    def _flatten(self, catalog: dict) -> list[dict]:
        output = []
        for item in catalog["patterns"]:
            output.append({"id": self._id("pattern", item["category"], item["label"], item["source"]), "kind": "pattern", **item})
        for category, keywords in catalog["keywords"].items():
            for keyword in keywords:
                output.append({"id": self._id("keyword", category, keyword), "kind": "keyword", "category": category, "keyword": keyword})
        for item in catalog["heuristics"]:
            output.append({"id": self._id("heuristic", item["id"]), "kind": "heuristic", "category": item["category"], "label": item["label"], "score": item["score"], "heuristic_id": item["id"]})
        return output

    def _find_equivalent(self, value: RuleInput) -> dict:
        for rule in self.list(kind=value.kind):
            identity = rule.get("source") if value.kind == "pattern" else rule.get("keyword") if value.kind == "keyword" else rule.get("heuristic_id")
            expected = value.source if value.kind == "pattern" else value.keyword if value.kind == "keyword" else value.heuristic_id
            if rule["category"] == value.category and identity == expected:
                return rule
        raise RuntimeError("Regra persistida não encontrada")

    def _remove(self, catalog: dict, rule: dict) -> None:
        if rule["kind"] == "pattern":
            catalog["patterns"] = [item for item in catalog["patterns"] if self._id("pattern", item["category"], item["label"], item["source"]) != rule["id"]]
        elif rule["kind"] == "keyword":
            catalog["keywords"][rule["category"]] = [item for item in catalog["keywords"][rule["category"]] if self._id("keyword", rule["category"], item) != rule["id"]]
        else:
            catalog["heuristics"] = [item for item in catalog["heuristics"] if self._id("heuristic", item["id"]) != rule["id"]]

    @staticmethod
    def _pattern(value: RuleInput) -> dict:
        return {"category": value.category, "label": value.label, "source": value.source, "flags": value.flags or "g", "score": value.score, "validator": value.validator}

    @staticmethod
    def _heuristic(value: RuleInput) -> dict:
        return {"id": value.heuristic_id, "category": value.category, "label": value.label, "score": value.score}

    @staticmethod
    def _validate(value: RuleInput, catalog: dict) -> None:
        if value.category not in catalog["categories"]:
            raise RuleValidationError("Categoria inexistente")
        required = {
            "pattern": (value.label, value.source, value.score is not None),
            "keyword": (value.keyword,),
            "heuristic": (value.heuristic_id, value.label, value.score is not None),
        }[value.kind]
        if not all(required):
            raise RuleValidationError(f"Campos obrigatórios ausentes para regra {value.kind}")
        if value.kind == "pattern" and value.validator not in RuleRepository.SUPPORTED_VALIDATORS:
            raise RuleValidationError("Validador não suportado pela extensão")
        if value.kind == "heuristic" and value.heuristic_id not in RuleRepository.SUPPORTED_HEURISTICS:
            raise RuleValidationError("Heurística não suportada pela extensão")

    @staticmethod
    def _validate_catalog(catalog: dict) -> None:
        required = {"version", "categories", "patterns", "keywords", "heuristics"}
        if not required.issubset(catalog):
            raise RuleValidationError("Catálogo incompleto")
        categories = catalog["categories"]
        for item in [*catalog["patterns"], *catalog["heuristics"]]:
            if item["category"] not in categories:
                raise RuleValidationError(f"Categoria desconhecida: {item['category']}")
        if set(catalog["keywords"]) - set(categories):
            raise RuleValidationError("Palavras-chave possuem categoria desconhecida")
        identities = []
        identities.extend(("pattern", item["category"], item["label"], item["source"]) for item in catalog["patterns"])
        identities.extend(("keyword", category, keyword.casefold()) for category, keywords in catalog["keywords"].items() for keyword in keywords)
        identities.extend(("heuristic", item["id"]) for item in catalog["heuristics"])
        if len(identities) != len(set(identities)):
            raise RuleValidationError("Catálogo contém regras duplicadas")
