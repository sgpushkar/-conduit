import asyncio, base64, re, shutil, tempfile
from datetime import datetime, timezone
from pathlib import Path
from app import config
from app.agents import coder, reviewer, scanner, tester
from app.models.schemas import ALLOWED, TERMINAL, Review, Run, RunCreate, RunState, StageEvent, TestReport
from app.security.validation import validate_ref
from app.services.github import GitHub
from app.services.proc import run_cmd
from app.services.store import MemoryStore

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "vulnerable_app"
DEMO_URL = "https://github.com/conduit-demo/vulnerable-fixture"


class InvalidTransition(Exception): pass
class PolicyError(Exception):
    def __init__(self, status: int, msg: str): self.status, self.msg = status, msg


def compute_verdict(review: Review | None, tests: TestReport | None) -> bool:
    """Verified only if review approved AND >=1 check passed AND none failed/unavailable."""
    if not review or review.status != "ok" or review.verdict != "approved" or not tests or not tests.checks:
        return False
    s = [c.status for c in tests.checks]
    return "passed" in s and not any(x in ("failed", "unavailable") for x in s)


def _auth_env(token: str):
    if not token:
        return {}
    b = base64.b64encode(f"x-access-token:{token}".encode()).decode()  # via env: not visible in argv
    return {"GIT_CONFIG_COUNT": "1", "GIT_CONFIG_KEY_0": "http.extraheader", "GIT_CONFIG_VALUE_0": f"Authorization: Basic {b}"}


class Pipeline:
    async def clone(self, run: Run, dest: Path, token: str = ""):
        if run.demo:
            shutil.copytree(FIXTURE, dest)
            for a in (["init", "-q"], ["add", "."], ["-c", "user.name=c", "-c", "user.email=c@c", "commit", "-qm", "fixture"]):
                await run_cmd(["git", *a], cwd=dest)
            return
        args = ["git", "clone", "--no-tags", "--config", "core.hooksPath="]
        if run.ref:
            args += ["--branch", run.ref]
        code, out = await run_cmd(args + ["--", run.repo_url, str(dest)], env=_auth_env(token))
        if code != 0:
            raise RuntimeError(f"clone failed: {out[-250:].strip()}")

    async def head_sha(self, work: Path) -> str:
        return (await run_cmd(["git", "rev-parse", "HEAD"], cwd=work))[1].strip()

    async def commit_push(self, work: Path, branch: str, msg: str, token: str, url: str):
        # Switch to branch if not already on it
        c_br, _ = await run_cmd(["git", "checkout", branch], cwd=work)
        if c_br != 0:
            c_br2, _ = await run_cmd(["git", "checkout", "-b", branch], cwd=work)
            if c_br2 != 0:
                raise RuntimeError(f"failed to checkout branch {branch}")
        
        await run_cmd(["git", "add", "-A"], cwd=work)
        c_status, s_out = await run_cmd(["git", "status", "--porcelain"], cwd=work)
        if c_status == 0 and s_out.strip():
            c, o = await run_cmd([
                "git", "-c", "user.name=CONDUIT", "-c", "user.email=conduit@users.noreply.github.com",
                "commit", "-m", msg
            ], cwd=work)
            if c != 0:
                raise RuntimeError(f"git commit failed: {o}")
                
        c, o = await run_cmd(["git", "push", "-u", "--", url, f"HEAD:refs/heads/{branch}"], cwd=work, env=_auth_env(token))
        if c != 0:
            raise RuntimeError(f"push failed: {o[-200:].strip()}")

    async def apply(self, work: Path, diff: str) -> bool:
        (work / ".conduit.patch").write_text(diff)
        c, _ = await run_cmd(["git", "apply", "--recount", "--ignore-whitespace", ".conduit.patch"], cwd=work)
        (work / ".conduit.patch").unlink(missing_ok=True)
        return c == 0

    scan = staticmethod(scanner.scan)
    patch = staticmethod(coder.patch)
    review = staticmethod(reviewer.review)
    test = staticmethod(tester.run_tests)


