"""Append-only, SHA-256 hash-chained audit log (owner: Srujan). DDL = DATA_MODEL §3.

UPDATE/DELETE are blocked by triggers. append() is idempotent on decision_id.
"""
import hashlib
import json
import math
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "app.db"
GENESIS = "GENESIS"

DDL = """
CREATE TABLE IF NOT EXISTS audit_log (
  seq              INTEGER PRIMARY KEY AUTOINCREMENT,
  ts               TEXT NOT NULL,
  decision_id      TEXT UNIQUE NOT NULL,
  thread_id        TEXT NOT NULL,
  value_id         TEXT NOT NULL,
  metric           TEXT NOT NULL,
  original_value   REAL,
  corrected_value  REAL,
  decision         TEXT NOT NULL CHECK (decision IN ('approved','corrected','rejected','auto_approved')),
  reviewer         TEXT NOT NULL,
  reason           TEXT,
  prev_hash        TEXT NOT NULL,
  hash             TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
"""

# Decision.action (approve/correct/reject) -> audit_log.decision
ACTION_TO_DECISION = {"approve": "approved", "correct": "corrected", "reject": "rejected"}


def init_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(DDL)


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:   # share core.db's process-wide app.db lock (see core/db.py DB_LOCK): avoids the SQLite deadlock
        from core.db import open_locked
    except ImportError:   # standalone use (this module's own smoke test)
        open_locked = sqlite3.connect
    conn = open_locked(DB_PATH, timeout=10, isolation_level=None)  # autocommit; we BEGIN explicitly
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    init_tables(conn)
    return conn


def _num(x) -> float | None:
    # Store and hash as float so REAL round-trips hash identically (391035 vs 391035.0).
    if x is None:
        return None
    f = float(x)
    if not math.isfinite(f):  # SQLite stores NaN as NULL -> hash would never verify
        raise ValueError(f"non-finite value {x!r}")
    return f


