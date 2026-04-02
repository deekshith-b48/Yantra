from typing import TypedDict, Annotated, List, Optional
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    run_id: str
    repo_url: str
    spec: str
    plan: Optional[dict]           # {files_to_modify, files_to_create, approach, risks, estimated_test_strategy}
    approved: bool                 # human gate flag
    redirect_note: Optional[str]   # user's redirect instructions
    current_files: dict            # {path: content} of modified files
    test_output: Optional[str]
    test_passed: bool
    retry_count: int               # max 3
    pr_url: Optional[str]
    error: Optional[str]
    log_events: Annotated[List[str], add_messages]  # SSE broadcast list
