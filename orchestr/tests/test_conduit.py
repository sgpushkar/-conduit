import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models.schemas import *
from app.security.validation import validate_repo_url, validate_ref
from app.services.orchestrator import Orchestrator, compute_verdict, InvalidTransition

OKS = ScanResult(status="ok", findings=[Finding(id="F1", rule="r", severity="high", file="a.py", message="m")])
OKP = Patch(status="ok", diff="d", explanation="e")


class Fake:
    def __init__(self, review, tests, scan=OKS, patch=OKP):
        self._r, self._t, self._s, self._p = review, tests, scan, patch
    async def clone(self, run, dest, token=""): dest.mkdir(parents=True)
    async def scan(self, w): return self._s
    async def patch(self, w, s, fb=None): return self._p
    async def head_sha(self, w): return "abc123"
    async def review(self, s, p): return self._r
    async def test(self, w, d): return self._t


def chk(*st): return TestReport(checks=[CheckResult(name="t", status=s) for s in st])
APPROVE = Review(status="ok", approved=True)


async def go(fake):
    o = Orchestrator(fake); r = o.create(RunCreate(repo_url="https://github.com/a/b")); await o._execute(r); return r


def test_url_validation():
    assert validate_repo_url("https://github.com/a/b.git") == "https://github.com/a/b"
    for bad in ["http://github.com/a/b", "https://evil.com/a/b", "https://github.com/a", "file:///etc/passwd", "https://github.com/../b"]:
        with pytest.raises(ValueError): validate_repo_url(bad)
    with pytest.raises(ValueError): validate_ref("--upload-pack=x")


def test_api_validation_and_404():
    c = TestClient(app)
    assert c.get("/health").json() == {"status": "ok"}
    assert c.post("/api/runs", json={"repo_url": "nope"}).status_code in (401, 403)
    assert c.get("/api/runs/missing").status_code == 401  # auth required


def test_invalid_transition():
    o = Orchestrator(); r = o.create(RunCreate(repo_url="https://github.com/a/b"))
    with pytest.raises(InvalidTransition): o.transition(r, RunState.testing)


def test_verdict_rules():
    assert compute_verdict(APPROVE, chk("passed"))
    assert not compute_verdict(APPROVE, chk("passed", "failed"))
    assert not compute_verdict(APPROVE, chk("skipped"))
    assert not compute_verdict(APPROVE, chk("unavailable"))
    assert not compute_verdict(Review(status="ok", approved=False), chk("passed"))
    assert not compute_verdict(None, chk("passed"))


async def test_happy_path_verified():
    r = await go(Fake(APPROVE, chk("passed")))
    assert r.state == RunState.awaiting_approval and r.verified  # never auto-committed
    assert [h.state for h in r.history][:4] == [RunState.queued, RunState.cloning, RunState.scanning, RunState.patching]


async def test_reviewer_rejects():
    r = await go(Fake(Review(status="ok", approved=False, issues=["unrelated edit"]), chk("passed")))
    assert r.state == RunState.rejected and not r.verified and r.tests is None


async def test_failed_tests_not_verified():
    r = await go(Fake(APPROVE, chk("failed")))
    assert r.state == RunState.completed and not r.verified


async def test_scan_unavailable_fails_honestly():
    r = await go(Fake(APPROVE, chk("passed"), scan=ScanResult(status="unavailable", note="no semgrep")))
    assert r.state == RunState.failed and "unavailable" in r.error


async def test_patch_unavailable_reports_partial():
    r = await go(Fake(APPROVE, chk("passed"), patch=Patch(status="unavailable", note="no key")))
    assert r.state == RunState.failed and r.scan is not None
