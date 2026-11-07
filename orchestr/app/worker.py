"""arq worker: `arq app.worker.WorkerSettings` (from orchestr/)."""
from arq.connections import RedisSettings
from app import config
from app.db.store import PgStore, make_engine, make_sessionmaker
from app.models.schemas import RunState
from app.security import crypto
from app.services.orchestrator import Orchestrator


async def startup(ctx):
    ctx["engine"] = make_engine(config.DATABASE_URL)
    ctx["orch"] = Orchestrator(store=PgStore(make_sessionmaker(ctx["engine"]), ctx["redis"]))


async def shutdown(ctx):
    await ctx["engine"].dispose()


async def execute_run(ctx, run_id: str, enc_token: str = ""):
    orch = ctx["orch"]
    run = await orch.store.get(run_id)
    if not run or run.state != RunState.queued:
        return  # idempotent: never re-run a run that already started
    if enc_token:
        orch._tokens[run.id] = crypto.decrypt(enc_token)
    try:
        await orch._execute(run)
    finally:
        orch._tokens.pop(run.id, None)


class WorkerSettings:
    functions = [execute_run]
    on_startup, on_shutdown = startup, shutdown
    redis_settings = RedisSettings.from_dsn(config.REDIS_URL or "redis://localhost:6379/0")
    max_jobs = config.WORKER_CONCURRENCY
    max_tries = 1       # jobs have side effects; no blind retries
    job_timeout = 3600
