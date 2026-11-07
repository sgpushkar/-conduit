from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app import config
from app.api import auth, repos, runs
from app.services.orchestrator import orchestrator

@asynccontextmanager
async def lifespan(_):
    pool = engine = None
    if config.USE_QUEUE:
        from arq import create_pool
        from arq.connections import RedisSettings
        from sqlalchemy import text
        from app.db.store import PgStore, make_engine, make_sessionmaker
        from app.security import crypto
        crypto.encrypt("check")  # fail fast without TOKEN_ENCRYPTION_KEY
        engine = make_engine(config.DATABASE_URL)
        pool = await create_pool(RedisSettings.from_dsn(config.REDIS_URL))
        orchestrator.store, orchestrator.queue = PgStore(make_sessionmaker(engine), pool), pool
        app.state.ping = lambda: _ping(engine, pool, text)
    yield
    if pool: await pool.aclose()
    if engine: await engine.dispose()


async def _ping(engine, pool, text):
    async with engine.connect() as c:
        await c.execute(text("SELECT 1"))
    await pool.ping()


app = FastAPI(title="CONDUIT orchestr", version="0.2.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["GET", "POST"], allow_headers=["Content-Type", "X-CSRF-Token"], allow_credentials=True)
app.include_router(auth.router)
app.include_router(repos.router)
app.include_router(runs.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/ready")
async def ready():
    if not config.USE_QUEUE:
        return {"status": "ok", "mode": "memory"}
    try:
        await app.state.ping()
    except Exception:
        raise HTTPException(503, "Database or Redis unavailable")
    return {"status": "ok", "mode": "postgres+redis"}