def _hash(prev_hash: str, row: dict) -> str:
    body = {k: v for k, v in row.items() if k not in ("seq", "hash")}
    payload = prev_hash + json.dumps(body, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


def _build_row(entry: dict) -> dict:
    """Accept either audit-shaped keys or a Decision dict (action/new_value/note)."""
    thread_id, value_id = entry["thread_id"], entry["value_id"]
    decision_id = entry["decision_id"]
    if decision_id != f"{thread_id}:{value_id}":
        raise ValueError(f"decision_id {decision_id!r} != thread_id:value_id")
    decision = entry.get("decision") or ACTION_TO_DECISION.get(entry.get("action"))
    if decision is None:
        raise ValueError(f"no decision/action in entry {decision_id!r}")
    row = {
        "ts": entry.get("ts") or datetime.now().astimezone().isoformat(timespec="seconds"),
        "decision_id": decision_id,
        "thread_id": thread_id,
        "value_id": value_id,
        "metric": entry.get("metric") or value_id.rsplit(":", 1)[-1],  # value_id = accession:metric
        "original_value": _num(entry.get("original_value")),
        "corrected_value": _num(entry.get("corrected_value", entry.get("new_value"))),
        "decision": decision,
        "reviewer": entry.get("reviewer") or "system",
        "reason": entry.get("reason", entry.get("note")),
    }
    # The log is the record of what changed and why; refuse incomplete rows (PS 3.8, FR-11).
    if decision == "corrected" and row["corrected_value"] is None:
        raise ValueError(f"{decision_id}: 'corrected' needs corrected_value/new_value")
    if decision in ("corrected", "rejected") and not row["reason"]:
        raise ValueError(f"{decision_id}: '{decision}' needs reason/note")
    return row


def append(entry: dict) -> dict:
    """Insert one hash-chained row; if decision_id already exists, return the stored row."""
    row = _build_row(entry)
    conn = _connect()
    try:
        conn.execute("BEGIN IMMEDIATE")  # serialize prev_hash read + insert across writers
        existing = conn.execute(
            "SELECT * FROM audit_log WHERE decision_id = ?", (row["decision_id"],)
        ).fetchone()
        if existing:
            conn.execute("COMMIT")
            return dict(existing)
        last = conn.execute("SELECT hash FROM audit_log ORDER BY seq DESC LIMIT 1").fetchone()
        row["prev_hash"] = last["hash"] if last else GENESIS
        row["hash"] = _hash(row["prev_hash"], row)
        cols = ", ".join(row)
        cur = conn.execute(
            f"INSERT INTO audit_log ({cols}) VALUES ({', '.join('?' * len(row))})",
            tuple(row.values()),
        )
        conn.execute("COMMIT")
        return {"seq": cur.lastrowid, **row}
    except Exception:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()


def list_rows(limit: int = 200) -> list[dict]:
    conn = _connect()
    try:
        rows = conn.execute("SELECT * FROM audit_log ORDER BY seq DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def verify_chain() -> dict:
    conn = _connect()
    try:
        rows = [dict(r) for r in conn.execute("SELECT * FROM audit_log ORDER BY seq")]
    finally:
        conn.close()
    prev = GENESIS
    for r in rows:
        if r["prev_hash"] != prev or _hash(prev, r) != r["hash"]:
            return {"ok": False, "rows": len(rows), "broken_at_seq": r["seq"]}
        prev = r["hash"]
    return {"ok": True, "rows": len(rows), "broken_at_seq": None}


def test_tamper_attempt() -> dict:
    """Safely verify that the BEFORE UPDATE SQLite trigger blocks tampering (never writes)."""
    conn = _connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT seq FROM audit_log ORDER BY seq ASC LIMIT 1").fetchone()
        if row is None:
            return {
                "blocked": False,
                "empty": True,
                "seq": None,
                "sql": None,
                "error": "Audit log is empty (no row seq=1 yet). Complete or auto-approve a run first.",
            }
        sql = f"UPDATE audit_log SET decision='tampered' WHERE seq={row['seq']}"
        try:
            conn.execute("UPDATE audit_log SET decision='tampered' WHERE seq = ?", (row["seq"],))
            return {
                "blocked": False,
                "empty": False,
                "seq": row["seq"],
                "sql": sql,
                "error": "Trigger did not block UPDATE!",
            }
        except sqlite3.DatabaseError as e:
            return {
                "blocked": True,
                "empty": False,
                "seq": row["seq"],
                "sql": sql,
                "error": f"{type(e).__name__}: {e}",
            }
    finally:
        try:
            conn.rollback()
        except sqlite3.Error:
            pass
        conn.close()


if __name__ == "__main__":
    import tempfile

    # Smoke test on a throwaway DB: the real audit log can never be cleaned up.
    DB_PATH = Path(tempfile.mkdtemp()) / "audit_smoke.db"
    print(f"[audit] smoke test db: {DB_PATH}")

    tid = "AAPL-2024"
    acc = "0000320193-24-000123"
    append({"decision_id": f"{tid}:{acc}:revenue", "thread_id": tid, "value_id": f"{acc}:revenue",
            "original_value": 391035, "decision": "auto_approved", "reviewer": "system"})
    append({"decision_id": f"{tid}:{acc}:equity", "thread_id": tid, "value_id": f"{acc}:equity",
            "original_value": 56950, "action": "correct", "new_value": 56951,
            "reviewer": "Srujan", "note": "typo in table"})
    first = append({"decision_id": f"{tid}:{acc}:cash", "thread_id": tid, "value_id": f"{acc}:cash",
                    "original_value": 29943, "action": "approve", "reviewer": "Srujan"})

    v = verify_chain()
    print(f"[audit] after 3 appends: {v}")
    assert v == {"ok": True, "rows": 3, "broken_at_seq": None}

    again = append({"decision_id": f"{tid}:{acc}:cash", "thread_id": tid, "value_id": f"{acc}:cash",
                    "original_value": 1, "action": "reject", "reviewer": "someone-else", "note": "x"})
    assert again == first, (again, first)
    assert len(list_rows()) == 3 and verify_chain()["ok"]
    print("[audit] duplicate decision_id -> existing row returned, still 3 rows")

    assert [r["seq"] for r in list_rows()] == [3, 2, 1]
    print("[audit] list_rows newest first: OK")

    for bad in ({"action": "correct", "note": "no new value"},
                {"action": "reject"},
                {"action": "approve", "original_value": float("nan")}):
        try:
            append({"decision_id": f"{tid}:{acc}:bad", "thread_id": tid, "value_id": f"{acc}:bad", **bad})
            raise AssertionError(f"should have been refused: {bad}")
        except ValueError as e:
            print(f"[audit] refused incomplete row: {e}")
    assert len(list_rows()) == 3

    conn = sqlite3.connect(DB_PATH)
    for sql in ("UPDATE audit_log SET decision='approved' WHERE seq=1", "DELETE FROM audit_log WHERE seq=1"):
        try:
            conn.execute(sql)
            raise AssertionError(f"should have failed: {sql}")
        except sqlite3.IntegrityError as e:
            print(f"[audit] {sql.split()[0]} blocked: {e}")
    conn.close()

    # Tamper bypassing the triggers -> chain must break at that seq.
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    conn.executescript("DROP TRIGGER audit_no_update;"
                       "UPDATE audit_log SET corrected_value = 99999 WHERE seq = 2;")
    conn.close()
    v = verify_chain()  # _connect() recreates the trigger
    print(f"[audit] after tampering seq 2 behind the triggers: {v}")
    assert v == {"ok": False, "rows": 3, "broken_at_seq": 2}
    print("[audit] smoke test PASSED")
