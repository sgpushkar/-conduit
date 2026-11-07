import json
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.db.models import RunRow
from app.models.schemas import Run


def make_engine(url: str):
    if url.startswith("postgresql"):
        # PgBouncer transaction mode: no server-side prepared statements
        return create_async_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5,
                                   connect_args={"statement_cache_size": 0, "prepared_statement_cache_size": 0})
    return create_async_engine(url)


def make_sessionmaker(engine):
    return async_sessionmaker(engine, expire_on_commit=False)


class PgStore:
    def __init__(self, sm, redis):
        self.sm, self.redis = sm, redis

    async def save(self, run: Run):
        data = json.loads(run.model_dump_json())
        async with self.sm() as s, s.begin():
            row = await s.get(RunRow, run.id)
            if row:
                row.state, row.data = run.state.value, data
            else:
                s.add(RunRow(id=run.id, user_id=run.user_id, state=run.state.value, data=data))

    async def get(self, run_id: str):
        async with self.sm() as s:
            row = await s.get(RunRow, run_id)
            return Run.model_validate(row.data) if row else None

    async def is_cancelled(self, run_id: str) -> bool:
        return bool(await self.redis.exists(f"cancel:{run_id}"))

    async def request_cancel(self, run_id: str):
        await self.redis.set(f"cancel:{run_id}", "1", ex=3600)
