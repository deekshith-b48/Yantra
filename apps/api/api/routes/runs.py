import re
import os
import bleach
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from api.deps import get_current_user
from db.models import db
from agent.tools.crypto import encrypt_token, decrypt_token
from agent.tools.github import validate_token_scopes, parse_repo_url
from worker.processor import enqueue_run

router = APIRouter()

REPO_RE = re.compile(r"^(?:https://github\.com/)?[\w.-]+/[\w.-]+$")


class CreateRunRequest(BaseModel):
    spec: str
    repo_url: str
    github_token: str

    @field_validator("spec")
    @classmethod
    def validate_spec(cls, v):
        v = bleach.clean(v.strip())
        if len(v) > 4000:
            raise ValueError("Spec must be under 4000 characters")
        if len(v) < 10:
            raise ValueError("Spec is too short")
        return v

    @field_validator("repo_url")
    @classmethod
    def validate_repo_url(cls, v):
        v = v.strip()
        if not REPO_RE.match(v):
            raise ValueError("Invalid GitHub repo URL or slug (use owner/repo or full GitHub URL)")
        return v


class ApproveRunRequest(BaseModel):
    redirect_note: Optional[str] = None

    @field_validator("redirect_note")
    @classmethod
    def validate_redirect(cls, v):
        if v and len(v) > 500:
            raise ValueError("Redirect note must be under 500 characters")
        return v


async def _check_rate_limit(user_id: str):
    import redis.asyncio as aioredis
    r = aioredis.from_url(os.environ["REDIS_URL"])
    key = f"rate_limit:{user_id}:runs"
    count = await r.incr(key)
    if count == 1:
        await r.expire(key, 86400)  # 24h TTL
    await r.aclose()
    if count > 10:
        raise HTTPException(status_code=429, detail="Rate limit: 10 runs per day")


@router.post("")
async def create_run(
    body: CreateRunRequest,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["id"]

    await _check_rate_limit(user_id)

    # Validate token has repo scope
    token = body.github_token.strip()
    if not validate_token_scopes(token):
        raise HTTPException(status_code=400, detail="GitHub token must have 'repo' scope")

    encrypted_token = encrypt_token(token)

    # Store encrypted token on user
    await db.update_github_token(user_id, encrypted_token)

    # Normalize repo URL
    repo_url = body.repo_url.strip()
    if not repo_url.startswith("https://"):
        owner, name = parse_repo_url(repo_url)
        repo_url = f"https://github.com/{owner}/{name}"

    owner, name = parse_repo_url(repo_url)
    repo = await db.get_or_create_repo(user_id, f"{owner}/{name}")

    # Create run
    from uuid import uuid4
    run_id = str(uuid4())
    branch_name = f"yantra/{run_id[:8]}"

    run = await db.create_run(
        user_id=user_id,
        repo_id=repo["id"],
        spec=body.spec,
        branch_name=branch_name,
    )

    # Enqueue job
    await enqueue_run(
        run_id=run["id"],
        repo_url=repo_url,
        spec=body.spec,
        github_token_enc=encrypted_token,
    )

    return {"run_id": run["id"], "status": "queued", "branch_name": branch_name}


@router.get("")
async def list_runs(
    page: int = 1,
    current_user: dict = Depends(get_current_user),
):
    runs = await db.list_runs(current_user["id"], page=page)
    return {"runs": runs, "page": page}


@router.get("/{run_id}")
async def get_run(
    run_id: str,
    current_user: dict = Depends(get_current_user),
):
    run = await db.get_run(run_id, current_user["id"])
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    steps = await db.get_steps(run_id)
    return {**run, "steps": steps}


@router.post("/{run_id}/approve")
async def approve_run(
    run_id: str,
    body: ApproveRunRequest,
    current_user: dict = Depends(get_current_user),
):
    run = await db.get_run(run_id, current_user["id"])
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run["status"] != "awaiting_approval":
        raise HTTPException(
            status_code=400,
            detail=f"Run is not awaiting approval (current status: {run['status']})",
        )

    # Resume LangGraph via worker
    from worker.processor import resume_run
    await resume_run(run_id, redirect_note=body.redirect_note)

    await db.update_run(run_id, status="implementing")
    return {"status": "implementing"}


@router.delete("/{run_id}")
async def cancel_run(
    run_id: str,
    current_user: dict = Depends(get_current_user),
):
    run = await db.get_run(run_id, current_user["id"])
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    from worker.processor import cancel_run as worker_cancel
    await worker_cancel(run_id)

    import shutil, os
    repo_path = f"/tmp/{run_id}"
    if os.path.exists(repo_path):
        shutil.rmtree(repo_path)

    await db.update_run(run_id, status="cancelled")
    return {"status": "cancelled"}


@router.get("/{run_id}/diff")
async def get_run_diff(
    run_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Proxy the GitHub PR diff."""
    run = await db.get_run(run_id, current_user["id"])
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if not run.get("pr_url"):
        raise HTTPException(status_code=404, detail="No PR yet")

    import httpx
    user = await db.fetch_one("SELECT github_token FROM users WHERE id = $1", current_user["id"])
    encrypted = user.get("github_token", "") if user else ""
    if not encrypted:
        raise HTTPException(status_code=400, detail="No GitHub token stored")

    token = decrypt_token(encrypted)
    pr_url = run["pr_url"]
    # Convert HTML URL to API URL for diff
    # e.g. https://github.com/owner/repo/pull/123 → https://api.github.com/repos/owner/repo/pulls/123
    api_url = pr_url.replace("https://github.com/", "https://api.github.com/repos/").replace("/pull/", "/pulls/")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            api_url,
            headers={"Authorization": f"token {token}", "Accept": "application/vnd.github.v3.diff"},
        )
    return {"diff": resp.text, "pr_url": pr_url}
