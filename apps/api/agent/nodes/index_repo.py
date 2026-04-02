import os
import shutil
import git
from agent.state import AgentState
from agent.tools.indexer import index_repo as do_index


async def run(state: AgentState) -> AgentState:
    run_id = state["run_id"]
    repo_url = state["repo_url"]
    log_events = []

    async def emit(msg: str):
        log_events.append(msg)

    repo_path = f"/tmp/{run_id}"

    # Clean up any previous clone
    if os.path.exists(repo_path):
        shutil.rmtree(repo_path)

    await emit(f"Cloning {repo_url}...")
    try:
        git.Repo.clone_from(repo_url, repo_path, depth=1)
    except git.GitCommandError as e:
        await emit(f"Clone failed: {e}")
        return {**state, "error": str(e), "log_events": log_events}

    await emit("Clone complete. Indexing repository...")

    chunk_count = await do_index(run_id, repo_path, emit)

    return {**state, "log_events": log_events}
