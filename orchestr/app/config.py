import os
from pathlib import Path

_env = Path(__file__).resolve().parents[1] / ".env"  # auto-load orchestr/.env (real env vars win)
if _env.exists():
    for _l in _env.read_text().splitlines():
        _l = _l.strip()
        if _l and not _l.startswith("#") and "=" in _l:
            _k, _v = _l.split("=", 1)
            os.environ[_k.strip()] = _v.strip().strip('"')

def _b(name, default):
    return os.getenv(name, str(default)).lower() in ("1", "true", "yes")

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "gemini-3.5-flash-lite")
LLM_API_URL = os.getenv("LLM_API_URL", "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent")
SEMGREP_CONFIG = os.getenv("SEMGREP_CONFIG", "auto")
ALLOW_DOCKER_TESTS = _b("ALLOW_DOCKER_TESTS", True)
STEP_TIMEOUT = int(os.getenv("STEP_TIMEOUT_SECONDS", "300"))
MAX_OUTPUT_CHARS = 8000
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
OAUTH_REDIRECT_URI = os.getenv("OAUTH_REDIRECT_URI", "http://localhost:8000/auth/github/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
PRODUCTION = os.getenv("ENV", "dev") == "production"
SESSION_TTL = int(os.getenv("SESSION_TTL_SECONDS", "28800"))
MAX_ATTEMPTS = int(os.getenv("MAX_ATTEMPTS", "2"))
GITHUB_CONFIGURED = bool(GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET)
DATABASE_URL = os.getenv("DATABASE_URL", "")
REDIS_URL = os.getenv("REDIS_URL", "")
TOKEN_ENCRYPTION_KEY = os.getenv("TOKEN_ENCRYPTION_KEY", "")
WORKER_CONCURRENCY = int(os.getenv("WORKER_CONCURRENCY", "2"))
USE_QUEUE = bool(DATABASE_URL and REDIS_URL)
WORKSPACE_DIR = Path(os.getenv("WORKSPACE_DIR", str(Path(__file__).resolve().parents[2] / "workspaces")))
WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
