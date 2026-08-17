import os
import runpy
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from api.app.config import Settings


DEPLOY_PATH = Path(__file__).resolve().parents[1] / "bin" / "deploy"
DEPLOY = runpy.run_path(str(DEPLOY_PATH))


def test_launcher_validates_settings_and_starts_uvicorn():
    calls = []
    settings = SimpleNamespace(api_host="0.0.0.0", api_port=9000, log_level="warning")

    result = DEPLOY["main"](
        [],
        settings_loader=lambda: settings,
        server_runner=lambda *args, **kwargs: calls.append((args, kwargs)),
    )

    assert result == 0
    assert calls == [
        (
            ("app.main:create_app",),
            {
                "factory": True,
                "host": "0.0.0.0",
                "port": 9000,
                "log_level": "warning",
                "server_header": False,
            },
        )
    ]


def test_command_line_overrides_configured_defaults():
    calls = []
    DEPLOY["main"](
        ["--host", "::1", "--port", "8100", "--log-level", "debug"],
        settings_loader=lambda: SimpleNamespace(api_host="127.0.0.1", api_port=8000, log_level="info"),
        server_runner=lambda *args, **kwargs: calls.append(kwargs),
    )
    assert calls[0]["host"] == "::1"
    assert calls[0]["port"] == 8100
    assert calls[0]["log_level"] == "debug"


def test_invalid_or_missing_token_stops_before_server_start():
    def invalid_settings():
        raise DEPLOY["ConfigurationError"](("api_token",))

    with pytest.raises(SystemExit, match="AI_SAFETY_API_TOKEN") as error:
        DEPLOY["main"]([], settings_loader=invalid_settings, server_runner=lambda *_args, **_kwargs: pytest.fail("não deve iniciar"))
    assert "api_token" in str(error.value)


def test_configuration_error_identifies_non_token_field():
    def invalid_settings():
        raise DEPLOY["ConfigurationError"](("api_port",))

    with pytest.raises(SystemExit, match="api_port") as error:
        DEPLOY["main"]([], settings_loader=invalid_settings, server_runner=lambda *_args, **_kwargs: pytest.fail("não deve iniciar"))
    assert "AI_SAFETY_API_TOKEN deve" not in str(error.value)


def test_launcher_reexecutes_with_project_virtualenv(tmp_path):
    python = tmp_path / ".venv" / "bin" / "python"
    python.parent.mkdir(parents=True)
    python.touch()
    calls = []

    result = DEPLOY["ensure_virtualenv"](
        tmp_path,
        ["--port", "9000"],
        prefix="/usr",
        base_prefix="/usr",
        execv=lambda executable, arguments: calls.append((executable, arguments)),
    )

    assert result is True
    assert calls[0][0] == str(python)
    assert calls[0][1][0] == str(python)
    assert calls[0][1][-2:] == ["--port", "9000"]


def test_launcher_keeps_active_virtualenv_and_reports_missing_one(tmp_path):
    fail = lambda *_args: pytest.fail("não deve executar outro Python")
    assert DEPLOY["ensure_virtualenv"](tmp_path, prefix="/venv", base_prefix="/usr", execv=fail) is False
    assert DEPLOY["ensure_virtualenv"](tmp_path, prefix="/usr", base_prefix="/usr", execv=fail) is False


def test_settings_uses_api_env_file_independent_of_working_directory():
    source = (Path(__file__).resolve().parents[1] / "app" / "config.py").read_text(encoding="utf-8")
    assert 'env_file=API_ROOT / ".env"' in source
    assert 'env_file_encoding="utf-8"' in source
    assert os.path.basename(DEPLOY["API_ROOT"]) == "api"


def test_settings_loads_token_and_server_options_from_dotenv(tmp_path, monkeypatch):
    for name in ("AI_SAFETY_API_TOKEN", "AI_SAFETY_API_HOST", "AI_SAFETY_API_PORT", "AI_SAFETY_LOG_LEVEL"):
        monkeypatch.delenv(name, raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text(
        "AI_SAFETY_API_TOKEN=a-secure-token-with-more-than-32-characters\n"
        "AI_SAFETY_API_HOST=0.0.0.0\n"
        "AI_SAFETY_API_PORT=8080\n"
        "AI_SAFETY_LOG_LEVEL=warning\n",
        encoding="utf-8",
    )

    settings = Settings(_env_file=env_file)

    assert settings.api_token == "a-secure-token-with-more-than-32-characters"
    assert settings.api_host == "0.0.0.0"
    assert settings.api_port == 8080
    assert settings.log_level == "warning"


def test_settings_rejects_invalid_token_and_port(tmp_path, monkeypatch):
    monkeypatch.delenv("AI_SAFETY_API_TOKEN", raising=False)
    monkeypatch.delenv("AI_SAFETY_API_PORT", raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text("AI_SAFETY_API_TOKEN=short\nAI_SAFETY_API_PORT=70000\n", encoding="utf-8")
    with pytest.raises(ValidationError):
        Settings(_env_file=env_file)
