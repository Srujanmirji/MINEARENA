"""AuditLoop API (docs/API.md).

v1: POST /runs, GET /runs/{thread_id}, GET /pending, POST /runs/{thread_id}/decision, GET /health.

Run status is always derived from the LangGraph checkpoint (graph.get_state), never from
memory alone, so a killed-and-restarted server shows the same paused item.
"""
import threading
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import BackgroundTasks, FastAPI, HTTPException
from langgraph.types import Command
from pydantic import BaseModel, model_validator

from agent import nodes
from agent.graph import get_graph
from core import config, db

# In-memory only: which threads have a job running right now, and the last error per thread.
ACTIVE: set[str] = set()
ERRORS: dict[str, str] = {}
_registry_lock = threading.Lock()
_thread_locks: dict[str, threading.Lock] = {}


# ---------- request bodies ----------

class RunIn(BaseModel):
    ticker: str
    force: bool = False


class DecisionIn(BaseModel):
    value_id: str
    action: Literal["approve", "correct", "reject"]
    new_value: float | None = None
    reviewer: str = "reviewer"
    note: str | None = None

    @model_validator(mode="after")
    def _required_fields(self) -> "DecisionIn":
        if self.action == "correct" and self.new_value is None:
            raise ValueError("new_value is required when action is 'correct'")
        if self.action in ("correct", "reject") and not (self.note or "").strip():
            raise ValueError("note is required when action is 'correct' or 'reject'")
        return self


# ---------- state helpers ----------

def _cfg(thread_id: str) -> dict:
    return {"configurable": {"thread_id": thread_id}}


def _lock_for(thread_id: str) -> threading.Lock:
    with _registry_lock:
        return _thread_locks.setdefault(thread_id, threading.Lock())


def _snapshot(thread_id: str):
    return get_graph().get_state(_cfg(thread_id))


def _exists(thread_id: str, snap=None) -> bool:
    snap = snap or _snapshot(thread_id)
    return thread_id in ACTIVE or thread_id in ERRORS or bool(snap.values)


def _interrupt(snap) -> dict | None:
    """Payload of the pending interrupt(), i.e. {"value": ..., "reason": ...}."""
    for task in snap.tasks:
        if task.interrupts:
            return task.interrupts[0].value
    return None


def _status(thread_id: str, snap) -> tuple[str, str | None]:
    """(status, error). status: running | paused | done | error."""
    if thread_id in ACTIVE:
        return "running", None
    if _interrupt(snap) is not None:
        return "paused", ERRORS.get(thread_id)   # still decidable; a failed resume can be retried
    if thread_id in ERRORS:
        return "error", ERRORS[thread_id]
    if not snap.next:
        return "done", None
    return "error", f"run stopped before '{snap.next[0]}' and was not resumed (server restarted mid-run?)"


def _steps_done(thread_id: str) -> list[str]:
    """Nodes that have finished at least once, in first-run order."""
    history = list(get_graph().get_state_history(_cfg(thread_id)))   # newest first
    done: list[str] = []
    for snap in reversed(history[1:]):                               # skip the current snapshot
        for node in snap.next:
            if node != "__start__" and node not in done:
                done.append(node)
    return done


def _known_threads() -> list[str]:
    return sorted(set(db.list_thread_ids()) | ACTIVE | set(ERRORS))


def _paused_threads() -> list[str]:
    return [t for t in _known_threads() if _status(t, _snapshot(t))[0] == "paused"]


# ---------- background job ----------

def _run_graph(thread_id: str, ticker: str) -> None:
    try:
        threshold = float(db.get_config("threshold", config.THRESHOLD))
        with _lock_for(thread_id):
            get_graph().invoke({"ticker": ticker, "threshold": threshold}, _cfg(thread_id))
    except Exception as e:   # a failed run must never take the API down
        ERRORS[thread_id] = f"{type(e).__name__}: {e}"
        print(f"[api] run {thread_id} failed: {ERRORS[thread_id]}")
    finally:
        ACTIVE.discard(thread_id)


# ---------- app ----------

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


