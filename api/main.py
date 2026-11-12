"""AuditLoop API (docs/API.md). v0: startup + /health. Runs/decision endpoints come next."""
from contextlib import asynccontextmanager

from fastapi import FastAPI

from agent.graph import get_graph
from core import config, db


def _paused_threads() -> list[str]:
    graph = get_graph()
    paused = []
    for tid in db.list_thread_ids():
        state = graph.get_state({"configurable": {"thread_id": tid}})
        if "human_review" in (state.next or ()):
            paused.append(tid)
    return paused


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    get_graph()   # opens the long-lived checkpoints.db connection
    print(f"[api] startup: paused runs = {_paused_threads()}")
    yield


app = FastAPI(title="AuditLoop", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    try:
        db.get_config("threshold")
        db_ok = True
    except Exception as e:   # health must answer even if the DB is broken
        print(f"[api] health db error: {e}")
        db_ok = False
    return {
        "ok": db_ok,
        "db": db_ok,
        "llm_provider": config.LLM_PROVIDER,
        "paused_runs": len(_paused_threads()) if db_ok else 0,
    }
