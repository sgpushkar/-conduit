import re
from pathlib import Path
from app.models.schemas import Finding, Patch, ScanResult
from app.services import llm
from app.services.proc import run_cmd

SYS = (
    llm.UNTRUSTED + " You are an expert automated security engineer. "
    "Fix the reported security vulnerabilities in the provided target files with minimal, robust changes. "
    "Focus on fixing application source code (e.g. routes, controllers, app logic) that causes the security finding. "
    "IMPORTANT: Do NOT import uninstalled third-party packages. Rely on standard built-in language APIs (e.g., path.basename, boundary containment checks, parameterized queries). "
    "FORMAT REQUIREMENT: Provide your code modifications in either of the following two standard formats:\n\n"
    "FORMAT OPTION A (SEARCH/REPLACE blocks - recommended):\n"
    "FILE: <relative_path>\n"
    "<<<<<<< SEARCH\n"
    "<exact original lines to replace>\n"
    "=======\n"
    "<remediated replacement lines>\n"
    ">>>>>>> REPLACE\n\n"
    "FORMAT OPTION B (Unified Git Diff):\n"
    "--- a/<relative_path>\n"
    "+++ b/<relative_path>\n"
    "@@ ... @@\n"
    "-<removed line>\n"
    "+<added line>\n\n"
    "After all file modifications, write a line '---EXPLANATION---' followed by a concise explanation of the security remediation."
)


def apply_search_replace_blocks(workdir: Path, text: str) -> list[Path]:
    """Applies SEARCH/REPLACE blocks to files in workdir with exact and whitespace-tolerant matching."""
    pattern = r"(?:FILE|File):\s*([^\n\r]+)[\r\n]+<<<<<<< SEARCH[\r\n]+([\s\S]*?)[\r\n]+=======[\r\n]+([\s\S]*?)[\r\n]+>>>>>>> REPLACE"
    blocks = re.findall(pattern, text)
    if not blocks:
        return []

    modified: list[Path] = []
    for file_rel, search_block, replace_block in blocks:
        file_rel = file_rel.strip().strip("`").strip("'").strip('"').strip()
        f_path = workdir / file_rel
        if not f_path.is_file():
            candidates = [p for p in workdir.glob(f"**/{Path(file_rel).name}") if p.is_file()]
            if candidates:
                f_path = candidates[0]

        if f_path.is_file():
            content = f_path.read_text(encoding="utf-8", errors="replace")
            norm_content = content.replace("\r\n", "\n")
            norm_search = search_block.replace("\r\n", "\n").strip("\n")
            norm_replace = replace_block.replace("\r\n", "\n").strip("\n")

            if norm_search in norm_content:
                new_content = norm_content.replace(norm_search, norm_replace, 1)
                f_path.write_text(new_content, encoding="utf-8")
                modified.append(f_path)
            else:
                # Whitespace-tolerant match
                search_lines = [l.strip() for l in norm_search.splitlines() if l.strip()]
                content_lines = norm_content.splitlines()
                match_start = -1
                for i in range(len(content_lines) - len(search_lines) + 1):
                    if all(content_lines[i + j].strip() == search_lines[j] for j in range(len(search_lines))):
                        match_start = i
                        break
                if match_start != -1:
                    new_lines = content_lines[:match_start] + norm_replace.splitlines() + content_lines[match_start + len(search_lines):]
                    f_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
                    modified.append(f_path)
    return modified


def extract_diff(raw: str) -> tuple[str, str]:
    diff_part, _, why = raw.partition("---EXPLANATION---")

    m = re.search(r"```(?:diff|patch)?\s*\n(.*?)\n```", diff_part, re.DOTALL)
    if m:
        extracted = m.group(1).strip()
    else:
        start_idx = -1
        for marker in ("diff --git", "--- a/", "--- "):
            idx = diff_part.find(marker)
            if idx != -1 and (start_idx == -1 or idx < start_idx):
                start_idx = idx
        if start_idx != -1:
            extracted = diff_part[start_idx:].strip()
        else:
            extracted = diff_part.strip().strip("`").removeprefix("diff").strip()

    extracted = re.sub(r"```+$", "", extracted).strip()
    return extracted + "\n", why.strip()


