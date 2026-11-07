from app.models.schemas import Run


class MemoryStore:
    """Default when no DB/Redis is configured. Persists runs across orchestrator instances."""
    _shared_runs: dict[str, Run] = {}
    _shared_cancel: set[str] = set()

    def __init__(self):
        self.runs = self._shared_runs
        self._cancel = self._shared_cancel

    async def save(self, run: Run):
        self.runs[run.id] = run

    async def get(self, run_id: str) -> Run | None:
        return self.runs.get(run_id)

    async def is_cancelled(self, run_id: str) -> bool:
        return run_id in self._cancel

    async def request_cancel(self, run_id: str):
        self._cancel.add(run_id)
