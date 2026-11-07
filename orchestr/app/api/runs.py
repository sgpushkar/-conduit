from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from app.models.schemas import Run, RunCreate, RunState, TERMINAL
from app.security.sessions import Session, csrf, current
from app.services.github import GitHub, GitHubError
from app.services.orchestrator import PolicyError, orchestrator as orch

router = APIRouter(prefix="/api/runs", tags=["runs"])


class Approval(BaseModel):
    confirm: bool = False
    action: Literal["pr", "branch", "local", "discard"] = "pr"
    branch: str | None = None
    message: str | None = None
    token: str | None = None


async def _get(run_id: str, s: Session) -> Run:
    r = await orch.load(run_id)
    if not r:
        raise HTTPException(404, "Run not found")
    # Allow if matching user or if both belong to local workspace analyst / demo sessions
    same_local = (r.user_id in ("analyst", "local", "demo") or r.user_id.startswith("analyst_")) and \
                 (s.user_id in ("analyst", "local", "demo") or s.user_id.startswith("analyst_"))
    if r.user_id != s.user_id and not same_local:
        raise HTTPException(404, "Run not found")
    return r


@router.post("", status_code=202, response_model=Run)
async def create_run(req: RunCreate, s: Session = Depends(csrf)):
    if s.token:
        o, r = req.repo_url.rstrip("/").split("/")[-2:]
        try:
            info = await GitHub(s.token).repo(o, r)
            if req.auto_pr and not info.get("permissions", {}).get("push"):
                req.auto_pr = False
        except GitHubError:
            pass  # git clone will validate repository access with the token
    elif not s.demo:
        if req.auto_pr:
            req.auto_pr = False  # token required for publishing; proceed with remediation and prompt on approval
        o, r = req.repo_url.rstrip("/").split("/")[-2:]
        try:
            await GitHub("").repo(o, r)
        except GitHubError:
            pass  # git clone will validate the repository
    run = orch.create(req, s.user_id, s.demo, s.token)
    await orch.start(run, s.token)
    return run


@router.get("/{run_id}", response_model=Run)
async def get_run(run_id: str, s: Session = Depends(current)):
    return await _get(run_id, s)


@router.get("/{run_id}/report")
async def report(run_id: str, s: Session = Depends(current)):
    r = await _get(run_id, s)
    if r.state not in TERMINAL | {RunState.awaiting_approval}:
        raise HTTPException(409, "Run not finished")
    return orch.report(r)


@router.get("/{run_id}/diff")
async def diff(run_id: str, download: bool = False, s: Session = Depends(current)):
    r = await _get(run_id, s)
    if not r.patch or not r.patch.diff:
        raise HTTPException(404, "No patch")
    if download:
        return Response(r.patch.diff, media_type="text/x-diff", headers={"Content-Disposition": f'attachment; filename="conduit-{r.id[:8]}.patch"'})
    return {"diff": r.patch.diff, "files": r.files, "verified": r.verified}


@router.post("/{run_id}/approve")
async def approve(run_id: str, body: Approval, s: Session = Depends(csrf)):
    r = await _get(run_id, s)
    if not body.confirm:
        raise HTTPException(422, "Explicit confirmation required")
    token = (body.token or "").strip() or s.token
    try:
        return await orch.publish(r, token, body.branch, body.message, action=body.action)
    except PolicyError as e:
        raise HTTPException(e.status, e.msg)


@router.post("/{run_id}/reject")
async def reject(run_id: str, s: Session = Depends(csrf)):
    try:
        await orch.reject(await _get(run_id, s))
    except PolicyError as e:
        raise HTTPException(e.status, e.msg)
    return {"ok": True}


@router.post("/{run_id}/revoke-automation")
async def revoke(run_id: str, s: Session = Depends(csrf)):
    r = await _get(run_id, s)
    r.policy["auto_pr"] = False
    r.policy["actions"].append("automation revoked by user")
    await orch.store.save(r)
    return r.policy


@router.post("/{run_id}/cancel")
async def cancel(run_id: str, s: Session = Depends(csrf)):
    r = await _get(run_id, s)
    if r.state in TERMINAL:
        raise HTTPException(409, f"Run already {r.state.value}")
    return {"cancelled": await orch.cancel(run_id)}


@router.get("/{run_id}/pull-request")
async def pull_request(run_id: str, s: Session = Depends(current)):
    r = await _get(run_id, s)
    if not r.pr_url:
        raise HTTPException(404, "No pull request was created")
    return {"pr_url": r.pr_url}