async def patch(workdir: Path, scan: ScanResult, feedback: str | None = None) -> Patch:
    # Prioritize application source code files over test harness files
    def is_test(fpath: str) -> bool:
        low = fpath.lower().replace("\\", "/")
        return any(x in low for x in ("/test/", "/tests/", ".test.", ".spec.", "_test.", "security-tests"))

    SEV = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}
    src_findings = [f for f in scan.findings if not is_test(f.file)]
    test_findings = [f for f in scan.findings if is_test(f.file)]
    src_findings.sort(key=lambda f: SEV.get(f.severity.lower(), 1), reverse=True)
    test_findings.sort(key=lambda f: SEV.get(f.severity.lower(), 1), reverse=True)
    targets = (src_findings or test_findings)[:5]

    # Group findings by file to avoid duplicated prompt context
    files_to_findings: dict[str, list[Finding]] = {}
    for f in targets:
        files_to_findings.setdefault(f.file, []).append(f)

    ctx = []
    for rel_file, f_list in files_to_findings.items():
        p = workdir / rel_file
        if p.is_file() and workdir.resolve() in p.resolve().parents:
            content = p.read_text(encoding="utf-8", errors="replace")[:6000]
            findings_summary = "\n".join(f"- Finding [{f.id}] [{f.severity}] Rule '{f.rule}' (line {f.line}): {f.message}" for f in f_list)
            ctx.append(f"### Target File: {rel_file}\nVulnerabilities to remediate:\n{findings_summary}\n\nCurrent file content:\n```\n{content}\n```")

    user_prompt = "\n\n".join(ctx) + "\n\nCRITICAL: Provide clear, working remediations for all target files with actionable vulnerabilities. Do NOT add uninstalled npm packages."
    if feedback:
        user_prompt += f"\n\nPREVIOUS ATTEMPT REVIEWER FEEDBACK (you MUST fix these specific issues):\n{feedback}"

    try:
        raw = await llm.complete(SYS, user_prompt)
    except llm.LLMUnavailable as e:
        return Patch(status="unavailable", note=str(e))
    except Exception as e:
        return Patch(status="failed", note=f"LLM call failed: {type(e).__name__}: {str(e)[:150]}")

    diff_part, _, why = raw.partition("---EXPLANATION---")
    why = why.strip()

    # Strategy 1: Check for SEARCH/REPLACE blocks in the LLM response
    if "<<<<<<< SEARCH" in diff_part:
        modified = apply_search_replace_blocks(workdir, diff_part)
        if modified:
            c, git_diff = await run_cmd(["git", "diff"], cwd=workdir)
            await run_cmd(["git", "checkout", "--", "."], cwd=workdir)
            if c == 0 and git_diff.strip():
                # Verify git apply cleanly accepts this patch
                (workdir / ".conduit.patch").write_text(git_diff)
                code, out = await run_cmd(["git", "apply", "--check", "--recount", "--ignore-whitespace", ".conduit.patch"], cwd=workdir)
                (workdir / ".conduit.patch").unlink(missing_ok=True)
                if code == 0:
                    return Patch(status="ok", diff=git_diff, explanation=why)

    # Strategy 2: Standard Unified Diff
    diff, extracted_why = extract_diff(raw)
    why = why or extracted_why
    (workdir / ".conduit.patch").write_text(diff)
    code, out = await run_cmd(["git", "apply", "--check", "--recount", "--ignore-whitespace", ".conduit.patch"], cwd=workdir)
    (workdir / ".conduit.patch").unlink(missing_ok=True)
    if code == 0:
        return Patch(status="ok", diff=diff, explanation=why)

    # Strategy 3: Attempt fuzzy apply and generate clean git diff
    (workdir / ".conduit.patch").write_text(diff)
    c, _ = await run_cmd(["git", "apply", "--recount", "--ignore-whitespace", ".conduit.patch"], cwd=workdir)
    (workdir / ".conduit.patch").unlink(missing_ok=True)
    if c == 0:
        c2, clean_diff = await run_cmd(["git", "diff"], cwd=workdir)
        await run_cmd(["git", "checkout", "--", "."], cwd=workdir)
        if c2 == 0 and clean_diff.strip():
            return Patch(status="ok", diff=clean_diff, explanation=why)

    return Patch(status="failed", diff=diff, note=f"Generated diff does not apply: {out[-300:]}")
