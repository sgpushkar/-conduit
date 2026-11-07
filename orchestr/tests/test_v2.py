import pytest
from fastapi.testclient import TestClient
from app import config
from app.main import app
from app.models.schemas import *
from app.security.sessions import SESSIONS, Session
from app.services.orchestrator import Orchestrator, PolicyError
from tests.test_conduit import APPROVE, Fake, OKP, OKS, chk

URL = "https://github.com/a/b"


class FakeGH:
    sha, default, push = "abc123", "main", True
    def __init__(self, t): pass
    async def repo(self, o, r): return {"default_branch": self.default, "permissions": {"push": self.push}}
    async def branch_sha(self, o, r, b): return self.sha
    async def create_pr(self, *a): return {"html_url": "https://github.com/a/b/pull/1"}


class Pub(Fake):
    def __init__(self, *a):
        super().__init__(*a); self.pushed = []
    async def apply(self, w, d): return True
    async def commit_push(self, w, branch, *a): self.pushed.append(branch)


async def verified_run(o):
    r = o.create(RunCreate(repo_url=URL), "u1"); await o._execute(r); return r


def orch(review=APPROVE, tests=chk("passed"), gh=FakeGH):
    return Orchestrator(Pub(review, tests), gh)


def client():
    c = TestClient(app); SESSIONS.clear()
    c.post("/auth/demo"); return c


def test_unauthenticated_and_csrf():
    c = TestClient(app); SESSIONS.clear()
    assert c.get("/api/me").status_code == 401
    c = client()
    csrf = c.get("/api/me").json()["csrf"]
    assert c.post("/api/runs", json={"repo_url": URL}).status_code == 403
    assert c.post("/api/runs", json={"repo_url": "bad"}, headers={"X-CSRF-Token": csrf}).status_code == 422


def test_oauth_state_validation(monkeypatch):
    c = TestClient(app); SESSIONS.clear()
    assert c.get("/auth/github/callback?code=x&state=y").status_code == 400
    monkeypatch.setattr(config, "GITHUB_CONFIGURED", True)
    r = c.get("/auth/github/login", follow_redirects=False)
    assert "code_challenge_method=S256" in r.headers["location"]
    assert c.get("/auth/github/callback?code=x&state=wrong").status_code == 400


def test_runs_isolated_between_users():
    c = client(); o = Orchestrator(); run = o.create(RunCreate(repo_url=URL), "someone-else")
    from app.api import runs; runs.orch.runs[run.id] = run
    assert c.get(f"/api/runs/{run.id}").status_code == 404


async def test_retry_loop_bounded_and_recovers(monkeypatch):
    monkeypatch.setattr(config, "MAX_ATTEMPTS", 2)
    seq = [Review(status="ok", verdict="changes_requested", issues=["scope"]), APPROVE]
    o = orch(); o.pipe.review = lambda s, p: _ret(seq.pop(0))
    r = await verified_run(o)
    assert r.attempts == 2 and r.state == RunState.awaiting_approval and r.verified
    o2 = orch(); o2.pipe.review = lambda s, p: _ret(Review(status="ok", verdict="changes_requested", issues=["x"]))
    r2 = await verified_run(o2)
    assert r2.attempts == 2 and r2.state == RunState.completed and not r2.verified


async def _ret(x): return x


async def test_failed_tests_retry_then_unverified(monkeypatch):
    monkeypatch.setattr(config, "MAX_ATTEMPTS", 2)
    r = await verified_run(orch(tests=TestReport(checks=[CheckResult(name="t", status="failed", output="boom")])))
    assert r.attempts == 2 and not r.verified and r.state == RunState.completed


async def test_approval_enforced_and_publishes_to_branch():
    o = orch(); r = await verified_run(o)
    assert r.state == RunState.awaiting_approval
    out = await o.publish(r, "tok")
    assert out["branch"].startswith("conduit/") and o.pipe.pushed == [out["branch"]] and r.pr_url
    with pytest.raises(PolicyError) as e: await o.publish(r, "tok")  # already completed
    assert e.value.status == 409


async def test_unverified_cannot_publish():
    o = orch(tests=chk("failed")); r = await verified_run(o)
    with pytest.raises(PolicyError) as e: await o.publish(r, "tok")
    assert e.value.status == 409 and not o.pipe.pushed


async def test_default_branch_and_base_change_blocked():
    o = orch(); r = await verified_run(o)
    with pytest.raises(PolicyError) as e: await o.publish(r, "t", branch="main")
    assert e.value.status == 403
    FakeGH.sha = "changed"
    try:
        with pytest.raises(PolicyError) as e: await o.publish(r, "t")
        assert e.value.status == 409
    finally: FakeGH.sha = "abc123"


async def test_demo_never_touches_github():
    o = orch(); r = o.create(RunCreate(repo_url=URL), "demo", demo=True); await o._execute(r)
    with pytest.raises(PolicyError) as e: await o.publish(r, "")
    assert e.value.status == 403


async def test_auto_mode_off_by_default_and_never_for_unverified():
    o = orch(); r = await verified_run(o)
    assert not r.policy["auto_pr"] and r.state == RunState.awaiting_approval
    o2 = orch(tests=chk("failed")); r2 = o2.create(RunCreate(repo_url=URL, auto_pr=True), "u"); await o2._execute(r2)
    assert not o2.pipe.pushed and not r2.pr_url and r2.state == RunState.completed


async def test_auto_mode_publishes_verified_only():
    o = orch(); r = o.create(RunCreate(repo_url=URL, auto_pr=True), "u"); await o._execute(r)
    assert r.pr_url and r.state == RunState.completed and o.pipe.pushed[0].startswith("conduit/")


async def test_publish_action_local():
    o = orch(); r = await verified_run(o)
    res = await o.publish(r, "", action="local")
    assert res["status"] == "saved_locally"
    assert r.state == RunState.completed
    assert not o.pipe.pushed


async def test_publish_action_branch():
    o = orch(); r = await verified_run(o)
    res = await o.publish(r, "token", action="branch")
    assert res["pushed"] is True
    assert r.state == RunState.completed
    assert not r.pr_url
    assert o.pipe.pushed[0].startswith("conduit/")


def test_repositories_listing_with_benchmarks():
    c = client()
    res = c.get("/api/repositories")
    assert res.status_code == 200
    repos = res.json()
    assert any("Vulnerability-repo_test" in r["full_name"] or "NodeGoat" in r["full_name"] for r in repos)

