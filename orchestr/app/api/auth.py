import base64, hashlib, secrets
from urllib.parse import urlencode
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from app import config
from app.security.sessions import COOKIE, SESSIONS, Session, csrf, current, new_session, set_cookie
from app.services.github import GitHub

router = APIRouter(tags=["auth"])


@router.get("/auth/github/login")
async def login(request: Request):
    if not config.GITHUB_CONFIGURED:
        accept = request.headers.get("accept", "")
        if "text/html" in accept:
            return RedirectResponse(f"{config.FRONTEND_URL}?auth_error=oauth_not_configured")
        raise HTTPException(503, "GitHub OAuth is not configured. Use demo mode.")
    sid, s = new_session()
    s.oauth_state, s.verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(64)
    ch = base64.urlsafe_b64encode(hashlib.sha256(s.verifier.encode()).digest()).rstrip(b"=").decode()
    q = urlencode({"client_id": config.GITHUB_CLIENT_ID, "redirect_uri": config.OAUTH_REDIRECT_URI, "scope": "repo read:user",
                   "state": s.oauth_state, "code_challenge": ch, "code_challenge_method": "S256"})
    resp = RedirectResponse(f"https://github.com/login/oauth/authorize?{q}")
    set_cookie(resp, sid)
    return resp


@router.get("/auth/github/callback")
async def callback(request: Request, code: str = "", state: str = "", error: str = ""):
    if error:
        return RedirectResponse(f"{config.FRONTEND_URL}?auth_error={error}")
    s = SESSIONS.get(request.cookies.get(COOKIE, ""))
    if not s or not s.oauth_state or not secrets.compare_digest(state, s.oauth_state):
        raise HTTPException(400, "Invalid OAuth state")
    s.oauth_state = ""  # single use
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post("https://github.com/login/oauth/access_token", headers={"Accept": "application/json"},
                         data={"client_id": config.GITHUB_CLIENT_ID, "client_secret": config.GITHUB_CLIENT_SECRET, "code": code,
                               "redirect_uri": config.OAUTH_REDIRECT_URI, "code_verifier": s.verifier})
    tok = r.json().get("access_token")
    if not tok:
        raise HTTPException(400, "GitHub sign-in failed")
    me = await GitHub(tok).me()
    s.token, s.login, s.user_id, s.verifier = tok, me["login"], str(me["id"]), ""
    s.avatar_url = me.get("avatar_url", "")
    return RedirectResponse(config.FRONTEND_URL)


from pydantic import BaseModel
from fastapi.responses import JSONResponse


class TokenLogin(BaseModel):
    token: str


@router.post("/auth/token")
async def token_login(body: TokenLogin):
    tok = body.token.strip()
    if not tok:
        raise HTTPException(400, "Token is required")
    try:
        user_info = await GitHub(tok).me()
    except Exception:
        raise HTTPException(401, "Invalid GitHub token or missing permissions")
    
    sid, s = new_session()
    s.token = tok
    s.login = user_info.get("login", "github-user")
    s.user_id = str(user_info.get("id", "user"))
    s.avatar_url = user_info.get("avatar_url", "")
    s.demo = False
    
    resp = JSONResponse({"login": s.login, "user_id": s.user_id, "avatar_url": s.avatar_url, "demo": False, "csrf": s.csrf, "has_token": True})
    set_cookie(resp, sid)
    return resp


@router.post("/auth/guest")
async def guest_login():
    sid, s = new_session()
    s.login = "Workspace Analyst"
    s.user_id = "analyst"
    s.demo = False
    s.token = ""
    resp = JSONResponse({"login": s.login, "user_id": s.user_id, "demo": False, "csrf": s.csrf, "has_token": False})
    set_cookie(resp, sid)
    return resp


@router.post("/auth/demo")
async def demo(request: Request):
    if config.GITHUB_CONFIGURED:
        raise HTTPException(403, "Demo mode is disabled when GitHub OAuth is configured")
    sid, s = new_session()
    s.login, s.user_id, s.demo = "demo-user (local demo, not a GitHub account)", "demo", True
    resp = JSONResponse({"demo": True})
    set_cookie(resp, sid)
    return resp


@router.post("/auth/logout")
async def logout(request: Request, s: Session = Depends(csrf)):
    SESSIONS.pop(request.cookies.get(COOKIE, ""), None)
    return {"ok": True}


@router.get("/api/me")
async def me(s: Session = Depends(current)):
    return {"login": s.login, "user_id": s.user_id, "avatar_url": s.avatar_url, "demo": s.demo, "has_token": bool(s.token), "csrf": s.csrf}


@router.get("/api/auth-config")
async def auth_config():
    return {
        "github_configured": config.GITHUB_CONFIGURED,
        "pat_supported": True,
        "direct_scan": True,
        "demo_available": not config.GITHUB_CONFIGURED
    }