def changed_files(diff: str) -> list[str]:
    files = []
    for l in diff.splitlines():
        if l.startswith("+++ b/"):
            files.append(l[6:].strip())
        elif l.startswith("+++ ") and not l.startswith("+++ /dev/null"):
            p = l[4:].strip()
            files.append(p[2:] if p.startswith("b/") else p)
    return list(dict.fromkeys(files))


class Orchestrator:
    def __init__(self, pipeline=None, gh=GitHub, store=None, queue=None):
        self.store, self.queue = store or MemoryStore(), queue
        self.runs: dict[str, Run] = {}
        self.tasks: dict[str, asyncio.Task] = {}
        self._tokens: dict[str, str] = {}  # never serialized
        self.pipe, self.gh = pipeline or Pipeline(), gh

    def create(self, req: RunCreate, user_id="local", demo=False, token="") -> Run:
        run = Run(repo_url=DEMO_URL if demo else req.repo_url, ref=req.ref, user_id=user_id, demo=demo,
                  policy={"auto_pr": bool(req.auto_pr and not demo), "actions": []})
        run.history.append(StageEvent(state=RunState.queued, at=datetime.now(timezone.utc)))
        self.runs[run.id], self._tokens[run.id] = run, token
        return run

    async def start(self, run: Run, token: str = ""):
        await self.store.save(run)
        if self.queue is not None:  # tokens cross Redis only encrypted
            from app.security import crypto
            await self.queue.enqueue_job("execute_run", run.id, crypto.encrypt(token) if token else "")
        else:
            self.tasks[run.id] = asyncio.create_task(self._execute(run))

    async def load(self, run_id: str):
        return await self.store.get(run_id) or self.runs.get(run_id)

    def transition(self, run: Run, new: RunState, note: str = ""):
        if new not in ALLOWED[run.state]:
            raise InvalidTransition(f"{run.state.value} -> {new.value}")
        run.state = new
        run.history.append(StageEvent(state=new, at=datetime.now(timezone.utc), note=note))

    async def _go(self, run: Run, new: RunState, note: str = ""):
        if new not in TERMINAL and await self.store.is_cancelled(run.id):
            raise asyncio.CancelledError()
        self.transition(run, new, note)
        await self.store.save(run)

    async def _fail(self, run: Run, msg: str, state=RunState.failed):
        if run.state not in TERMINAL:
            run.error = msg
            await self._go(run, state, msg)

    async def _execute(self, run: Run):
        # Persistent workspace directory for in-place cloning and inspection
        safe_name = re.sub(r"[^A-Za-z0-9_.-]", "_", run.repo_url.rstrip("/").split("/")[-1])
        repo_workspace = config.WORKSPACE_DIR / f"{safe_name}_{run.id[:8]}"
        repo_workspace.mkdir(parents=True, exist_ok=True)
        work = repo_workspace / "repo"
        
        try:
            await self._go(run, RunState.cloning)
            await self.pipe.clone(run, work, self._tokens.get(run.id, ""))
            run.base_sha = await self.pipe.head_sha(work)
            run.local_path = str(work.resolve())
            
            await self._go(run, RunState.scanning)
            run.scan = await self.pipe.scan(work)
            if run.scan.status != "ok":
                return await self._fail(run, f"Scan {run.scan.status}: {run.scan.note}")
            if not run.scan.findings:
                return await self._go(run, RunState.completed, "No findings; nothing to patch")
                
            feedback = None
            for attempt in range(1, config.MAX_ATTEMPTS + 1):
                run.attempts = attempt
                await self._go(run, RunState.patching, f"attempt {attempt}")
                run.patch = await self.pipe.patch(work, run.scan, feedback)
                if run.patch.status != "ok":
                    return await self._fail(run, f"Patch {run.patch.status}: {run.patch.note}")
                run.files = changed_files(run.patch.diff)
                
                await self._go(run, RunState.reviewing)
                run.review = await self.pipe.review(run.scan, run.patch)
                if run.review.status != "ok":
                    return await self._fail(run, f"Review {run.review.status}: {run.review.summary}")
                if run.review.verdict == "rejected":
                    return await self._go(run, RunState.rejected, "Reviewer rejected the patch")
                if run.review.verdict == "changes_requested":
                    feedback = "; ".join(run.review.issues) or run.review.summary
                    if attempt == config.MAX_ATTEMPTS:
                        return await self._go(run, RunState.completed, "Changes still requested at retry limit; not verified")
                    continue
                    
                await self._go(run, RunState.testing)
                run.tests = await self.pipe.test(work, run.patch.diff)
                run.verified = compute_verdict(run.review, run.tests)
                if run.verified:
                    break
                feedback = "\n".join(f"{c.name} {c.status}: {c.output[-1500:]}" for c in run.tests.checks if c.status == "failed")
                if not feedback or attempt == config.MAX_ATTEMPTS:
                    return await self._go(run, RunState.completed, "Not verified")

            # In-place remediation: Create dedicated branch and commit fixes locally
            branch_name = f"conduit/fix-{run.id[:8]}"
            if (work / ".git").exists():
                await run_cmd(["git", "checkout", "-B", branch_name], cwd=work)
                await run_cmd(["git", "add", "-A"], cwd=work)
                commit_msg = (
                    f"fix: automated security remediation by CONDUIT\n\n"
                    f"Remediated {len(run.scan.findings)} vulnerability finding(s)."
                )
                await run_cmd([
                    "git", "-c", "user.name=CONDUIT", "-c", "user.email=conduit@users.noreply.github.com",
                    "commit", "-m", commit_msg
                ], cwd=work)
                
                c_sha, sha_out = await run_cmd(["git", "rev-parse", "HEAD"], cwd=work)
                run.branch = branch_name
                run.commit_sha = sha_out.strip() if c_sha == 0 else ""
            else:
                run.branch = branch_name
                run.commit_sha = run.base_sha or "local"
            run.local_path = str(work.resolve())

            await self._go(run, RunState.awaiting_approval, "Verified; waiting for user push decision")
            
            if run.policy["auto_pr"] and not run.demo:
                run.policy["actions"].append("auto-publish attempted under pre-authorized policy")
                try:
                    await self.publish(run, self._tokens.get(run.id, ""), action="pr")
                except PolicyError as e:
                    run.error = e.msg
        except asyncio.CancelledError:
            await self._fail(run, "cancelled", RunState.cancelled)
        except Exception as e:
            await self._fail(run, f"Internal error ({type(e).__name__}): {str(e)[:160]}")
        finally:
            # Preserve workspace on disk for user inspection unless failed and unverified
            if run.state in (RunState.failed, RunState.cancelled) and not run.verified:
                shutil.rmtree(repo_workspace, ignore_errors=True)
            else:
                run.local_path = str(work.resolve())

    async def publish(
        self,
        run: Run,
        token: str,
        branch: str | None = None,
        message: str | None = None,
        action: str = "pr",
    ) -> dict:
        if run.state != RunState.awaiting_approval or not run.verified or not run.patch:
            raise PolicyError(409, "Run is not verified and awaiting approval")
        
        # 1. Action: Keep local only
        if action == "local":
            run.policy["actions"].append(f"changes kept in local workspace at {run.local_path} on branch {run.branch}")
            await self._go(run, RunState.completed, "Changes preserved in local repository workspace")
            return {"status": "saved_locally", "local_path": run.local_path, "branch": run.branch}

        # 2. Action: Discard local changes
        if action == "discard":
            await self.reject(run)
            return {"status": "discarded"}

        # 3. Action: Push branch or Push & Create PR
        if run.demo:
            raise PolicyError(403, "Demo mode performs no GitHub operations. Use 'Keep Local Only' or download the patch.")
            
        o, r = run.repo_url.rstrip("/").split("/")[-2:]
        branch = branch or run.branch or f"conduit/fix-{run.id[:8]}"
        try:
            validate_ref(branch)
        except ValueError:
            raise PolicyError(422, "Invalid branch name")
            
        gh = self.gh(token)
        info = await gh.repo(o, r)
        base = run.ref or info["default_branch"]
        if branch in (info["default_branch"], base) or not branch.startswith("conduit/"):
            raise PolicyError(403, "Refusing to push to a default or base branch; use a conduit/* branch")
        if not info.get("permissions", {}).get("push"):
            raise PolicyError(403, "Your account lacks push permission on this repository")
        if await gh.branch_sha(o, r, base) != run.base_sha:
            raise PolicyError(409, "Base branch changed since the scan. Start a new run.")

        # Push directly from the preserved local workspace if available
        work = Path(run.local_path) if run.local_path and Path(run.local_path).exists() else None
        need_cleanup = False
        if not work:
            work = Path(tempfile.mkdtemp(prefix="conduit-pub-")) / "repo"
            need_cleanup = True
            await self.pipe.clone(run, work, token)
            if not await self.pipe.apply(work, run.patch.diff):
                raise PolicyError(409, "Patch no longer applies cleanly")

        try:
            msg = message or f"fix: automated security remediation by CONDUIT"
            await self.pipe.commit_push(work, branch, msg, token, run.repo_url)
            run.branch = branch

            if action == "branch":
                run.policy["actions"].append(f"pushed branch {branch} to remote origin")
                await self._go(run, RunState.completed, f"Pushed branch {branch} to remote")
                return {"pushed": True, "branch": branch}

            # Action: PR
            body = "\n".join([
                "### Automated Security Remediation by CONDUIT",
                "",
                f"**Branch**: `{branch}`",
                "",
                "#### Identified Findings Remediated:",
                *(f"- `{f.severity.upper()}` {f.rule} in `{f.file}:{f.line}`: {f.message}" for f in (run.scan.findings if run.scan else [])),
                "",
                f"**Reviewer Audit**: {run.review.verdict if run.review else 'approved'}",
                "",
                "#### Test Suite Verification:",
                *(f"- {c.name}: `{c.status}`" for c in (run.tests.checks if run.tests else [])),
            ])
            pr = await gh.create_pr(o, r, branch, base, message or "Security remediation (CONDUIT)", body)
            run.pr_url = pr["html_url"]
            run.policy["actions"].append(f"pushed {branch}, opened PR")
            await self._go(run, RunState.completed, "Pull request created")
            return {"pr_url": run.pr_url, "branch": branch}
        except PolicyError:
            raise
        except Exception as e:
            raise PolicyError(502, f"Commit or pull request failed ({type(e).__name__}): {str(e)[:160]}")
        finally:
            if need_cleanup and work:
                shutil.rmtree(work.parent, ignore_errors=True)

    async def reject(self, run: Run):
        if run.state != RunState.awaiting_approval:
            raise PolicyError(409, "Nothing to reject")
        if run.local_path and Path(run.local_path).exists():
            work = Path(run.local_path)
            base = run.ref or "main"
            await run_cmd(["git", "checkout", base], cwd=work)
            if run.branch:
                await run_cmd(["git", "branch", "-D", run.branch], cwd=work)
        await self._go(run, RunState.rejected, "Rejected by user")

    async def cancel(self, run_id: str) -> bool:
        if self.queue is not None:
            await self.store.request_cancel(run_id)
            return True
        t = self.tasks.get(run_id)
        if t and not t.done():
            t.cancel()
            return True
        return False

    def report(self, run: Run) -> dict:
        return {
            "run_id": run.id,
            "repo_url": run.repo_url,
            "base_sha": run.base_sha,
            "state": run.state,
            "verified": run.verified,
            "attempts": run.attempts,
            "files": run.files,
            "local_path": run.local_path,
            "branch": run.branch,
            "commit_sha": run.commit_sha,
            "findings": run.scan.findings if run.scan else [],
            "diff": run.patch.diff if run.patch else "",
            "rationale": run.patch.explanation if run.patch else "",
            "review": run.review,
            "tests": run.tests,
            "history": run.history,
            "policy": run.policy,
            "error": run.error,
            "pr_url": run.pr_url,
            "demo": run.demo,
        }


orchestrator = Orchestrator()
