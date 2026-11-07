import asyncio, os
from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine
from app import config  # loads .env
from app.db.models import Base

url = os.environ.get("MIGRATION_DATABASE_URL") or os.environ["DATABASE_URL"]


def _run(conn):
    context.configure(connection=conn, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()


async def main():
    e = create_async_engine(url)
    async with e.connect() as c:
        await c.run_sync(_run)
    await e.dispose()

asyncio.run(main())
