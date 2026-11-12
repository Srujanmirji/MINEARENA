"""data/app.db helpers. Every write is keyed and idempotent (CLAUDE.md rule 5).

audit_log is NOT created here: Srujan's audit.log.init_tables() owns it.
"""
import json
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from typing import Any

from core import config
from core.models import ExtractedValue

SCHEMA = """
CREATE TABLE IF NOT EXISTS filings (
  accession         TEXT PRIMARY KEY,
  ticker            TEXT NOT NULL,
  cik               TEXT NOT NULL,
  company           TEXT,
  fiscal_year       INTEGER NOT NULL,
  period_end        TEXT NOT NULL,
  primary_document  TEXT NOT NULL,
  tables_json       TEXT,
  fetched_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS extracted_values (
  id                TEXT PRIMARY KEY,
  thread_id         TEXT NOT NULL,
  ticker            TEXT NOT NULL,
  accession         TEXT NOT NULL,
  metric            TEXT NOT NULL,
  value             REAL,
  scale             INTEGER NOT NULL DEFAULT 1,
  unit              TEXT NOT NULL DEFAULT 'USD',
  period_start      TEXT,
  period_end        TEXT NOT NULL,
  prior_value       REAL,
  extractor         TEXT,
  alt_value         REAL,
  source_page       TEXT,
  table_index       INTEGER,
  row_label         TEXT,
  source_snippet    TEXT,
  confidence        REAL NOT NULL DEFAULT 0,
  signals_json      TEXT NOT NULL DEFAULT '{}',
  validation_json   TEXT NOT NULL DEFAULT '[]',
  status            TEXT NOT NULL DEFAULT 'extracted',
  escalation_reason TEXT,
  final_value       REAL,
  is_derived        INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_decisions (
  decision_id  TEXT PRIMARY KEY,
  thread_id    TEXT NOT NULL,
  value_id     TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('approve','correct','reject')),
  new_value    REAL,
  reviewer     TEXT NOT NULL,
  note         TEXT,
  ts           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verification (
  value_id     TEXT PRIMARY KEY,
  xbrl_tag     TEXT,
  xbrl_value   REAL,
  our_value    REAL,
  orig_value   REAL,
  match        INTEGER,
  orig_match   INTEGER,
  abs_error    REAL,
  verified_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run_reports (
  thread_id    TEXT PRIMARY KEY,
  report_json  TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
"""

CONFIG_SEEDS = {
    "threshold": config.THRESHOLD,
    "yoy_threshold": config.YOY_THRESHOLD,
    "equation_tolerance": config.EQUATION_TOLERANCE,
}

HUMAN_FINAL = ("approved", "corrected", "rejected")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.APP_DB, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with closing(connect()) as conn:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.executescript(SCHEMA)
        with conn:
            conn.executemany(
                "INSERT OR IGNORE INTO config(key, value) VALUES (?, ?)",
                [(k, str(v)) for k, v in CONFIG_SEEDS.items()],
            )
        try:
            import audit.log as audit_log
        except ImportError:
            print("[db] WARNING: audit.log.init_tables not available yet; audit_log table not created")
        else:
            audit_log.DB_PATH = config.APP_DB   # audit rows live in the same file as everything else
            audit_log.init_tables(conn)
            conn.commit()
    print(f"[db] init_db ok: {config.APP_DB}")


# ---------- filings ----------

def upsert_filing(meta: dict, tables: dict | None = None) -> None:
    """Keyed on accession. Re-running only refreshes tables_json."""
    tables_json = json.dumps({k: v.get("index") for k, v in (tables or {}).items()})
    with closing(connect()) as conn, conn:
        conn.execute(
            """INSERT INTO filings(accession, ticker, cik, company, fiscal_year, period_end,
                                   primary_document, tables_json, fetched_at)
               VALUES (?,?,?,?,?,?,?,?,?)
               ON CONFLICT(accession) DO UPDATE SET
                 tables_json = COALESCE(excluded.tables_json, filings.tables_json)""",
            (meta["accession"], meta["ticker"], meta["cik"], meta.get("company"),
             meta["fiscal_year"], meta["period_end"], meta.get("primary_document", ""),
             tables_json, _now()),
        )


# ---------- extracted_values ----------

def _as_dict(v: ExtractedValue | dict) -> dict:
    return v.model_dump() if isinstance(v, ExtractedValue) else dict(v)


def upsert_values(values: list[ExtractedValue | dict], thread_id: str | None = None) -> None:
    """INSERT OR IGNORE on id (accession:metric). thread_id defaults to f"{ticker}-{fiscal_year}"."""
    rows = []
    for raw in values:
        v = _as_dict(raw)
        tid = thread_id or f"{v['ticker']}-{v['fiscal_year']}"
        rows.append((
            v["id"], tid, v["ticker"], v["accession"], v["metric"], v.get("value"),
            v.get("scale", 1), v.get("unit", "USD"), v.get("period_start"), v["period_end"],
            v.get("prior_value"), v.get("extractor"), v.get("alt_value"), v.get("source_page"),
            v.get("table_index"), v.get("row_label"), v.get("source_snippet"),
            v.get("confidence", 0.0), json.dumps(v.get("signals") or {}),
            json.dumps(v.get("validation") or []), v.get("status", "extracted"),
            v.get("escalation_reason"), v.get("final_value"), int(bool(v.get("is_derived"))), _now(),
        ))
    with closing(connect()) as conn, conn:
        conn.executemany(
            f"INSERT OR IGNORE INTO extracted_values VALUES ({','.join('?' * 25)})", rows
        )


