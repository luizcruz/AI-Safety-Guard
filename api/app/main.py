from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response, status

from .auth import bearer_auth
from .config import Settings
from .models import RuleInput, RuleOutput, RulesetOutput
from .repository import RuleNotFoundError, RuleRepository, RuleValidationError


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings()
    repository = RuleRepository(config.data_dir, config.seed_file)
    authenticate = bearer_auth(config.api_token)
    app = FastAPI(title="AI Safety Guard Rules API", version="1.0.0")

    def etag() -> str:
        return f'"{repository.version}"'

    def verify_version(if_match: str | None) -> None:
        if if_match and if_match.strip('"') != repository.version:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Versão do catálogo desatualizada")

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok"}

    @app.get("/v1/rulesets/latest", response_model=RulesetOutput, dependencies=[Depends(authenticate)])
    async def latest_ruleset(response: Response) -> dict:
        response.headers["ETag"] = etag()
        response.headers["Cache-Control"] = "no-store"
        return repository.latest()

    @app.get("/v1/rules", response_model=list[RuleOutput], dependencies=[Depends(authenticate)])
    async def list_rules(category: str | None = Query(default=None), kind: str | None = Query(default=None)) -> list[dict]:
        return repository.list(category=category, kind=kind)

    @app.get("/v1/rules/{rule_id}", response_model=RuleOutput, dependencies=[Depends(authenticate)])
    async def get_rule(rule_id: str) -> dict:
        try:
            return repository.get(rule_id)
        except RuleNotFoundError as error:
            raise HTTPException(status_code=404, detail="Regra não encontrada") from error

    @app.post("/v1/rules", response_model=RuleOutput, status_code=201, dependencies=[Depends(authenticate)])
    async def create_rule(value: RuleInput, response: Response, if_match: str | None = Header(default=None)) -> dict:
        verify_version(if_match)
        try:
            created = repository.create(value)
        except RuleValidationError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        response.headers["ETag"] = etag()
        return created

    @app.put("/v1/rules/{rule_id}", response_model=RuleOutput, dependencies=[Depends(authenticate)])
    async def update_rule(rule_id: str, value: RuleInput, response: Response, if_match: str | None = Header(default=None)) -> dict:
        verify_version(if_match)
        try:
            updated = repository.update(rule_id, value)
        except RuleNotFoundError as error:
            raise HTTPException(status_code=404, detail="Regra não encontrada") from error
        except RuleValidationError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        response.headers["ETag"] = etag()
        return updated

    @app.delete("/v1/rules/{rule_id}", status_code=204, dependencies=[Depends(authenticate)])
    async def delete_rule(rule_id: str, if_match: str | None = Header(default=None)) -> Response:
        verify_version(if_match)
        try:
            repository.delete(rule_id)
        except RuleNotFoundError as error:
            raise HTTPException(status_code=404, detail="Regra não encontrada") from error
        return Response(status_code=204, headers={"ETag": etag()})

    app.state.repository = repository
    return app
