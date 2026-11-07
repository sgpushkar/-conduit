# CONDUIT
**Find the Flaw. Prove the Fix.**

## Problem
Scanners produce findings, not fixes, and AI-generated fixes are often accepted without anyone checking them. CONDUIT runs a vulnerable repository through four agents and only marks a patch verified when an independent review and isolated tests both back it up.

## Architecture
```
GitHub repo -> Scanner -> Coder -> Reviewer -> Tester -> Verified patch
```
The Scanner must finish before the Coder starts, because the Coder needs the findings. Review and testing are separate stages over the same diff.

| Agent | Responsibility |
|---|---|
| Scanner | Clones the repo, runs Semgrep, returns structured findings. Reports `unavailable` if Semgrep is missing. |
| Coder | Asks the configured LLM for a minimal unified diff and checks it with `git apply --check`. |
| Reviewer | Separate LLM call with findings + diff only. Can reject. |
| Tester | Applies the diff and runs pytest or `npm test` in a Docker container with no network. If Docker is unavailable, nothing is executed and the check is `unavailable`. |

States: `queued -> scanning -> patching -> reviewing -> testing -> completed`, with `failed` and `rejected` terminal. Illegal transitions raise errors. A run is `verified` only if the review approved it, at least one check passed, and none failed or were unavailable.

## Implemented (v2)
- GitHub OAuth, server-side: state check (single use), PKCE S256, token kept in server memory only, HTTP-only SameSite=Lax session cookie (Secure when `ENV=production`), CSRF header on every state-changing call, sign-out, session expiry
- Repo picker (search, branch select), access verified against GitHub before a run starts; runs are visible only to their owner
- States: `queued, cloning, scanning, patching, reviewing, testing, awaiting_approval, completed, rejected, failed, cancelled`
- Bounded correction loop (`MAX_ATTEMPTS`, default 2): reviewer `changes_requested` or failing tests feed back to the Coder
- Reviewer verdicts: `approved | changes_requested | rejected`
- Manual approval (default): checks the base branch SHA is unchanged, re-clones, re-applies the patch, re-runs tests, pushes only a `conduit/*` branch, opens a PR. Refuses default/base branches
- Opt-in automation per run (`auto_pr`): only for verified runs, needs push permission, logged in the run policy, revocable. Never for failed/unverified patches
- Demo mode (only when OAuth is not configured): bundled fixture repo, real pipeline, no GitHub operations, approve is refused (download the patch)
- Frontend: landing scene, sign-in, repo and branch selection, live monitor, findings, diff, review, tests, approval panel, PR result
- 20 backend tests (GitHub and LLM mocked)

## GitHub setup and permissions
Create an OAuth App, callback `http://localhost:8000/auth/github/callback`, and put the id/secret in `orchestr/.env`. Scopes requested: `repo` (clone private repos, push a branch, open PRs) and `read:user`. `repo` is broader than ideal; a GitHub App with per-repo contents + pull-requests write is the better production choice and is not implemented.

## Postgres + Redis + queue mode (v3)
Optional. Set both `DATABASE_URL` and `REDIS_URL` in `orchestr/.env` and runs persist in Postgres 16 (via PgBouncer, transaction mode) while the pipeline runs in an `arq` worker on Redis 7. Leave them unset and everything stays in memory as before.
```
# conduit/ : copy .env.example to .env, set POSTGRES_PASSWORD and REDIS_PASSWORD
docker compose up -d
# conduit/orchestr/ : fill DATABASE_URL, MIGRATION_DATABASE_URL, REDIS_URL, TOKEN_ENCRYPTION_KEY in .env
alembic upgrade head
uvicorn app.main:app --port 8000      # API (.env is auto-loaded)
arq app.worker.WorkerSettings         # worker, second terminal
```
GitHub tokens are Fernet-encrypted before they enter a Redis job. Cancel works through a Redis flag checked at each stage boundary. `/ready` checks Postgres and Redis. The worker must run on a host with Docker, because tests run in sandbox containers.
Note: this uses Python equivalents (SQLAlchemy 2 + asyncpg + Alembic, arq) rather than Drizzle/BullMQ, which are Node libraries.

## Not implemented
GitHub App installation flow, persistent storage (runs and sessions are in memory, single process), rate limiting, frontend automated tests, a separate security rescan check (the Tester runs the project's tests only), targeted regression test generation, per-run workspace resource quotas beyond Docker limits, branch-protection awareness.

## Structure
`viewr/` frontend, `orchestr/` backend, this README.

## Prerequisites
Python 3.11+, Node 18+, git, Docker (for sandboxed tests and optional Postgres/Redis). Optional but needed for real runs: Semgrep, Docker, an LLM API key.

## Setup
Backend, from `conduit/orchestr`:
```
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in LLM_API_KEY and LLM_MODEL
uvicorn app.main:app --reload --port 8000
pytest
```
Frontend, from `conduit/viewr`:
```
npm install
npm run dev      # http://localhost:5173
npm run build
```
Set `VITE_API_URL` if the backend isn't at `http://localhost:8000`.

## Environment variables (`orchestr/.env`)
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `OAUTH_REDIRECT_URI`, `FRONTEND_URL`, `ENV`, `SESSION_TTL_SECONDS`, `MAX_ATTEMPTS`, `CORS_ORIGINS`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_API_URL`, `SEMGREP_CONFIG`, `ALLOW_DOCKER_TESTS`, `STEP_TIMEOUT_SECONDS`. See `.env.example`.

## API (docs at `/docs`)
`/auth/github/login|callback`, `/auth/demo`, `/auth/logout`, `/api/me`, `/api/repositories[/{owner}/{repo}/branches]`, `POST /api/runs`, `/api/runs/{id}` + `/report|/diff|/approve|/reject|/cancel|/revoke-automation|/pull-request`, `/health`

## Demo
Start both servers, open the frontend, click Start demo mode (or sign in with GitHub), pick a repo, press Scan. In demo mode the run uses the fixture repo. If Semgrep is not installed the run fails at the scan step and says so; without an LLM key it fails at the Coder step.

## Security notes
Repo content is treated as untrusted and wrapped in prompts as data. Tests run only in Docker with `--network none`, dropped capabilities, and memory/CPU/pid limits. Semgrep runs on the host as static analysis only. Git hooks are disabled for clones. Known gaps: no auth on the API, no rate limiting, in-memory storage, prompt injection is mitigated but not eliminated, and dependency-installing test suites will fail without network.

## Future scope
PR creation with least-privilege GitHub auth, persistence, streaming status, private repos, a fixtures mode.
