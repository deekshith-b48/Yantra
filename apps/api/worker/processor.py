"""
ARQ-based worker for running LangGraph agent jobs.
ARQ is the Python-native Redis queue (alternative to BullMQ).
"""
import asyncio
import json
import os
import traceback
from typing import Optional

import redis.asyncio as aioredis
from langgraph.types import Command
from langgraph.errors import GraphInterrupt

from agent.graph import build_graph
from agent.state import AgentState
from db.models import db


async def _get_redis() -> aioredis.Redis:
    return aioredis.from_url(os.environ["REDIS_URL"], decode_responses=True)


async def publish_event(run_id: str, event: dict):
    """Publish a structured event to the Redis pub/sub channel for this run."""
    r = await _get_redis()
    channel = f"run:{run_id}:events"
    await r.publish(channel, json.dumps(event))
    await r.aclose()


async def enqueue_run(run_id: str, repo_url: str, spec: str, github_token_enc: str):
    """Push a job onto the Redis queue."""
    r = await _get_redis()
    job = json.dumps({
        "run_id": run_id,
        "repo_url": repo_url,
        "spec": spec,
        "github_token_enc": github_token_enc,
    })
    await r.rpush("yantra:jobs", job)
    await r.aclose()


async def cancel_run(run_id: str):
    """Signal cancellation via Redis."""
    r = await _get_redis()
    await r.set(f"yantra:cancel:{run_id}", "1", ex=3600)
    await r.aclose()


async def resume_run(run_id: str, redirect_note: Optional[str] = None):
    """Push a resume signal onto the queue so the worker can continue."""
    r = await _get_redis()
    payload = json.dumps({
        "type": "resume",
        "run_id": run_id,
        "redirect_note": redirect_note,
    })
    await r.rpush("yantra:jobs", payload)
    await r.aclose()


async def _is_cancelled(run_id: str) -> bool:
    r = await _get_redis()
    val = await r.get(f"yantra:cancel:{run_id}")
    await r.aclose()
    return val is not None


# ─── Graph instances (one per worker process) ─────────────────────────────────

_graph = None


def get_graph():
    global _graph
    if _graph is None:
        # Use in-memory checkpointer for now; swap to PostgresSaver in prod
        from langgraph.checkpoint.memory import MemorySaver
        _graph = build_graph(checkpointer=MemorySaver())
    return _graph


# ─── Core job processor ───────────────────────────────────────────────────────

async def process_job(job_data: dict):
    run_id = job_data["run_id"]

    if await _is_cancelled(run_id):
        return

    graph = get_graph()
    config = {"configurable": {"thread_id": run_id}}

    # Ensure DB is connected
    if db.pool is None:
        await db.connect()

    async def publish(event: dict):
        await publish_event(run_id, event)
        # Also persist log lines to DB
        if event.get("type") == "log":
            steps = await db.get_steps(run_id)
            step_name = event.get("step", "")
            matching = [s for s in steps if s["step"] == step_name and s["status"] == "running"]
            if matching:
                await db.append_log(matching[0]["id"], event["msg"])

    # Build initial state
    initial_state = AgentState(
        run_id=run_id,
        repo_url=job_data["repo_url"],
        spec=job_data["spec"],
        plan=None,
        approved=False,
        redirect_note=None,
        current_files={},
        test_output=None,
        test_passed=False,
        retry_count=0,
        pr_url=None,
        error=None,
        log_events=[],
        github_token_enc=job_data.get("github_token_enc", ""),
    )

    STATUS_MAP = {
        "ingest": "indexing",
        "index": "indexing",
        "plan": "planning",
        "implement": "implementing",
        "test": "testing",
        "open_pr": "opening_pr",
    }

    try:
        async for chunk in graph.astream(initial_state, config, stream_mode="updates"):
            if await _is_cancelled(run_id):
                await publish({"type": "status", "status": "cancelled"})
                await db.update_run(run_id, status="cancelled")
                return

            for node_name, node_output in chunk.items():
                if node_name == "__interrupt__":
                    # Human gate triggered
                    await publish({"type": "plan", "plan": node_output[0].value.get("plan")})
                    await db.update_run(
                        run_id,
                        status="awaiting_approval",
                        plan=node_output[0].value.get("plan"),
                    )
                    return  # Worker pauses; will be resumed by POST /runs/{id}/approve

                new_status = STATUS_MAP.get(node_name)
                if new_status:
                    await db.update_run(run_id, status=new_status)
                    await publish({"type": "status", "status": new_status})

                for line in node_output.get("log_events", []):
                    await publish({"type": "log", "step": node_name, "msg": line})

                if node_name == "open_pr" and node_output.get("pr_url"):
                    pr_url = node_output["pr_url"]
                    await db.update_run(run_id, status="done", pr_url=pr_url)
                    await publish({"type": "pr", "url": pr_url})
                    await publish({"type": "status", "status": "done"})

                if node_output.get("error"):
                    await publish({"type": "error", "msg": node_output["error"]})
                    await db.update_run(run_id, status="failed", error=node_output["error"])
                    await publish({"type": "status", "status": "failed"})
                    return

    except GraphInterrupt:
        pass  # Normal — waiting for human approval
    except Exception as e:
        err = traceback.format_exc()
        await publish({"type": "error", "msg": str(e)})
        await db.update_run(run_id, status="failed", error=str(e))
        await publish({"type": "status", "status": "failed"})


