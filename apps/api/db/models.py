"""
Async database access layer using asyncpg directly.
The Prisma schema lives in apps/web/prisma/schema.prisma for migrations.
This module provides lightweight async helpers for the FastAPI backend.
"""
import asyncio
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import asyncpg


class Database:
    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        self.pool = await asyncpg.create_pool(
            dsn=os.environ["DATABASE_URL"],
            min_size=2,
            max_size=10,
        )

    async def disconnect(self):
        if self.pool:
            await self.pool.close()

    async def fetch_one(self, query: str, *args) -> Optional[dict]:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(query, *args)
            return dict(row) if row else None

    async def fetch_all(self, query: str, *args) -> list[dict]:
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(query, *args)
            return [dict(r) for r in rows]

    async def execute(self, query: str, *args):
        async with self.pool.acquire() as conn:
            return await conn.execute(query, *args)

    # ─── User helpers ──────────────────────────────────────────────────────────

    async def get_or_create_user(self, clerk_id: str, email: str) -> dict:
        user = await self.fetch_one(
            "SELECT * FROM users WHERE clerk_id = $1", clerk_id
        )
        if user:
            return user
        uid = str(uuid.uuid4())
        await self.execute(
            "INSERT INTO users (id, clerk_id, email) VALUES ($1, $2, $3)",
            uid, clerk_id, email,
        )
        return await self.fetch_one("SELECT * FROM users WHERE id = $1", uid)

    async def get_user_by_clerk_id(self, clerk_id: str) -> Optional[dict]:
        return await self.fetch_one(
            "SELECT * FROM users WHERE clerk_id = $1", clerk_id
        )

    async def update_github_token(self, user_id: str, encrypted_token: str):
        await self.execute(
            "UPDATE users SET github_token = $1 WHERE id = $2",
            encrypted_token, user_id,
        )

    # ─── Repo helpers ──────────────────────────────────────────────────────────

    async def get_or_create_repo(self, user_id: str, full_name: str, default_branch: str = "main") -> dict:
        repo = await self.fetch_one(
            "SELECT * FROM repos WHERE user_id = $1 AND full_name = $2",
            user_id, full_name,
        )
        if repo:
            return repo
        rid = str(uuid.uuid4())
        await self.execute(
            "INSERT INTO repos (id, user_id, full_name, default_branch) VALUES ($1, $2, $3, $4)",
            rid, user_id, full_name, default_branch,
        )
        return await self.fetch_one("SELECT * FROM repos WHERE id = $1", rid)

    # ─── Run helpers ───────────────────────────────────────────────────────────

    async def create_run(
        self,
        user_id: str,
        repo_id: str,
        spec: str,
        branch_name: str,
    ) -> dict:
        rid = str(uuid.uuid4())
        await self.execute(
            """INSERT INTO runs (id, user_id, repo_id, spec, status, branch_name)
               VALUES ($1, $2, $3, $4, 'queued', $5)""",
            rid, user_id, repo_id, spec, branch_name,
        )
        return await self.fetch_one("SELECT * FROM runs WHERE id = $1", rid)

    async def get_run(self, run_id: str, user_id: str) -> Optional[dict]:
        return await self.fetch_one(
            "SELECT * FROM runs WHERE id = $1 AND user_id = $2", run_id, user_id
        )

    async def get_run_any(self, run_id: str) -> Optional[dict]:
        """Get run without user check (for worker use)."""
        return await self.fetch_one("SELECT * FROM runs WHERE id = $1", run_id)

    async def update_run(self, run_id: str, **fields):
        if not fields:
            return
        set_parts = []
        values = []
        for i, (k, v) in enumerate(fields.items(), start=1):
            col = _to_snake(k)
            if isinstance(v, dict) or isinstance(v, list):
                v = json.dumps(v)
            set_parts.append(f"{col} = ${i}")
            values.append(v)
        values.append(run_id)
        query = f"UPDATE runs SET {', '.join(set_parts)}, updated_at = now() WHERE id = ${len(values)}"
        await self.execute(query, *values)

    async def list_runs(self, user_id: str, page: int = 1, per_page: int = 20) -> list[dict]:
        offset = (page - 1) * per_page
        return await self.fetch_all(
            """SELECT r.*, rp.full_name as repo_full_name
               FROM runs r
               JOIN repos rp ON r.repo_id = rp.id
               WHERE r.user_id = $1
               ORDER BY r.created_at DESC
               LIMIT $2 OFFSET $3""",
            user_id, per_page, offset,
        )

    # ─── RunStep helpers ───────────────────────────────────────────────────────

    async def create_step(self, run_id: str, step: str) -> str:
        sid = str(uuid.uuid4())
        await self.execute(
            """INSERT INTO run_steps (id, run_id, step, status, log, started_at)
               VALUES ($1, $2, $3, 'running', ARRAY[]::TEXT[], now())""",
            sid, run_id, step,
        )
        return sid

    async def append_log(self, step_id: str, line: str):
        await self.execute(
            "UPDATE run_steps SET log = array_append(log, $1) WHERE id = $2",
            line, step_id,
        )

    async def finish_step(self, step_id: str, status: str = "done"):
        await self.execute(
            "UPDATE run_steps SET status = $1, finished_at = now() WHERE id = $2",
            status, step_id,
        )

    async def get_steps(self, run_id: str) -> list[dict]:
        return await self.fetch_all(
            "SELECT * FROM run_steps WHERE run_id = $1 ORDER BY started_at",
            run_id,
        )


def _to_snake(name: str) -> str:
    import re
    s1 = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", name)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s1).lower()


db = Database()
