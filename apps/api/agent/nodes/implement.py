import os
import git
from pathlib import Path
from agent.state import AgentState
from agent.tools import llm
from agent.tools.indexer import semantic_search


async def _write_file(
    run_id: str,
    file_path: str,
    spec: str,
    plan: dict,
    redirect_note: str | None,
    current_content: str,
    related_chunks: list[dict],
    emit,
) -> str:
    """Ask Claude to write/rewrite a single file. Returns new content."""
    related = "\n\n".join(
        f"--- {c['path']} ---\n{c['text']}" for c in related_chunks[:5]
    )
    redirect_section = (
        f"\nIMPORTANT USER INSTRUCTION: {redirect_note}\n" if redirect_note else ""
    )

    # Keep prompt under 60k tokens: truncate large files
    if len(current_content) > 12000:
        current_content = current_content[:12000] + "\n... (truncated for brevity)"

    system = (
        "You are an expert software engineer. "
        "Return ONLY the complete file content with no explanation, "
        "no markdown fences, and no commentary. "
        "The output will be written directly to disk."
    )
    prompt = f"""Implement the following spec by writing the complete file content for {file_path}.
{redirect_section}
SPEC:
{spec[:2000]}

IMPLEMENTATION PLAN:
{str(plan.get('approach', ''))[:1000]}

CURRENT FILE CONTENT ({file_path}):
{current_content if current_content else '(new file — does not exist yet)'}

RELATED CODE FOR CONTEXT:
{related[:4000]}

Write the COMPLETE new content of {file_path}. No explanation. No markdown. Just the code."""

    content = await llm.complete(prompt, system=system, model="claude-sonnet-4-5", max_tokens=8192)
    return content


async def run(state: AgentState) -> AgentState:
    run_id = state["run_id"]
    spec = state["spec"]
    plan = state["plan"] or {}
    redirect_note = state.get("redirect_note")
    current_files = dict(state.get("current_files", {}))
    log_events = []

    async def emit(msg: str):
        log_events.append(msg)

    repo_path = f"/tmp/{run_id}"

    files_to_process = [
        {"path": f["path"], "is_new": False}
        for f in plan.get("files_to_modify", [])
    ] + [
        {"path": f["path"], "is_new": True}
        for f in plan.get("files_to_create", [])
    ]

    await emit(f"Implementing {len(files_to_process)} files...")

    for file_info in files_to_process:
        rel_path = file_info["path"]
        full_path = os.path.join(repo_path, rel_path)

        # Read current content
        current_content = ""
        if os.path.exists(full_path):
            try:
                with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                    current_content = f.read()
            except Exception:
                pass

        # Get related chunks
        search_query = f"{rel_path} {spec[:200]}"
        related = await semantic_search(run_id, search_query, n_results=5)

        await emit(f"Writing {rel_path}...")
        new_content = await _write_file(
            run_id, rel_path, spec, plan, redirect_note,
            current_content, related, emit,
        )

        # Write to disk
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(new_content)

        current_files[rel_path] = new_content
        await emit(f"Written {rel_path}")

    # Git commit
    try:
        repo = git.Repo(repo_path)
        repo.git.add("--all")
        spec_summary = spec[:60].replace('"', "'")
        repo.index.commit(f'feat: {spec_summary} [yantra]')
        await emit("Changes committed to local branch.")
    except git.GitCommandError as e:
        await emit(f"Git commit warning: {e}")

    return {**state, "current_files": current_files, "log_events": log_events}
