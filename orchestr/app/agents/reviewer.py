import json
from app.models.schemas import Patch, Review, ScanResult
from app.services import llm

SYS = (llm.UNTRUSTED + ' You are an independent reviewer. Decide if the diff fixes the findings without unrelated changes '
       'or regressions. Be skeptical. Reply with JSON only: {"verdict": "approved"|"changes_requested"|"rejected", "issues": [str], "summary": str}')


async def review(scan: ScanResult, patch: Patch) -> Review:
    try:
        raw = await llm.complete(SYS, "FINDINGS:\n" + "\n".join(f"{f.id} {f.rule} {f.file}:{f.line} {f.message}" for f in scan.findings)
                                 + "\n\nDIFF:\n" + patch.diff)
        d = json.loads(raw[raw.index("{"): raw.rindex("}") + 1])
        return Review(status="ok", verdict=d["verdict"], issues=list(d.get("issues", [])), summary=str(d.get("summary", "")))
    except llm.LLMUnavailable as e:
        return Review(status="unavailable", summary=str(e))
    except Exception as e:
        return Review(status="failed", summary=f"Review could not be completed: {type(e).__name__}")