async def process_resume(job_data: dict):
    """Resume a paused graph after human approval."""
    run_id = job_data["run_id"]
    redirect_note = job_data.get("redirect_note")

    graph = get_graph()
    config = {"configurable": {"thread_id": run_id}}

    if db.pool is None:
        await db.connect()

    async def publish(event: dict):
        await publish_event(run_id, event)

    STATUS_MAP = {
        "implement": "implementing",
        "test": "testing",
        "open_pr": "opening_pr",
    }

    try:
        resume_payload = {"redirect_note": redirect_note} if redirect_note else {}
        async for chunk in graph.astream(
            Command(resume=resume_payload), config, stream_mode="updates"
        ):
            for node_name, node_output in chunk.items():
                new_status = STATUS_MAP.get(node_name)
                if new_status:
                    await db.update_run(run_id, status=new_status)
                    await publish({"type": "status", "status": new_status})

                for line in node_output.get("log_events", []):
                    await publish({"type": "log", "step": node_name, "msg": line})

                if node_name == "open_pr" and node_output.get("pr_url"):
                    pr_url = node_output["pr_url"]
                    await db.update_run(run_id, status="done", pr_url=pr_url)
                    await publish({"type": "pr", "url": pr_url})
                    await publish({"type": "status", "status": "done"})

                if node_output.get("error"):
                    await publish({"type": "error", "msg": node_output["error"]})
                    await db.update_run(run_id, status="failed", error=node_output["error"])
                    await publish({"type": "status", "status": "failed"})
                    return

    except Exception as e:
        await publish({"type": "error", "msg": str(e)})
        await db.update_run(run_id, status="failed", error=str(e))
        await publish({"type": "status", "status": "failed"})


# ─── Worker main loop ─────────────────────────────────────────────────────────

async def worker_main():
    """Long-running worker that polls the Redis job queue."""
    print("YANTRA worker started, polling yantra:jobs...")
    if db.pool is None:
        await db.connect()

    r = await _get_redis()

    while True:
        try:
            # Blocking pop with 5s timeout
            result = await r.blpop("yantra:jobs", timeout=5)
            if result is None:
                continue

            _, raw = result
            job_data = json.loads(raw)

            if job_data.get("type") == "resume":
                await process_resume(job_data)
            else:
                await process_job(job_data)

        except Exception as e:
            print(f"Worker error: {e}")
            traceback.print_exc()
            await asyncio.sleep(1)


if __name__ == "__main__":
    asyncio.run(worker_main())