def update_scored(values: list[ExtractedValue | dict]) -> None:
    """Persist scoring/routing results, keyed by id. Never overwrites a human decision."""
    rows = []
    for raw in values:
        v = _as_dict(raw)
        rows.append((
            v.get("confidence", 0.0), json.dumps(v.get("signals") or {}),
            json.dumps(v.get("validation") or []), v.get("status", "extracted"),
            v.get("escalation_reason"), _now(), v["id"],
        ))
    with closing(connect()) as conn, conn:
        conn.executemany(
            f"""UPDATE extracted_values
                SET confidence=?, signals_json=?, validation_json=?, status=?,
                    escalation_reason=?, updated_at=?
                WHERE id=? AND status NOT IN {HUMAN_FINAL}""",
            rows,
        )


def set_status(value_id: str, status: str, final_value: float | None, reason: str | None = None) -> None:
    with closing(connect()) as conn, conn:
        conn.execute(
            """UPDATE extracted_values
               SET status=?, final_value=?, escalation_reason=COALESCE(?, escalation_reason), updated_at=?
               WHERE id=?""",
            (status, final_value, reason, _now(), value_id),
        )


def _row_to_value(r: sqlite3.Row) -> dict:
    d = dict(r)
    d["signals"] = json.loads(d.pop("signals_json") or "{}")
    d["validation"] = json.loads(d.pop("validation_json") or "[]")
    d["is_derived"] = bool(d["is_derived"])
    return d


def get_values(thread_id: str | None = None, ticker: str | None = None) -> list[dict]:
    """Values as dicts shaped like ExtractedValue (+ thread_id, updated_at). Joins filings for company/cik/fiscal_year."""
    sql = """SELECT ev.*, f.company, f.cik, f.fiscal_year
             FROM extracted_values ev LEFT JOIN filings f ON f.accession = ev.accession"""
    where, args = [], []
    if thread_id:
        where.append("ev.thread_id = ?"); args.append(thread_id)
    if ticker:
        where.append("ev.ticker = ?"); args.append(ticker.upper())
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY ev.thread_id, ev.id"
    with closing(connect()) as conn:
        return [_row_to_value(r) for r in conn.execute(sql, args)]


def get_value(value_id: str) -> dict | None:
    rows = [v for v in get_values() if v["id"] == value_id]
    return rows[0] if rows else None


def get_filing(accession: str) -> dict | None:
    with closing(connect()) as conn:
        row = conn.execute("SELECT * FROM filings WHERE accession=?", (accession,)).fetchone()
        return dict(row) if row else None


def list_thread_ids() -> list[str]:
    with closing(connect()) as conn:
        return [r[0] for r in conn.execute("SELECT DISTINCT thread_id FROM extracted_values ORDER BY thread_id")]


# ---------- review_decisions ----------

def record_decision(d: dict) -> bool:
    """INSERT OR IGNORE on decision_id. Returns False if this decision_id already exists."""
    with closing(connect()) as conn, conn:
        cur = conn.execute(
            """INSERT OR IGNORE INTO review_decisions
               (decision_id, thread_id, value_id, action, new_value, reviewer, note, ts)
               VALUES (?,?,?,?,?,?,?,?)""",
            (d["decision_id"], d["thread_id"], d["value_id"], d["action"], d.get("new_value"),
             d.get("reviewer") or "reviewer", d.get("note"), _now()),
        )
        return cur.rowcount == 1


def get_decision(decision_id: str) -> dict | None:
    with closing(connect()) as conn:
        row = conn.execute("SELECT * FROM review_decisions WHERE decision_id=?", (decision_id,)).fetchone()
        return dict(row) if row else None


def decision_exists(decision_id: str) -> bool:
    with closing(connect()) as conn:
        return conn.execute(
            "SELECT 1 FROM review_decisions WHERE decision_id=?", (decision_id,)
        ).fetchone() is not None


# ---------- run_reports ----------

def save_report(thread_id: str, report: dict) -> None:
    """Keyed on thread_id; a replayed report node overwrites with the same content."""
    with closing(connect()) as conn, conn:
        conn.execute(
            "INSERT OR REPLACE INTO run_reports(thread_id, report_json, created_at) VALUES (?,?,?)",
            (thread_id, json.dumps(report, default=str), _now()),
        )


# ---------- config ----------

def _parse(raw: str) -> Any:
    try:
        return float(raw)
    except ValueError:
        return raw


def get_config(key: str | None = None, default: Any = None) -> Any:
    """get_config() -> all keys as a dict; get_config("threshold") -> one value."""
    with closing(connect()) as conn:
        if key is None:
            return {r["key"]: _parse(r["value"]) for r in conn.execute("SELECT key, value FROM config")}
        row = conn.execute("SELECT value FROM config WHERE key=?", (key,)).fetchone()
        return default if row is None else _parse(row["value"])


def set_config(key: str, value: Any) -> None:
    with closing(connect()) as conn, conn:
        conn.execute(
            "INSERT INTO config(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, str(value)),
        )


if __name__ == "__main__":
    init_db()
    print(f"[db] threads: {list_thread_ids()}")
    print(f"[db] config: {get_config()}")
