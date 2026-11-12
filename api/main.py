"""AuditLoop API (docs/API.md).

Runs: POST /runs, GET /runs, GET /runs/{thread_id}, GET /runs/{thread_id}/source/{value_id}
Review: GET /pending, POST /runs/{thread_id}/decision
Data: GET /values, GET /validations, GET /report, GET /report.csv, GET/PUT /config,
      GET /audit, GET /audit/verify, GET /health

Run status is always derived from the LangGraph checkpoint (graph.get_state), never from
memory alone, so a killed-and-restarted server shows the same paused item.
"""
import csv
import io
import re
import threading
from contextlib import asynccontextmanager
from typing import Literal

from bs4 import BeautifulSoup

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.responses import Response
from langgraph.types import Command
from pydantic import BaseModel, model_validator

from agent import nodes
from agent.graph import get_graph, list_checkpoint_threads
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
    failed = _checkpoint_error(snap)
    if failed:
        return "error", failed
    return "error", f"run stopped before '{snap.next[0]}' and was not resumed (server restarted mid-run?)"


def _checkpoint_error(snap) -> str | None:
    """A node that raised leaves its error in the checkpoint, so the message survives a restart."""
    for task in snap.tasks:
        if getattr(task, "error", None):
            return f"{task.name} failed: {task.error}"
    return None


def _steps_done(thread_id: str) -> list[str]:
    """Nodes that have finished at least once, in first-run order."""
    history = list(get_graph().get_state_history(_cfg(thread_id)))   # newest first
    done: list[str] = []
    for snap in reversed(history[1:]):                               # skip the current snapshot
        for node in snap.next:
            if node != "__start__" and node not in done:
                done.append(node)
    return done


def _runs_of(base: str) -> list[tuple[str, str]]:
    """Every run of one filing (base, base-r2, base-r3, ...) with its status, oldest first."""
    def order(t: str) -> int:
        suffix = t[len(base):]
        return 1 if not suffix else int(suffix[2:]) if suffix[2:].isdigit() else 10**6
    tids = [t for t in _known_threads() if t == base or (t.startswith(base + "-r") and _exists(t))]
    return [(t, _status(t, _snapshot(t))[0]) for t in sorted(tids, key=order)]


def _known_threads() -> list[str]:
    """Rebuilt from app.db AND checkpoints.db, so it survives a restart (startup recovery)."""
    return sorted(set(db.list_thread_ids()) | set(list_checkpoint_threads()) | ACTIVE | set(ERRORS))


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
    # Startup recovery: every known thread's status comes from its checkpoint.
    by_status: dict[str, list[str]] = {}
    for tid in _known_threads():
        by_status.setdefault(_status(tid, _snapshot(tid))[0], []).append(tid)
    print(f"[api] startup recovery: {by_status or 'no runs yet'}")
    yield


app = FastAPI(title="AuditLoop", lifespan=lifespan)


@app.get("/companies")
def companies(q: str = "", limit: int = 8) -> list[dict]:
    """Search SEC's ticker list by ticker or name, for the dashboard's 'audit any company' box.
    Read-only, from the cached list; starting a run is still POST /runs."""
    from edgar.client import search_companies
    if len(q) > 60:
        raise HTTPException(status_code=422, detail="query too long (60 characters max)")
    try:
        return search_companies(q, max(1, min(limit, 20)))
    except Exception as e:   # SEC list not cached and no network
        raise HTTPException(status_code=503, detail=f"company list unavailable: {e}")


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
        runs = _runs_of(base)                      # [(thread_id, status)], oldest first
        if runs:
            latest, latest_status = runs[-1]
            if not body.force:
                return {"thread_id": latest, "status": latest_status, "created": False}
            active = [(t, s) for t, s in runs if s in ("running", "paused")]
            if active:   # a re-run would take this filing's values away from a run still in use
                t, s = active[-1]
                raise HTTPException(status_code=409, detail=f"{t} is still {s}; finish its review before re-running")
            thread_id = f"{base}-r{len(runs) + 1}"
            while _exists(thread_id):
                thread_id += "x"
        else:
            thread_id = base
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


# ---------- hardening: lists, data, config, audit, source evidence ----------

class ConfigIn(BaseModel):
    threshold: float | None = None
    yoy_threshold: float | None = None


HUMAN = ("approved", "corrected", "rejected")


@app.get("/runs")
def list_runs() -> list[dict]:
    out = []
    for thread_id in _known_threads():
        snap = _snapshot(thread_id)
        status, error = _status(thread_id, snap)
        state = snap.values or {}
        values = db.get_values(thread_id=thread_id)
        statuses = [v["status"] for v in values]
        ticker = state.get("ticker") or (values[0]["ticker"] if values else thread_id.split("-")[0])
        out.append({
            "thread_id": thread_id, "ticker": ticker, "status": status,
            "n_values": len(values),
            "n_pending": len(state.get("pending", [])) if status == "paused" else 0,
            "n_auto": statuses.count("auto_approved"),
            "n_reviewed": sum(s in HUMAN for s in statuses),
            "error": error,
        })
    return out


@app.get("/values")
def list_values(ticker: str | None = None, thread_id: str | None = None) -> list[dict]:
    return db.get_values(thread_id=thread_id, ticker=ticker)


