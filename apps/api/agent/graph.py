from typing import Any
from langgraph.graph import StateGraph, END
from langgraph.types import interrupt

from agent.state import AgentState
from agent.nodes import ingest, index_repo, plan, implement, test_runner, open_pr


def human_gate_node(state: AgentState) -> AgentState:
    """
    LangGraph interrupt() pauses the graph here.
    Frontend receives plan via SSE, user approves/redirects.
    Resume is triggered by POST /runs/{id}/approve.
    """
    result = interrupt({"plan": state["plan"]})
    return {
        **state,
        "approved": True,
        "redirect_note": result.get("redirect_note") if result else None,
    }


def route_after_test(state: AgentState) -> str:
    if state["test_passed"]:
        return "open_pr"
    if state.get("retry_count", 0) >= 3:
        return "fail"
    return "retry"


def build_graph(checkpointer=None):
    g = StateGraph(AgentState)

    g.add_node("ingest", ingest.run)
    g.add_node("index", index_repo.run)
    g.add_node("plan", plan.run)
    g.add_node("human_gate", human_gate_node)
    g.add_node("implement", implement.run)
    g.add_node("test", test_runner.run)
    g.add_node("open_pr", open_pr.run)

    g.set_entry_point("ingest")
    g.add_edge("ingest", "index")
    g.add_edge("index", "plan")
    g.add_edge("plan", "human_gate")
    g.add_edge("human_gate", "implement")
    g.add_edge("implement", "test")
    g.add_conditional_edges(
        "test",
        route_after_test,
        {
            "retry": "implement",
            "open_pr": "open_pr",
            "fail": END,
        },
    )
    g.add_edge("open_pr", END)

    compile_kwargs: dict[str, Any] = {"interrupt_before": ["human_gate"]}
    if checkpointer is not None:
        compile_kwargs["checkpointer"] = checkpointer

    return g.compile(**compile_kwargs)
