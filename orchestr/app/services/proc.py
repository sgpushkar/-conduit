import asyncio, os, shutil, subprocess, sys
from pathlib import Path
from app import config


def _sync_run(args: list[str], cwd, timeout, env):
    # Retain full environment (critical on Windows for SystemRoot / Winsock / DNS resolution)
    e = dict(os.environ)
    e["GIT_TERMINAL_PROMPT"] = "0"

    # Prepend virtualenv Scripts / bin directory to PATH so semgrep, uvicorn, git etc. are discovered
    venv_bin = str(Path(sys.executable).parent)
    e["PATH"] = f"{venv_bin}{os.pathsep}{e.get('PATH', '')}"

    if env:
        e.update(env)

    # Resolve executable path using updated PATH (handles semgrep -> semgrep.exe on Windows)
    cmd_args = list(args)
    if cmd_args:
        exe_name = cmd_args[0]
        if not Path(exe_name).is_file():
            resolved = shutil.which(exe_name, path=e.get("PATH"))
            if resolved:
                cmd_args[0] = resolved

    try:
        res = subprocess.run(
            cmd_args,
            cwd=cwd,
            env=e,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout or config.STEP_TIMEOUT,
            text=False,
        )
        out = res.stdout.decode(errors="replace")
        if len(out) > 5_000_000:
            out = out[-5_000_000:]
        return res.returncode, out
    except FileNotFoundError:
        return None, f"{args[0]} not installed"
    except subprocess.TimeoutExpired:
        return 124, "timed out"
    except Exception as exc:
        return 1, f"command failed: {type(exc).__name__}: {exc}"


async def run_cmd(args: list[str], cwd=None, timeout=None, env=None):
    """Run a command in a worker thread. Works with any asyncio event loop (Proactor or Selector) without raising NotImplementedError."""
    return await asyncio.to_thread(_sync_run, args, cwd, timeout, env)