@app.get("/validations")
def list_validations(ticker: str | None = None) -> list[dict]:
    """One row per check per filing. Filing-wide checks (A=L+E, segment sum) sit on several
    values; they are listed once."""
    out, seen = [], set()
    for v in db.get_values(ticker=ticker):
        for c in v.get("validation") or []:
            key = (v["thread_id"], c.get("check"), c.get("detail"))
            if key in seen:
                continue
            seen.add(key)
            out.append({"ticker": v["ticker"], "thread_id": v["thread_id"], "metric": v["metric"],
                        "check": c.get("check"), "severity": c.get("severity"),
                        "status": c.get("status"), "detail": c.get("detail")})
    return out


def _config_out() -> dict:
    return {"threshold": float(db.get_config("threshold", config.THRESHOLD)),
            "yoy_threshold": float(db.get_config("yoy_threshold", config.YOY_THRESHOLD)),
            "applies_to": "new runs only"}


@app.get("/config")
def read_config() -> dict:
    return _config_out()


@app.put("/config")
def update_config(body: ConfigIn) -> dict:
    changes = body.model_dump(exclude_none=True)
    if "threshold" in changes and not 0 < changes["threshold"] <= 1:
        raise HTTPException(status_code=422, detail="threshold must be in (0, 1]")
    if "yoy_threshold" in changes and not 0 < changes["yoy_threshold"] <= 10:
        raise HTTPException(status_code=422, detail="yoy_threshold must be in (0, 10]")
    for key, value in changes.items():
        db.set_config(key, value)
    return _config_out()


@app.get("/audit")
def audit_rows(limit: int = 200) -> list[dict]:
    try:
        from audit.log import list_rows
    except ImportError:
        return []
    return list_rows(limit=max(1, min(limit, 5000)))


@app.get("/audit/verify")
def audit_verify() -> dict:
    try:
        from audit.log import verify_chain
    except ImportError:
        raise HTTPException(status_code=503, detail="audit module not available")
    return verify_chain()


SCALE_TEXT = {1_000_000_000: "(In billions)", 1_000_000: "(In millions)", 1_000: "(In thousands)"}
_NUMERIC = re.compile(r"[\d$,.()%\s—–-]*")


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("’", "'")).strip().lower()


def _highlight(table_html: str, row_label: str) -> tuple[str, bool]:
    """Wrap the row whose label cell matches row_label in class='hl'."""
    soup = BeautifulSoup(table_html, "lxml")
    table = soup.find("table") or soup
    target = _norm(row_label)
    if target:
        for tr in table.find_all("tr"):
            cells = [_norm(c.get_text(" ")) for c in tr.find_all(["td", "th"])]
            label = next((c for c in cells if c and not _NUMERIC.fullmatch(c)), "")
            if label == target or label.startswith(target):
                tr["class"] = tr.get("class", []) + ["hl"]
                return str(table), True
    return str(table), False


@app.get("/runs/{thread_id}/source/{value_id}")
def source_evidence(thread_id: str, value_id: str) -> dict:
    value = db.get_value(value_id)
    if value is None or value["thread_id"] != thread_id:
        raise HTTPException(status_code=404, detail="unknown value for this run")
    if value.get("table_index") is None:
        raise HTTPException(status_code=404, detail="no source table recorded for this value (fixture data)")
    filing = db.get_filing(value["accession"])
    if filing is None:
        raise HTTPException(status_code=404, detail="filing not recorded")
    try:
        from extract.extractor import get_table_html
    except ImportError:
        raise HTTPException(status_code=503, detail="extract module not available")

    meta = {"cik": filing["cik"], "accession": filing["accession"],
            "primary_document": filing["primary_document"]}
    try:
        table_html = get_table_html(meta, int(value["table_index"]))
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"cannot load source table: {e}")
    html, found = _highlight(table_html, value.get("row_label") or "")

    tables = (_snapshot(thread_id).values or {}).get("tables", {})
    statement = next((t for t in tables.values() if t.get("index") == value["table_index"]), {})
    acc = filing["accession"].replace("-", "")
    return {
        "heading": statement.get("heading", ""),
        "scale_text": SCALE_TEXT.get(int(value.get("scale") or 1), ""),
        "html": html,
        "row_found": found,
        "source_url": f"https://www.sec.gov/Archives/edgar/data/{int(filing['cik'])}/{acc}/{filing['primary_document']}",
    }


# ---------- accuracy report (Srujan's verify.report) ----------

REPORT_COLUMNS = ["value_id", "thread_id", "ticker", "metric", "status", "confidence", "escalation_reason",
                  "orig_value", "our_value", "xbrl_tag", "xbrl_value", "abs_error", "match", "orig_match",
                  "yoy_anomaly"]


def _report(thread_id: str | None) -> dict:
    try:
        from verify.report import build_report
    except ImportError:
        raise HTTPException(status_code=503, detail="verify.report not available")
    if thread_id is not None and thread_id not in _known_threads():
        raise HTTPException(status_code=404, detail="unknown thread_id")
    return build_report(thread_id)


@app.get("/report")
def report(thread_id: str | None = None) -> dict:
    """All runs by default (the headline numbers); ?thread_id= for one run."""
    return _report(thread_id)


@app.get("/report.csv")
def report_csv(thread_id: str | None = None) -> Response:
    rows = _report(thread_id)["rows"]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=REPORT_COLUMNS, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    name = f"auditloop-report-{thread_id or 'all'}.csv"
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
