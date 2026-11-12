"""LangGraph wiring (ARCHITECTURE §3).

fetch_filing → locate_statements → extract → score_confidence → validate → route → auto_approve
  → (pending?) human_review ↔ apply_decision → verify_vs_xbrl → build_report → END

The report node is called "build_report" because LangGraph forbids a node named like a
state key, and "report" is a key in AuditState.
"""
import sqlite3

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph

from agent import nodes
from agent.state import AuditState
from core import config

_compiled = None
_conn: sqlite3.Connection | None = None


def build_graph() -> StateGraph:
    g = StateGraph(AuditState)
    g.add_node("fetch_filing", nodes.fetch_filing)
    g.add_node("locate_statements", nodes.locate_statements_node)
    g.add_node("extract", nodes.extract)
    g.add_node("score_confidence", nodes.score_confidence)
    g.add_node("validate", nodes.validate)
    g.add_node("route", nodes.route)
    g.add_node("auto_approve", nodes.auto_approve)
    g.add_node("human_review", nodes.human_review)
    g.add_node("apply_decision", nodes.apply_decision)
    g.add_node("verify_vs_xbrl", nodes.verify_vs_xbrl)
    g.add_node("build_report", nodes.build_report)

    g.add_edge(START, "fetch_filing")
    g.add_edge("fetch_filing", "locate_statements")
    g.add_edge("locate_statements", "extract")
    g.add_edge("extract", "score_confidence")      # PS Step 3: did we read it right?
    g.add_edge("score_confidence", "validate")     # PS Step 4: does it make sense?
    g.add_edge("validate", "route")                # PS Step 5: automated decision
    g.add_edge("route", "auto_approve")
    g.add_conditional_edges("auto_approve", nodes.has_pending, ["human_review", "verify_vs_xbrl"])
    g.add_edge("human_review", "apply_decision")
    g.add_conditional_edges("apply_decision", nodes.has_pending, ["human_review", "verify_vs_xbrl"])
    g.add_edge("verify_vs_xbrl", "build_report")
    g.add_edge("build_report", END)
    return g


def list_checkpoint_threads() -> list[str]:
    """Every thread_id with at least one checkpoint (includes runs that never reached extract)."""
    get_graph()
    try:
        return [r[0] for r in _conn.execute("SELECT DISTINCT thread_id FROM checkpoints")]
    except sqlite3.OperationalError:   # table not created until the first checkpoint
        return []


def get_graph():
    """Compiled graph with a long-lived SqliteSaver (one connection for the process)."""
    global _compiled, _conn
    if _compiled is None:
        config.DATA_DIR.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(config.CHECKPOINT_DB, check_same_thread=False)
        _compiled = build_graph().compile(checkpointer=SqliteSaver(_conn))
    return _compiled


if __name__ == "__main__":
    # Smoke test on mock data: run MOCKA until the first pause, approve once, show where it stops.
    from langgraph.types import Command
    from core.db import init_db

    init_db()
    graph = get_graph()
    cfg = {"configurable": {"thread_id": "MOCKA-2024-smoke"}}
    res = graph.invoke({"ticker": "MOCKA", "threshold": config.THRESHOLD}, cfg)
    if "__interrupt__" in res:
        item = res["__interrupt__"][0].value["value"]
        print(f"[graph] paused on {item['id']}: {item['escalation_reason']}")
        res = graph.invoke(Command(resume={"value_id": item["id"], "action": "approve", "reviewer": "smoke"}), cfg)
    print(f"[graph] next: {graph.get_state(cfg).next}")
