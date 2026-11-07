import secrets, time
from dataclasses import dataclass, field
from fastapi import Depends, HTTPException, Request
from app import config


@dataclass
class Session:
    csrf: str = field(default_factory=lambda: secrets.token_urlsafe(32))
    expires: float = field(default_factory=lambda: time.time() + config.SESSION_TTL)
    oauth_state: str = ""
    verifier: str = ""
    token: str = ""  # GitHub token: server-side only, never sent to the browser
    login: str = ""
    avatar_url: str = ""
    user_id: str = ""
    demo: bool = False


SESSIONS: dict[str, Session] = {}
COOKIE = "conduit_sid"


def new_session() -> tuple[str, Session]:
    sid = secrets.token_urlsafe(32)
    SESSIONS[sid] = Session()
    return sid, SESSIONS[sid]


def set_cookie(resp, sid: str):
    resp.set_cookie(COOKIE, sid, httponly=True, samesite="lax", secure=config.PRODUCTION, max_age=config.SESSION_TTL, path="/")


def current(request: Request) -> Session:
    s = SESSIONS.get(request.cookies.get(COOKIE, ""))
    if not s or s.expires < time.time() or not s.user_id:
        raise HTTPException(401, "Sign in required")
    return s


def csrf(request: Request, s: Session = Depends(current)) -> Session:
    if not secrets.compare_digest(request.headers.get("X-CSRF-Token", ""), s.csrf):
        raise HTTPException(403, "Missing or invalid CSRF token")
    return s
