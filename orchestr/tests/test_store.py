import pytest
from app import config
from app.db.models import Base
from app.db.store import PgStore, make_engine, make_sessionmaker
from app.models.schemas import RunCreate, RunState
from app.security import crypto
from app.services.orchestrator import Orchestrator
from app.worker import execute_run
from tests.test_conduit import APPROVE, Fake, chk


class FakeRedis:
    def __init__(self): self.k = set()
    async def set(self, k, v, ex=None): self.k.add(k)
    async def exists(self, k): return int(k in self.k)


async def mk(tmp_path):
    e = make_engine(f"sqlite+aiosqlite:///{tmp_path}/t.db")
    async with e.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    return PgStore(make_sessionmaker(e), FakeRedis())


async def test_run_persists_through_transitions(tmp_path):
    st = await mk(tmp_path); o = Orchestrator(Fake(APPROVE, chk("passed")), store=st)
    r = o.create(RunCreate(repo_url="https://github.com/a/b"), "u1"); await st.save(r); await o._execute(r)
    got = await st.get(r.id)  # fresh read, like another process
    assert got.state == RunState.awaiting_approval and got.verified and got.user_id == "u1"
    assert [h.state for h in got.history][1] == RunState.cloning
    assert await st.get("nope") is None


async def test_cancel_flag_stops_run(tmp_path):
    st = await mk(tmp_path); o = Orchestrator(Fake(APPROVE, chk("passed")), store=st)
    r = o.create(RunCreate(repo_url="https://github.com/a/b"), "u1"); await st.save(r)
    await st.request_cancel(r.id); await o._execute(r)
    assert (await st.get(r.id)).state == RunState.cancelled


async def test_worker_is_idempotent_and_decrypts_token(tmp_path, monkeypatch):
    from cryptography.fernet import Fernet
    monkeypatch.setattr(config, "TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())
    st = await mk(tmp_path); o = Orchestrator(Fake(APPROVE, chk("passed")), store=st)
    r = o.create(RunCreate(repo_url="https://github.com/a/b"), "u1"); await st.save(r)
    await execute_run({"orch": o}, r.id, crypto.encrypt("gho_secret"))
    assert (await st.get(r.id)).state == RunState.awaiting_approval and r.id not in o._tokens
    n = len((await st.get(r.id)).history)
    await execute_run({"orch": o}, r.id, "")  # duplicate delivery: no-op
    assert len((await st.get(r.id)).history) == n


def test_crypto_roundtrip_and_missing_key(monkeypatch):
    from cryptography.fernet import Fernet
    monkeypatch.setattr(config, "TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())
    t = crypto.encrypt("gho_x"); assert "gho_x" not in t and crypto.decrypt(t) == "gho_x"
    monkeypatch.setattr(config, "TOKEN_ENCRYPTION_KEY", "")
    with pytest.raises(RuntimeError): crypto.encrypt("x")
