import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator, model_validator
from app.security.validation import validate_repo_url, validate_ref


class RunState(str, Enum):
    queued = "queued"
    cloning = "cloning"
    scanning = "scanning"
    patching = "patching"
    reviewing = "reviewing"
    testing = "testing"
    completed = "completed"
    failed = "failed"
    rejected = "rejected"
    cancelled = "cancelled"
    awaiting_approval = "awaiting_approval"


TERMINAL = {RunState.completed, RunState.failed, RunState.rejected, RunState.cancelled}
_T = {RunState.completed, RunState.failed, RunState.rejected, RunState.cancelled}
_X = {RunState.failed, RunState.cancelled}
ALLOWED = {
    RunState.queued: {RunState.cloning, RunState.scanning} | _X,
    RunState.cloning: {RunState.scanning} | _X,
    RunState.scanning: {RunState.patching, RunState.completed} | _X,
    RunState.patching: {RunState.reviewing} | _X,
    RunState.reviewing: {RunState.patching, RunState.testing, RunState.rejected, RunState.completed} | _X,
    RunState.testing: {RunState.patching, RunState.awaiting_approval, RunState.completed} | _X,
    RunState.awaiting_approval: {RunState.completed, RunState.rejected} | _X,
    **{t: set() for t in _T},
}


class Finding(BaseModel):
    id: str
    rule: str
    severity: Literal["critical", "high", "medium", "low", "info"]
    file: str
    line: int = 0
    message: str
    evidence: str = ""


class ScanResult(BaseModel):
    status: Literal["ok", "unavailable", "failed"]
    tool: str = "semgrep"
    findings: list[Finding] = []
    note: str = ""


class Patch(BaseModel):
    status: Literal["ok", "unavailable", "failed"]
    diff: str = ""
    explanation: str = ""
    note: str = ""


class Review(BaseModel):
    status: Literal["ok", "unavailable", "failed"]
    verdict: Optional[Literal["approved", "changes_requested", "rejected"]] = None
    approved: Optional[bool] = None

    @model_validator(mode="after")
    def _sync(self):
        if self.verdict is None and self.approved is not None:
            self.verdict = "approved" if self.approved else "rejected"
        self.approved = None if self.verdict is None else self.verdict == "approved"
        return self
    issues: list[str] = []
    summary: str = ""


class CheckResult(BaseModel):
    name: str
    command: str = ""
    status: Literal["passed", "failed", "skipped", "unavailable"]
    exit_code: Optional[int] = None
    output: str = ""


class TestReport(BaseModel):
    __test__ = False
    checks: list[CheckResult] = []


class StageEvent(BaseModel):
    state: RunState
    at: datetime
    note: str = ""


class RunCreate(BaseModel):
    repo_url: str
    ref: Optional[str] = None
    auto_pr: bool = False  # pre-authorized automation; off by default

    @field_validator("repo_url")
    @classmethod
    def _url(cls, v):
        return validate_repo_url(v)

    @field_validator("ref")
    @classmethod
    def _ref(cls, v):
        return validate_ref(v) if v else v


class Run(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    repo_url: str
    ref: Optional[str] = None
    state: RunState = RunState.queued
    history: list[StageEvent] = []
    scan: Optional[ScanResult] = None
    patch: Optional[Patch] = None
    review: Optional[Review] = None
    tests: Optional[TestReport] = None
    verified: bool = False
    error: str = ""
    pr_url: Optional[str] = None
    user_id: str = "local"
    demo: bool = False
    base_sha: str = ""
    attempts: int = 0
    files: list[str] = []
    local_path: Optional[str] = None
    branch: Optional[str] = None
    commit_sha: Optional[str] = None
    policy: dict = {"auto_pr": False, "actions": []}
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
