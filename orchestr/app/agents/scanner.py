import json
from pathlib import Path
from app import config
from app.models.schemas import Finding, ScanResult
from app.services.proc import run_cmd

SEV = {"ERROR": "high", "WARNING": "medium", "INFO": "low"}


def parse_semgrep(raw: str) -> list[Finding]:
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1:
        data = json.loads(raw[start:end+1])
    else:
        data = json.loads(raw)
    out = []
    for i, r in enumerate(data.get("results", [])):
        x = r.get("extra", {})
        out.append(Finding(id=f"F{i+1}", rule=r.get("check_id", "unknown"),
                           severity=SEV.get(x.get("severity", ""), "info"), file=r.get("path", ""),
                           line=r.get("start", {}).get("line", 0), message=x.get("message", ""),
                           evidence=(x.get("lines") or "")[:500]))
    return out


async def scan(workdir: Path, run=None) -> ScanResult:
    cfg = config.SEMGREP_CONFIG or "p/default"
    cmd = ["semgrep", "--config", cfg, "--json", "--quiet"]
    if cfg != "auto":
        cmd.append("--metrics=off")
    cmd.append(".")
    code, out = await run_cmd(cmd, cwd=workdir)
    if code is None:
        return ScanResult(status="unavailable", note="semgrep is not installed; no scan was performed")
    try:
        return ScanResult(status="ok", findings=parse_semgrep(out))
    except Exception:
        return ScanResult(status="failed", note=f"semgrep exited {code}: {out[-500:]}")
