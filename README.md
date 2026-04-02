# YANTRA

> Sanskrit for **"machine"** — an autonomous spec-to-ship agent that turns plain-English descriptions into merged GitHub PRs.

YANTRA reads a spec (or GitHub issue URL), indexes your repository, generates an implementation plan, waits for your approval, writes and tests the code in an isolated Docker sandbox, then opens a pull request — all while streaming every step live to your browser.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Agent Pipeline](#agent-pipeline)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Deployment](#deployment)
- [Security](#security)

---

## How It Works

```
1. Describe  →  paste a plain-English spec or GitHub issue URL
2. Approve   →  review the AI-generated plan (files, approach, risks) before any code is written
3. Ship      →  YANTRA implements, tests in sandbox, opens a GitHub PR — streamed live
```

The **human approval gate** is a hard stop: the LangGraph agent interrupts itself after planning and waits for an explicit `POST /runs/{id}/approve` before writing a single line of code.

---

## Architecture

```
Browser (Next.js / Vercel)
  │
  ├── REST API ──────────────────► FastAPI (Railway)
  │     POST /runs                   ├── PostgreSQL  (Prisma schema + asyncpg)
  │     GET  /runs/{id}              ├── Redis       (pub/sub SSE + job queue)
  │     POST /runs/{id}/approve      └── ChromaDB    (vector search / RAG)
  │     POST /runs/{id}/cancel
  │     GET  /repos
  │
  └── SSE stream ◄───────────────── FastAPI  ◄──  Redis pub/sub channel
                                                        ▲
                                                   Worker process
                                                  (Python / asyncio)
                                                        │
                                                  LangGraph agent
                                                  ├── ingest
                                                  ├── index_repo
                                                  ├── plan
                                                  ├── [human_gate ← interrupt()]
                                                  ├── implement
                                                  ├── test_runner  (Docker sandbox)
                                                  └── open_pr      (PyGitHub)
```

**Key design decisions:**

- The **worker** is a separate long-running Python process that pops jobs from a Redis list (`yantra:jobs`). This decouples HTTP latency from agent execution time.
- **LangGraph checkpointing** (in-memory for dev, `PostgresSaver` for prod) lets the agent pause at `human_gate` and resume via a separate API call with full state preserved.
- **SSE** (Server-Sent Events) streams structured JSON events (`log`, `status`, `plan`, `pr`, `error`) from the worker → Redis pub/sub → FastAPI → browser in real time.
- **ChromaDB** stores chunked, embedded file contents so the `implement` node can do semantic retrieval rather than passing entire repos to the LLM.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, Clerk auth |
| Backend API | FastAPI, Python 3.12, Pydantic v2, asyncpg |
| Agent | LangGraph 0.2, LangChain-Anthropic, Claude (Anthropic) |
| Job Queue | Redis (list-based queue + pub/sub for SSE) |
| Database | PostgreSQL 16, Prisma (schema), asyncpg (runtime) |
| Vector Store | ChromaDB, Voyage AI embeddings |
| Sandbox | Docker (network-isolated, capability-dropped containers) |
| Monorepo | Turborepo, npm workspaces |
| Frontend Deploy | Vercel |
| Backend Deploy | Railway |

---

## Project Structure

```
yantra/
├── apps/
│   ├── api/                        # Python FastAPI backend
│   │   ├── agent/
│   │   │   ├── graph.py            # LangGraph state machine definition
│   │   │   ├── state.py            # AgentState TypedDict
│   │   │   └── nodes/              # ingest, index_repo, plan, implement, test_runner, open_pr
│   │   ├── api/
│   │   │   ├── deps.py             # Clerk JWT auth dependency
│   │   │   └── routes/             # runs, stream, webhooks, repos
│   │   ├── db/
│   │   │   └── models.py           # asyncpg DB client + queries
│   │   ├── worker/
│   │   │   ├── processor.py        # Job processor + resume logic
│   │   │   └── run_worker.py       # Worker entry point
│   │   ├── main.py                 # FastAPI app + CORS + router registration
│   │   ├── requirements.txt
│   │   ├── Procfile                # Railway process declarations
│   │   └── railway.json
│   │
│   └── web/                        # Next.js frontend
│       ├── app/
│       │   ├── layout.tsx
│       │   └── page.tsx            # Landing page
│       ├── components/
│       │   ├── agent-log.tsx       # Live SSE log viewer
│       │   ├── diff-viewer.tsx     # File diff display
│       │   ├── plan-review.tsx     # Human approval UI
│       │   ├── repo-connect.tsx    # GitHub repo connection
│       │   └── run-card.tsx        # Run status card
│       ├── lib/
│       │   ├── api.ts              # Typed API client
│       │   └── utils.ts
│       ├── middleware.ts           # Clerk auth middleware
│       ├── prisma/
│       │   └── schema.prisma       # DB schema (User, Repo, Run, RunStep)
│       └── next.config.js
│
├── docker-compose.yml              # Postgres + Redis + ChromaDB for local dev
├── .env.example                    # All env vars documented
├── turbo.json
└── package.json
```

---

## Agent Pipeline

The LangGraph graph (`apps/api/agent/graph.py`) defines a linear pipeline with one conditional loop:

```
ingest → index_repo → plan → human_gate ──► implement → test ──► open_pr → END
                                                              │
                                                    (fail, retry ≤ 3x)
                                                              └──► implement (retry)
                                                              └──► END (fail after 3)
```

### Nodes

| Node | What it does |
|---|---|
| `ingest` | Parses the spec string or fetches a GitHub issue. Extracts acceptance criteria and goal. |
| `index_repo` | Clones the repo, chunks files with `tree-sitter`, embeds with Voyage AI, upserts into ChromaDB. |
| `plan` | Calls Claude with the spec + relevant chunks. Returns `{files_to_modify, files_to_create, approach, risks, estimated_test_strategy}`. |
| `human_gate` | Calls `langgraph.types.interrupt()` — graph pauses here. Frontend receives plan via SSE. Resumes on `POST /runs/{id}/approve`. |
| `implement` | Semantic-retrieves context for each planned file, calls Claude to write the code, stores results in `current_files`. |
| `test_runner` | Spins up a Docker container with `--network none --cap-drop ALL --memory 512m`, copies modified files in, runs the repo's test suite, captures output. |
| `open_pr` | Uses PyGitHub to create a branch, commit the files, and open a PR with a generated description. |

### State Shape (`AgentState`)

```python
class AgentState(TypedDict):
    run_id: str
    repo_url: str
    spec: str
    plan: Optional[dict]          # generated by plan node
    approved: bool                # set True by human_gate after resume
    redirect_note: Optional[str]  # user's optional redirect instructions on approve
    current_files: dict           # {path: content} of all modified/created files
    test_output: Optional[str]
    test_passed: bool
    retry_count: int              # max 3 before going to END (fail)
    pr_url: Optional[str]
    error: Optional[str]
    log_events: List[str]         # append-only log lines (LangGraph add_messages)
```

### SSE Event Types

| Type | Payload | When |
|---|---|---|
| `status` | `{status: string}` | On every node transition |
| `log` | `{step: string, msg: string}` | Per log line emitted by a node |
| `plan` | `{plan: object}` | When human_gate fires |
| `pr` | `{url: string}` | When PR is opened |
| `error` | `{msg: string}` | On any failure |

---

## Database Schema

Managed by **Prisma** (`apps/web/prisma/schema.prisma`), accessed at runtime via **asyncpg**.

```
User
  id          UUID  PK
  clerkId     STRING UNIQUE        ← Clerk user ID
  email       STRING
  githubToken STRING?              ← AES-256 encrypted
  repos       Repo[]
  runs        Run[]

Repo
  id              UUID  PK
  userId          UUID  FK → User
  fullName        STRING            ← "owner/repo"
  defaultBranch   STRING
  lastIndexedAt   TIMESTAMPTZ?

Run
  id          UUID  PK
  userId      UUID  FK → User
  repoId      UUID  FK → Repo
  spec        TEXT
  status      STRING  ← queued | indexing | planning | awaiting_approval |
                         implementing | testing | opening_pr | done | failed
  plan        JSON?
  prUrl       STRING?
  prNumber    INT?
  branchName  STRING?
  error       STRING?
  steps       RunStep[]

RunStep
  id          UUID  PK
  runId       UUID  FK → Run
  step        STRING   ← ingest | index | plan | implement | test | pr
  status      STRING   ← running | done | failed
  log         STRING[]
  startedAt   TIMESTAMPTZ?
  finishedAt  TIMESTAMPTZ?
```

---

## API Reference

All routes require a valid **Clerk JWT** in the `Authorization: Bearer <token>` header (validated by `api/deps.py`).

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `POST` | `/runs` | Create and enqueue a new run |
| `GET` | `/runs` | List runs for the authenticated user |
| `GET` | `/runs/{id}` | Get run details + steps |
| `POST` | `/runs/{id}/approve` | Resume a paused run (with optional `redirect_note`) |
| `POST` | `/runs/{id}/cancel` | Cancel a running or queued run |
| `GET` | `/runs/{id}/stream` | SSE stream of live events |
| `GET` | `/repos` | List connected repos |
| `POST` | `/repos` | Connect a new GitHub repo |
| `POST` | `/webhooks/clerk` | Clerk webhook (user create/delete sync) |

---

## Environment Variables

Copy `.env.example` to `.env` (backend) and `apps/web/.env.local.example` to `apps/web/.env.local` (frontend).

### Frontend (`apps/web/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (`pk_test_...`) |
| `CLERK_SECRET_KEY` | Clerk secret key (`sk_test_...`) |
| `NEXT_PUBLIC_API_URL` | Backend base URL (default: `http://localhost:8000`) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Sign-in redirect path (default: `/sign-in`) |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Sign-up redirect path (default: `/sign-up`) |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Post-login redirect (default: `/dashboard`) |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | Post-signup redirect (default: `/dashboard`) |

### Backend (`.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `ANTHROPIC_API_KEY` | Anthropic API key (`sk-ant-...`) |
| `CLERK_SECRET_KEY` | Same Clerk secret key used by frontend |
| `ENCRYPTION_KEY` | 32-byte hex key for AES-256 GitHub token encryption |
| `CHROMA_HOST` | ChromaDB host (default: `localhost`) |
| `CHROMA_PORT` | ChromaDB port (default: `8001`) |
| `CHROMA_PATH` | ChromaDB persistence path |
| `GITHUB_APP_ID` | GitHub App ID (optional — falls back to user token) |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key (optional) |
| `DOCKER_HOST` | Docker socket (default: `unix:///var/run/docker.sock`) |
| `API_HOST` | FastAPI bind host (default: `0.0.0.0`) |
| `API_PORT` | FastAPI bind port (default: `8000`) |
| `ENVIRONMENT` | `development` or `production` |
| `FRONTEND_URL` | Frontend origin for CORS (default: `http://localhost:3000`) |

Generate `ENCRYPTION_KEY`:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## Local Development

### Prerequisites

- Node.js 20+
- Python 3.12+
- Docker Desktop (Postgres, Redis, ChromaDB, sandbox)
- [Clerk](https://clerk.com) account (free tier)
- Anthropic API key
- GitHub Personal Access Token (repo scope)

### 1. Clone and install

```bash
git clone https://github.com/deekshith-b48/Yantra.git
cd yantra

# Frontend deps
cd apps/web && npm install && cd ../..

# Backend deps
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd ../..
```

### 2. Start infrastructure

```bash
docker compose up -d
# Postgres  → localhost:5432
# Redis     → localhost:6379
# ChromaDB  → localhost:8001
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env: DATABASE_URL, REDIS_URL, ANTHROPIC_API_KEY, CLERK_SECRET_KEY, ENCRYPTION_KEY

cp apps/web/.env.local.example apps/web/.env.local
# Edit apps/web/.env.local: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY
```

### 4. Run database migrations

```bash
cd apps/web
npx prisma migrate dev --name init
npx prisma generate
cd ../..
```

### 5. Start the three processes

```bash
# Terminal 1 — Frontend (http://localhost:3000)
cd apps/web && npm run dev

# Terminal 2 — FastAPI (http://localhost:8000/docs)
cd apps/api
source .venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 3 — Worker
cd apps/api
source .venv/bin/activate
python -m worker.run_worker
```

### 6. Clerk setup

1. Create an app at [clerk.com](https://clerk.com)
2. Enable GitHub OAuth under **Social Connections**
3. Copy keys into both `.env` files
4. Set **Allowed redirect URLs** to:
   - `http://localhost:3000/sign-in`
   - `http://localhost:3000/sign-up`
   - `http://localhost:3000/dashboard`
5. Add a **webhook** pointing to `http://localhost:8000/webhooks/clerk` (use `ngrok` for local tunneling), subscribing to `user.created` and `user.deleted`

### 7. Verify

- `http://localhost:3000` — landing page
- `http://localhost:8000/docs` — FastAPI Swagger UI
- Sign up, connect a repo, submit a spec, watch the live stream

---

## Deployment

### Backend on Railway

```bash
npm install -g @railway/cli
railway login && railway link

# Set all backend env vars
railway variables set DATABASE_URL="postgresql://..."
railway variables set REDIS_URL="redis://..."
railway variables set ANTHROPIC_API_KEY="sk-ant-..."
railway variables set CLERK_SECRET_KEY="sk_live_..."
railway variables set ENCRYPTION_KEY="<32-byte hex>"
railway variables set ENVIRONMENT="production"
railway variables set FRONTEND_URL="https://your-app.vercel.app"

# Deploy API and worker as separate Railway services
railway up --service api
railway up --service worker
```

The `Procfile` defines both processes:
```
web: uvicorn main:app --host 0.0.0.0 --port $PORT
worker: python -m worker.run_worker
```

For production, swap the in-memory LangGraph checkpointer for `PostgresSaver` (the `langgraph-checkpoint-postgres` package is already in `requirements.txt`).

### Frontend on Vercel

```bash
npm install -g vercel
cd apps/web
vercel deploy --prod
```

Set these env vars in the Vercel dashboard:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_...` |
| `CLERK_SECRET_KEY` | `sk_live_...` |
| `NEXT_PUBLIC_API_URL` | `https://your-api.railway.app` |

---

## Security

| Concern | Mitigation |
|---|---|
| GitHub token storage | AES-256 (Fernet) encryption before DB write; `ENCRYPTION_KEY` never leaves the backend |
| Code execution | Docker containers run with `--network none --cap-drop ALL --memory 512m --pids-limit 64` |
| API authentication | Every route validates a Clerk JWT via `Authorization: Bearer` header |
| Secrets in responses | Raw tokens are never serialized to API responses |
| Rate limiting | 10 runs/user/day enforced via Redis counter |
| CORS | Restricted to `FRONTEND_URL` only |
| Webhook verification | Clerk webhook signature verified via `clerk-backend-api` |

---

## License

MIT
