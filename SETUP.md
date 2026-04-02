# YANTRA — Setup Guide

## Quick start (local dev)

### Prerequisites
- Node.js 20+
- Python 3.12+
- Docker Desktop (for Postgres, Redis, Chroma, and sandbox)
- A Clerk account (free tier works)
- An Anthropic API key
- A GitHub Personal Access Token (repo scope)

### 1. Clone and install

```bash
git clone <repo>
cd yantra

# Frontend deps
cd apps/web && npm install && cd ../..

# Backend deps (use uv or pip)
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd ../..
```

### 2. Start infrastructure

```bash
docker compose up -d
# Starts: Postgres :5432, Redis :6379, ChromaDB :8001
```

### 3. Configure environment

```bash
# Frontend
cp apps/web/.env.local.example apps/web/.env.local
# Fill in: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY

# Backend
cp .env.example .env
# Fill in: DATABASE_URL, REDIS_URL, ANTHROPIC_API_KEY, CLERK_SECRET_KEY, ENCRYPTION_KEY
```

Generate ENCRYPTION_KEY:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 4. Run database migrations

```bash
cd apps/web
npx prisma migrate dev --name init
npx prisma generate
cd ../..
```

### 5. Start the services

**Terminal 1 — Frontend:**
```bash
cd apps/web && npm run dev
# → http://localhost:3000
```

**Terminal 2 — FastAPI:**
```bash
cd apps/api
source .venv/bin/activate
uvicorn main:app --reload --port 8000
# → http://localhost:8000/docs
```

**Terminal 3 — Worker:**
```bash
cd apps/api
source .venv/bin/activate
python -m worker.run_worker
```

### 6. Verify

- Visit http://localhost:3000 — landing page
- Sign up via Clerk (GitHub OAuth or email)
- Go to /run/new, fill in a spec, repo URL, and GitHub token
- Watch the live log stream

---

## Clerk setup

1. Create a Clerk app at https://clerk.com
2. Enable GitHub OAuth in Social Connections
3. Copy publishable key → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
4. Copy secret key → `CLERK_SECRET_KEY` (both frontend + backend)
5. Set Redirect URLs:
   - Sign-in: http://localhost:3000/sign-in
   - Sign-up: http://localhost:3000/sign-up
   - After sign-in: http://localhost:3000/dashboard

---

## Deploy

### Railway (backend)

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
railway link

# Set env vars
railway variables set DATABASE_URL=...
railway variables set REDIS_URL=...
railway variables set ANTHROPIC_API_KEY=...
railway variables set CLERK_SECRET_KEY=...
railway variables set ENCRYPTION_KEY=...

# Deploy
railway up --service api
railway up --service worker
```

### Vercel (frontend)

```bash
npm install -g vercel
cd apps/web
vercel deploy --prod
# Set env vars in Vercel dashboard
```

---

## Security notes

- GitHub tokens are encrypted with AES-256 (Fernet) before storage
- Docker sandbox runs with `--network none --cap-drop ALL --memory 512m`
- No plaintext secrets are ever returned to the frontend
- Rate limit: 10 runs/user/day enforced via Redis
- All API routes validate Clerk JWT before execution

---

## Architecture

```
Browser → Next.js (Vercel)
           │
           ├─ REST API → FastAPI (Railway)
           │              ├─ PostgreSQL (Prisma schema, asyncpg client)
           │              ├─ Redis (pub/sub for SSE, job queue)
           │              └─ ChromaDB (vector search)
           │
           └─ SSE stream ← FastAPI → Redis pub/sub
                                        ↑
                                   Worker process
                                        │
                                   LangGraph agent
                                   ├─ ingest node
                                   ├─ index_repo node
                                   ├─ plan node
                                   ├─ [human gate — interrupt()]
                                   ├─ implement node
                                   ├─ test_runner node (Docker)
                                   └─ open_pr node (PyGithub)
```
