import secrets

from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer


bearer = HTTPBearer(auto_error=False)


def bearer_auth(expected_token: str):
    async def verify(credentials: HTTPAuthorizationCredentials | None = Security(bearer)) -> None:
        if (
            credentials is None
            or credentials.scheme.lower() != "bearer"
            or not secrets.compare_digest(credentials.credentials, expected_token)
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Bearer token inválido ou ausente",
                headers={"WWW-Authenticate": "Bearer"},
            )

    return verify
