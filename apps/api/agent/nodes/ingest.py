import json
import re
from agent.state import AgentState
from agent.tools import llm


GITHUB_ISSUE_RE = re.compile(
    r"https://github\.com/([^/]+)/([^/]+)/issues/(\d+)"
)


async def run(state: AgentState) -> AgentState:
    spec = state["spec"]
    log_events = []

    def emit(msg: str):
        log_events.append(msg)

    emit("Starting spec ingestion...")

    # 1. Detect GitHub issue URL and fetch body
    match = GITHUB_ISSUE_RE.search(spec)
    if match:
        owner, repo, issue_num = match.group(1), match.group(2), int(match.group(3))
        try:
            from github import Github
            from agent.tools.crypto import decrypt_token
            # If token available in state (future enhancement), use it
            emit(f"Fetching GitHub issue #{issue_num} from {owner}/{repo}...")
            # For now, fetch publicly (issue may be on public repo)
            g = Github()
            gh_repo = g.get_repo(f"{owner}/{repo}")
            issue = gh_repo.get_issue(issue_num)
            spec = f"Title: {issue.title}\n\n{issue.body or ''}"
            emit(f"Fetched issue: {issue.title}")
        except Exception as e:
            emit(f"Could not fetch issue (will use URL as spec): {e}")

    # 2. Parse spec with Claude Haiku (fast + cheap)
    system = (
        "You are a software engineering analyst. "
        "Extract structured information from a feature spec or GitHub issue."
    )
    prompt = f"""Analyze this software spec and return ONLY valid JSON (no markdown, no explanation):

SPEC:
{spec[:3000]}

Return this exact JSON structure:
{{
  "goal": "one sentence describing what to build",
  "acceptance_criteria": ["criterion 1", "criterion 2"],
  "constraints": ["constraint 1"],
  "clarifying_questions": ["question if something is truly unclear and blocks implementation"]
}}"""

    raw = await llm.complete(prompt, system=system, model="claude-haiku-4-5-20251001", max_tokens=1024)

    try:
        # Strip any accidental markdown fencing
        cleaned = raw.strip().strip("```json").strip("```").strip()
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        parsed = {
            "goal": spec[:200],
            "acceptance_criteria": [],
            "constraints": [],
            "clarifying_questions": [],
        }

    goal = parsed.get("goal", spec[:100])
    risks = parsed.get("clarifying_questions", [])

    emit(f"Spec parsed. Goal: {goal}")
    if risks:
        emit(f"Potential blockers identified: {'; '.join(risks)}")

    return {
        **state,
        "spec": spec,
        "log_events": log_events,
    }
