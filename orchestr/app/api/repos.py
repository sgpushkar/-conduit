import re
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from app import config
from app.security.sessions import Session, current
from app.services.github import GitHub, GitHubError
from app.services.orchestrator import DEMO_URL
from app.services.proc import run_cmd

router = APIRouter(prefix="/api/repositories", tags=["repositories"])
NAME = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")


async def get_local_workspaces() -> list[dict]:
    workspaces = []
    w_dir = config.WORKSPACE_DIR
    if not w_dir.exists():
        return []
    
    for item in w_dir.iterdir():
        if not item.is_dir():
            continue
        # Check if repo is directly in item or in item/repo
        target_repo = item / "repo" if (item / "repo" / ".git").exists() else (item if (item / ".git").exists() else None)
        if target_repo:
            c, branch_out = await run_cmd(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=target_repo)
            branch = branch_out.strip() if c == 0 else "main"
            c2, remote_out = await run_cmd(["git", "config", "--get", "remote.origin.url"], cwd=target_repo)
            remote = remote_out.strip() if c2 == 0 and remote_out.strip() else f"local://{item.name}"
            
            workspaces.append({
                "full_name": f"local/{item.name}",
                "html_url": remote,
                "description": f"Local workspace on disk at {target_repo.resolve()}",
                "language": "Local",
                "default_branch": branch,
                "private": True,
                "updated_at": "On Disk",
                "source": "workspace",
                "local_path": str(target_repo.resolve())
            })
    return workspaces


@router.get("")
async def repositories(page: int = 1, q: str = "", s: Session = Depends(current)):
    results = []
    
    # 1. GitHub Repositories (if token available)
    if s.token:
        try:
            rows = await GitHub(s.token).repos(max(page, 1))
            keep = ("full_name", "html_url", "description", "language", "default_branch", "private", "updated_at")
            for r in rows:
                item = {k: r.get(k) for k in keep}
                item["source"] = "github"
                results.append(item)
        except GitHubError:
            pass
            
    # 2. Local Workspaces on Disk
    local_repos = await get_local_workspaces()
    results.extend(local_repos)
    
    # 3. Curated Security Testbeds / Benchmarks
    curated = [
        {
            "full_name": "sgpushkar/Vulnerability-repo_test",
            "html_url": "https://github.com/sgpushkar/Vulnerability-repo_test",
            "description": "Benchmark Node/Express security testbed (Path Traversal, Eval, NoSQLi)",
            "language": "JavaScript",
            "default_branch": "main",
            "private": False,
            "updated_at": "Benchmark",
            "source": "benchmark",
        },
        {
            "full_name": "OWASP/NodeGoat",
            "html_url": "https://github.com/OWASP/NodeGoat",
            "description": "OWASP NodeGoat security testbed project (Top 10 vulnerabilities)",
            "language": "JavaScript",
            "default_branch": "master",
            "private": False,
            "updated_at": "Benchmark",
            "source": "benchmark",
        },
        {
            "full_name": "pallets/flask",
            "html_url": "https://github.com/pallets/flask",
            "description": "The Python micro framework for building web applications",
            "language": "Python",
            "default_branch": "main",
            "private": False,
            "updated_at": "Popular",
            "source": "benchmark",
        },
        {
            "full_name": "gin-gonic/gin",
            "html_url": "https://github.com/gin-gonic/gin",
            "description": "Gin HTTP web framework written in Go",
            "language": "Go",
            "default_branch": "master",
            "private": False,
            "updated_at": "Popular",
            "source": "benchmark",
        },
    ]
    results.extend(curated)
    
    if s.demo and not results:
        results.append({
            "full_name": "conduit-demo/vulnerable-fixture",
            "html_url": DEMO_URL,
            "description": "Local fixture repository",
            "language": "Python",
            "default_branch": "main",
            "private": False,
            "updated_at": None,
            "source": "benchmark",
        })

    if q:
        query = q.lower()
        return [
            r for r in results
            if query in r.get("full_name", "").lower()
            or query in (r.get("description") or "").lower()
            or query in (r.get("language") or "").lower()
        ]
    return results


@router.get("/branches-by-url")
async def branches_by_url(repo_url: str, s: Session = Depends(current)):
    repo_url = repo_url.strip()
    if not repo_url or repo_url in (DEMO_URL, "local://fixture") or repo_url.startswith("local://"):
        return ["main"]
    code, out = await run_cmd(["git", "ls-remote", "--heads", repo_url])
    if code == 0 and out.strip():
        branch_names = [line.split("\t")[1].removeprefix("refs/heads/") for line in out.strip().splitlines() if "\trefs/heads/" in line]
        if branch_names:
            return sorted(branch_names)
    return ["main", "master"]


@router.get("/{owner}/{repo}/branches")
async def branches(owner: str, repo: str, s: Session = Depends(current)):
    if not (NAME.match(owner) and NAME.match(repo)):
        raise HTTPException(422, "Invalid repository name")
    if s.demo or f"{owner}/{repo}" in ("conduit-demo/vulnerable-fixture", "conduit/sample-vulnerable-app"):
        return ["main"]
    if s.token:
        try:
            return [b["name"] for b in await GitHub(s.token).branches(owner, repo)]
        except GitHubError:
            pass
    code, out = await run_cmd(["git", "ls-remote", "--heads", f"https://github.com/{owner}/{repo}.git"])
    if code == 0 and out.strip():
        branch_names = [line.split("\t")[1].removeprefix("refs/heads/") for line in out.strip().splitlines() if "\trefs/heads/" in line]
        if branch_names:
            return sorted(branch_names)
    raise HTTPException(404, "Repository not found or not accessible")
