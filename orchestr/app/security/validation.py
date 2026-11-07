import re
from pathlib import Path

_URL = re.compile(r"^https://github\.com/([A-Za-z0-9_.-]{1,100})/([A-Za-z0-9_.-]{1,100}?)(\.git)?/?$")
_REF = re.compile(r"^[A-Za-z0-9._/-]{1,100}$")


def validate_repo_url(url: str) -> str:
    url = url.strip()
    m = _URL.match(url)
    if not m or m.group(1) in (".", "..") or m.group(2) in (".", ".."):
        raise ValueError("Use a public https://github.com/<owner>/<repo> URL")
    return f"https://github.com/{m.group(1)}/{m.group(2)}"


def validate_ref(ref: str) -> str:
    if not _REF.match(ref) or ref.startswith("-") or ".." in ref:
        raise ValueError("Invalid branch or commit reference")
    return ref


def safe_join(root: Path, rel: str) -> Path:
    p = (root / rel).resolve()
    if root.resolve() not in p.parents and p != root.resolve():
        raise ValueError("Path escapes workspace")
    return p
