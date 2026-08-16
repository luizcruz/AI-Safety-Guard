from typing import Annotated, Literal

from pydantic import BaseModel, Field


class RuleInput(BaseModel):
    kind: Literal["pattern", "keyword", "heuristic", "filename"]
    category: str = Field(min_length=1, max_length=80)
    label: str | None = Field(default=None, max_length=160)
    score: int | None = Field(default=None, ge=0, le=100)
    source: str | None = Field(default=None, max_length=5000)
    flags: str | None = Field(default=None, pattern=r"^[dgimsuvy]*$")
    validator: str | None = Field(default=None, max_length=80)
    keyword: str | None = Field(default=None, min_length=1, max_length=300)
    heuristic_id: str | None = Field(default=None, min_length=1, max_length=100)
    file_names: list[Annotated[str, Field(min_length=1, max_length=255)]] | None = Field(default=None, min_length=1, max_length=500)


class RuleOutput(RuleInput):
    id: str


class RulesetOutput(BaseModel):
    version: str
    categories: dict[str, str]
    patterns: list[dict]
    keywords: dict[str, list[str]]
    heuristics: list[dict]
    fileNameRules: list[dict]
