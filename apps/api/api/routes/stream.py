import os
import json
import asyncio
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from api.deps import get_current_user
from db.models import db

router = APIRouter()

PING_INTERVAL = 15  # seconds


async def _get_user_from_token(token: str) -> Optional[dict]:
    """Validate Clerk token and return user (used for SSE query-param auth)."""
    from api.deps import verify_token_from_query
    return await verify_token_from_query(token)


@router.get("/{run_id}/stream")
async def stream_run(
    run_id: str,
    token: Optional[str] = Query(None),
):
    # SSE can't send custom headers, so accept token as query param
    user = None
    if token:
        user = await _get_user_from_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    run = await db.get_run(run_id, user["id"])
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    async def event_generator():
        import redis.asyncio as aioredis

        r = aioredis.from_url(os.environ["REDIS_URL"])
        pubsub = r.pubsub()
        channel = f"run:{run_id}:events"
        await pubsub.subscribe(channel)

        # Send any buffered history first (replay from run_steps.log)
        steps = await db.get_steps(run_id)
        for step in steps:
            for line in (step.get("log") or []):
                event = {"type": "log", "step": step["step"], "msg": line}
                yield f"data: {json.dumps(event)}\n\n"

        # Check if already terminal
        current_run = await db.get_run_any(run_id)
        if current_run and current_run["status"] in ("done", "failed", "cancelled"):
            yield f"data: {json.dumps({'type': 'status', 'status': current_run['status']})}\n\n"
            await pubsub.unsubscribe(channel)
            await r.aclose()
            return

        ping_task = None
        try:
            last_ping = asyncio.get_event_loop().time()
            async for message in pubsub.listen():
                now = asyncio.get_event_loop().time()

                # Keep-alive ping every 15s
                if now - last_ping >= PING_INTERVAL:
                    yield ": ping\n\n"
                    last_ping = now

                if message["type"] != "message":
                    continue

                raw = message["data"]
                if isinstance(raw, bytes):
                    raw = raw.decode()

                try:
                    event = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                yield f"data: {raw}\n\n"

                # Close stream on terminal events
                if event.get("type") == "status" and event.get("status") in ("done", "failed"):
                    break

        finally:
            await pubsub.unsubscribe(channel)
            await r.aclose()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