@app.post("/runs")
def start_run(body: RunIn, background: BackgroundTasks) -> dict:
    ticker = body.ticker.strip().upper()
    try:
        meta = nodes.resolve_filing(ticker)   # cached lookup; gives us fiscal_year for the thread id
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"cannot find a 10-K for {ticker}: {e}")

    base = f"{ticker}-{meta['fiscal_year']}"
    with _registry_lock:
        thread_id = base
        if _exists(base):
            if not body.force:
                status, _ = _status(base, _snapshot(base))
                return {"thread_id": base, "status": status, "created": False}
            n = 2
            while _exists(f"{base}-r{n}"):
                n += 1
            thread_id = f"{base}-r{n}"
        ACTIVE.add(thread_id)   # registered before we return, so a double POST can't start it twice

    background.add_task(_run_graph, thread_id, ticker)
    return {"thread_id": thread_id, "status": "running", "created": True}


@app.get("/runs/{thread_id}")
def run_detail(thread_id: str) -> dict:
    snap = _snapshot(thread_id)
    if not _exists(thread_id, snap):
        raise HTTPException(status_code=404, detail="unknown thread_id")
    status, error = _status(thread_id, snap)
    return {
        "thread_id": thread_id,
        "status": status,
        "next": list(snap.next),
        "steps_done": _steps_done(thread_id),
        "interrupt": _interrupt(snap) if status == "paused" else None,
        "error": error,
    }


@app.get("/pending")
def pending() -> list[dict]:
    """The currently paused item of every paused run, followed by the items queued behind it."""
    out: list[dict] = []
    for thread_id in _known_threads():
        snap = _snapshot(thread_id)
        if _status(thread_id, snap)[0] != "paused":
            continue
        by_id = {v["id"]: v for v in snap.values.get("values", [])}
        for i, value_id in enumerate(snap.values.get("pending", [])):
            value = by_id[value_id]
            out.append({"thread_id": thread_id, "is_current": i == 0,
                        "value": value, "reason": value.get("escalation_reason")})
    return out


def _after(thread_id: str, duplicate: bool) -> dict:
    snap = _snapshot(thread_id)
    status, _ = _status(thread_id, snap)
    current = _interrupt(snap)
    return {"status": status,
            "next_value_id": current["value"]["id"] if status == "paused" and current else None,
            "duplicate": duplicate}


def _resume(thread_id: str, decision: dict) -> None:
    """The ONLY place that calls Command(resume=...)."""
    ACTIVE.add(thread_id)
    try:
        get_graph().invoke(Command(resume=decision), _cfg(thread_id))
    except Exception as e:
        ERRORS[thread_id] = f"{type(e).__name__}: {e}"
        print(f"[api] resume {thread_id} failed: {ERRORS[thread_id]}")
        raise HTTPException(status_code=500, detail=f"decision recorded, but resume failed: {ERRORS[thread_id]}")
    finally:
        ACTIVE.discard(thread_id)


@app.post("/runs/{thread_id}/decision")
def decide(thread_id: str, body: DecisionIn) -> dict:
    decision_id = f"{thread_id}:{body.value_id}"   # derived here; the UI never generates ids
    if thread_id in ACTIVE:
        raise HTTPException(status_code=409, detail="run is not paused (status: running)")
    with _lock_for(thread_id):                     # one decision at a time per run
        snap = _snapshot(thread_id)
        if not _exists(thread_id, snap):
            raise HTTPException(status_code=404, detail="unknown thread_id")
        status, _ = _status(thread_id, snap)
        current = _interrupt(snap) if status == "paused" else None
        current_id = current["value"]["id"] if current else None

        stored = db.get_decision(decision_id)
        if stored is not None:
            # Already decided. If a crash left the graph still paused on this value,
            # finish the job with the decision that is on record (not the new body).
            if current_id == body.value_id:
                _resume(thread_id, {k: stored[k] for k in
                                    ("decision_id", "thread_id", "value_id", "action", "new_value", "reviewer", "note")})
            return _after(thread_id, duplicate=True)

        if status != "paused":
            raise HTTPException(status_code=409, detail=f"run is not paused (status: {status})")
        if current_id != body.value_id:
            raise HTTPException(status_code=409, detail="not the current item")

        decision = {**body.model_dump(), "decision_id": decision_id, "thread_id": thread_id}
        if not db.record_decision(decision):       # record first, then resume (PS 3.5)
            return _after(thread_id, duplicate=True)
        ERRORS.pop(thread_id, None)
        _resume(thread_id, decision)
        return _after(thread_id, duplicate=False)
