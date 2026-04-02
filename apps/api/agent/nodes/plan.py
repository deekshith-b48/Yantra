import os
import json
from pathlib import Path
from agent.state import AgentState
from agent.tools import llm
from agent.tools.indexer import semantic_search


def _build_file_tree(repo_path: str, max_lines: int = 200) -> str:
    lines = []
    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in {
            "node_modules", ".git", "dist", "__pycache__", ".next",
            "build", "coverage", ".turbo",
        }]
        level = root.replace(repo_path, "").count(os.sep)
        indent = "  " * level
        lines.append(f"{indent}{os.path.basename(root)}/")
        sub_indent = "  " * (level + 1)
        for file in files:
            lines.append(f"{sub_indent}{file}")
        if len(lines) > max_lines:
            lines.append("  ... (truncated)")
            break
    return "\n".join(lines)


async def run(state: AgentState) -> AgentState:
    run_id = state["run_id"]
    spec = state["spec"]
    log_events = []

    def emit(msg: str):
        log_events.append(msg)

    emit("Building implementation plan...")

    # 1. Semantic search for relevant code
    chunks = await semantic_search(run_id, spec, n_results=15)
    context_snippets = "\n\n".join(
        f"--- {c['path']} ---\n{c['text']}" for c in chunks
    )

    # 2. File tree
    repo_path = f"/tmp/{run_id}"
    file_tree = _build_file_tree(repo_path)

    # 3. Prompt Claude for plan
    system = (
        "You are a senior software engineer. "
        "Produce a precise, actionable implementation plan in JSON."
    )
    prompt = f"""Given this spec and codebase context, produce a JSON implementation plan.

SPEC:
{spec[:3000]}

FILE TREE:
{file_tree[:3000]}

RELEVANT CODE CHUNKS:
{context_snippets[:8000]}

Return ONLY valid JSON (no markdown fences, no explanation):
{{
  "files_to_modify": [
    {{"path": "src/auth.ts", "reason": "why", "change_summary": "what changes"}}
  ],
  "files_to_create": [
    {{"path": "src/new_feature.ts", "purpose": "what it does"}}
  ],
  "approach": "step by step implementation strategy as a prose paragraph",
  "risks": ["edge case or risk 1", "edge case or risk 2"],
  "estimated_test_strategy": "how to verify this works"
}}"""

    raw = await llm.complete(prompt, system=system, model="claude-sonnet-4-5", max_tokens=4096)

    try:
        cleaned = raw.strip().strip("```json").strip("```").strip()
        plan = json.loads(cleaned)
    except json.JSONDecodeError:
        # Best-effort extraction
        plan = {
            "files_to_modify": [],
            "files_to_create": [],
            "approach": raw[:500],
            "risks": ["Could not parse plan JSON — manual review needed"],
            "estimated_test_strategy": "Run existing test suite",
        }

    total_files = len(plan.get("files_to_modify", [])) + len(plan.get("files_to_create", []))
    emit(f"Plan ready. Touching {total_files} files.")
    emit(f"Approach: {plan.get('approach', '')[:200]}")

    return {**state, "plan": plan, "log_events": log_events}
