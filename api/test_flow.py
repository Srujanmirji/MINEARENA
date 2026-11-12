"""The 5 pause/resume tests (tasks/Zeeshan.md). Run at every checkpoint:

    python -m api.test_flow            # mock fixture only (fast, offline)
    python -m api.test_flow --real     # also runs AAPL from cache and checks source evidence

Starts its own uvicorn on a spare port with a throwaway data folder (AUDITLOOP_DATA_DIR),
so it never touches data/app.db or data/checkpoints.db. Uses the MOCKA fixture rows.
"""
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
PORT = int(os.getenv("TEST_PORT", "8765"))
BASE = f"http://127.0.0.1:{PORT}"
TICKER = "MOCKA"

_results: list[tuple[str, bool]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    _results.append((name, bool(ok)))
    print(f"[test] {'PASS' if ok else 'FAIL'}  {name}{'  - ' + detail if detail else ''}")


def start_server(data_dir: str) -> subprocess.Popen:
    env = {**os.environ, "AUDITLOOP_DATA_DIR": data_dir}
    log = open(Path(data_dir) / "server.log", "a")
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "api.main:app", "--port", str(PORT), "--log-level", "warning"],
        cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT,
    )
    for _ in range(60):
        try:
            if httpx.get(f"{BASE}/health", timeout=2).status_code == 200:
                return proc
        except httpx.HTTPError:
            pass
        if proc.poll() is not None:
            break
        time.sleep(0.5)
    proc.kill()
    raise RuntimeError(f"server did not start; see {Path(data_dir) / 'server.log'}")


def kill_server(proc: subprocess.Popen) -> None:
    proc.kill()          # hard kill, like pulling the plug mid-demo
    proc.wait(timeout=10)


def wait_not_running(c: httpx.Client, thread_id: str, tries: int = 120) -> dict:
    for _ in range(tries):
        run = c.get(f"/runs/{thread_id}").json()
        if run["status"] != "running":
            return run
        time.sleep(0.25)
    raise RuntimeError(f"run still 'running' after {tries / 4:.0f}s")


def count(data_dir: str, sql: str, args: tuple = ()) -> int:
    conn = sqlite3.connect(Path(data_dir) / "app.db")
    try:
        return conn.execute(sql, args).fetchone()[0]
    finally:
        conn.close()


# Keys every response must carry (docs/API.md). Extra keys are allowed; missing ones break the UI.
CONTRACT = {
    "POST /runs": {"thread_id", "status", "created"},
    "GET /runs[]": {"thread_id", "ticker", "status", "n_values", "n_pending", "n_auto", "n_reviewed"},
    "GET /runs/{id}": {"thread_id", "status", "next", "steps_done", "interrupt", "error"},
    "GET /pending[]": {"thread_id", "is_current", "value", "reason"},
    "POST decision": {"status", "next_value_id", "duplicate"},
    "GET /values[]": {"id", "ticker", "metric", "value", "status", "final_value", "confidence", "signals",
                      "validation", "escalation_reason", "row_label", "source_snippet"},
    "GET /validations[]": {"ticker", "check", "severity", "status", "detail"},
    "GET /report": {"overall", "by_metric", "by_company", "decisions", "escalation_precision",
                    "auto_approval_error_rate", "calibration", "rows"},
    "GET /audit[]": {"seq", "ts", "decision_id", "thread_id", "value_id", "metric", "original_value",
                     "corrected_value", "decision", "reviewer", "reason", "prev_hash", "hash"},
    "GET /audit/verify": {"ok", "rows", "broken_at_seq"},
    "GET /config": {"threshold", "yoy_threshold"},
    "GET /health": {"ok", "db", "llm_provider", "paused_runs"},
}


def make_failed_run(data_dir: str, thread_id: str) -> None:
    """Start a run whose first node raises (unknown ticker), straight on the graph, like a crash
    inside a background job. POST /runs refuses unknown tickers, so this goes around it."""
    code = ("from agent.graph import get_graph; from core import db; db.init_db()\n"
            "try:\n"
            f"    get_graph().invoke({{'ticker': 'ZZZZQQ', 'threshold': 0.85}}, "
            f"{{'configurable': {{'thread_id': '{thread_id}'}}}})\n"
            "except Exception as e:\n"
            "    print('[test] graph raised as expected:', type(e).__name__)\n")
    subprocess.run([sys.executable, "-c", code], cwd=ROOT, check=True,
                   env={**os.environ, "AUDITLOOP_DATA_DIR": data_dir})


def contract_checks(c: httpx.Client, samples: dict) -> None:
    """samples: contract name -> one response body (a dict) captured during the flow."""
    live = {
        "GET /runs[]": (c.get("/runs").json() or [{}])[0],
        "GET /values[]": (c.get("/values").json() or [{}])[0],
        "GET /validations[]": (c.get("/validations").json() or [{}])[0],
        "GET /report": c.get("/report").json(),
        "GET /audit[]": (c.get("/audit").json() or [{}])[0],
        "GET /audit/verify": c.get("/audit/verify").json(),
        "GET /config": c.get("/config").json(),
        "GET /health": c.get("/health").json(),
    }
    bodies = {**live, **samples}
    missing = {name: sorted(keys - set(bodies.get(name) or {})) for name, keys in CONTRACT.items()}
    missing = {k: v for k, v in missing.items() if v}
    check("   every response carries the keys docs/API.md promises",
          not missing, "all 12 shapes match" if not missing else f"missing: {missing}")


def real_checks(c: httpx.Client) -> None:
    """AAPL from the committed cache: the run reaches a pause or finishes, and every value with
    a table index returns its source table with the row highlighted."""
    r = c.post("/runs", json={"ticker": "AAPL"}).json()
    tid = r["thread_id"]
    run = wait_not_running(c, tid, tries=1200)
    vals = c.get("/values", params={"thread_id": tid}).json()
    check("   real AAPL run reaches a pause or finishes",
          run["status"] in ("paused", "done") and len(vals) >= 8,
          f"{tid}: {run['status']}, {len(vals)} values, error={run.get('error')}"
          + (f", paused on {run['interrupt']['value']['metric']}: {run['interrupt']['reason']}"
             if run["status"] == "paused" else ""))
    found = 0
    for v in vals:
        if v.get("table_index") is None:
            continue
        s = c.get(f"/runs/{tid}/source/{v['id']}").json()
        found += bool(s.get("row_found") and "class=\"hl\"" in s.get("html", "") and s.get("source_url"))
    with_table = sum(v.get("table_index") is not None for v in vals)
    check("   source evidence highlights the extracted row",
          with_table > 0 and found == with_table, f"{found}/{with_table} rows highlighted")


def main() -> int:
    data_dir = tempfile.mkdtemp(prefix="auditloop-test-")
    print(f"[test] data dir: {data_dir}")
    proc = start_server(data_dir)
    try:
        c = httpx.Client(base_url=BASE, timeout=60)

        # ---- Test 1: run on mock data pauses at the first escalated item
        r = c.post("/runs", json={"ticker": TICKER}).json()
        tid = r["thread_id"]
        run = wait_not_running(c, tid)
        samples = {"POST /runs": r, "GET /runs/{id}": run,
                   "GET /pending[]": (c.get("/pending").json() or [{}])[0]}
        first = (run.get("interrupt") or {}).get("value", {}).get("id")
        queue = [p for p in c.get("/pending").json() if p["thread_id"] == tid]
        check("1. run pauses at the first escalated item",
              r["created"] and run["status"] == "paused" and first is not None
              and queue and queue[0]["is_current"] and queue[0]["value"]["id"] == first
              and sum(p["is_current"] for p in queue) == 1,
              f"{tid} paused on {first}; {len(queue)} in queue; steps {run.get('steps_done')}")
        n_values = count(data_dir, "SELECT COUNT(*) FROM extracted_values")

        again = c.post("/runs", json={"ticker": TICKER}).json()
        check("   POST /runs again does not restart it",
              again == {"thread_id": tid, "status": "paused", "created": False}, str(again))

        # ---- contract errors (must not move the run)
        wrong = c.post(f"/runs/{tid}/decision", json={"value_id": "nope:revenue", "action": "approve"})
        no_value = c.post(f"/runs/{tid}/decision", json={"value_id": first, "action": "correct", "note": "x"})
        no_note = c.post(f"/runs/{tid}/decision", json={"value_id": first, "action": "reject"})
        check("   409 wrong value_id, 422 correct w/o new_value, 422 reject w/o note",
              (wrong.status_code, no_value.status_code, no_note.status_code) == (409, 422, 422),
              f"{wrong.status_code}, {no_value.status_code}, {no_note.status_code}")

        # ---- Test 2: approve -> resumes -> pauses at the next item
        decision = {"value_id": first, "action": "approve", "reviewer": "test"}
        d = c.post(f"/runs/{tid}/decision", json=decision).json()
        samples["POST decision"] = d
        second = d.get("next_value_id")
        run = c.get(f"/runs/{tid}").json()
        check("2. approve resumes and pauses at the next item",
              d["status"] == "paused" and d["duplicate"] is False and second not in (None, first)
              and run["interrupt"]["value"]["id"] == second,
              f"next is {second}")

        # ---- Test 3: kill uvicorn while paused, restart, same paused item
        kill_server(proc)
        proc = start_server(data_dir)
        run = c.get(f"/runs/{tid}").json()
        health = c.get("/health").json()
        listed = {r["thread_id"]: r for r in c.get("/runs").json()}
        check("3. kill + restart shows the same paused item",
              run["status"] == "paused" and run["interrupt"]["value"]["id"] == second
              and health["paused_runs"] >= 1 and listed.get(tid, {}).get("status") == "paused",
              f"paused on {run.get('interrupt', {}).get('value', {}).get('id')}, "
              f"paused_runs={health['paused_runs']}, GET /runs lists it as {listed.get(tid, {}).get('status')}")

        # ---- Test 4: same decision twice -> one decision row, one audit row, duplicate: true
        dup = c.post(f"/runs/{tid}/decision", json=decision).json()
        did = f"{tid}:{first}"
        n_dec = count(data_dir, "SELECT COUNT(*) FROM review_decisions WHERE decision_id=?", (did,))
        n_aud = count(data_dir, "SELECT COUNT(*) FROM audit_log WHERE decision_id=?", (did,))
        still = c.get(f"/runs/{tid}").json()["interrupt"]["value"]["id"]
        check("4. duplicate decision is a no-op",
              dup["duplicate"] is True and n_dec == 1 and n_aud == 1 and still == second,
              f"duplicate={dup['duplicate']}, review_decisions={n_dec}, audit_log={n_aud}")

        # ---- Test 5: extracted_values row count unchanged after resume
        n_after = count(data_dir, "SELECT COUNT(*) FROM extracted_values")
        check("5. extracted_values row count unchanged after resume",
              n_after == n_values and n_values > 0, f"{n_values} before, {n_after} after")

        # ---- hardening endpoints
        runs = {r["thread_id"]: r for r in c.get("/runs").json()}
        r = runs.get(tid, {})
        check("   GET /runs counts values, pending, auto, reviewed",
              r.get("n_values") == n_values and r.get("n_pending", 0) >= 1 and r.get("n_reviewed") == 1
              and r.get("n_auto", -1) >= 0 and r.get("n_pending") + r.get("n_auto") + r.get("n_reviewed") == n_values,
              str({k: r.get(k) for k in ("status", "n_values", "n_pending", "n_auto", "n_reviewed")}))

        vals = c.get("/values", params={"ticker": TICKER}).json()
        check("   GET /values?ticker returns every value with scores",
              len(vals) == n_values and all("confidence" in v and "validation" in v for v in vals),
              f"{len(vals)} values")

        checks = c.get("/validations", params={"ticker": TICKER}).json()
        failed = [x for x in checks if x["status"] == "failed"]
        check("   GET /validations lists checks, each filing-wide check once",
              len(checks) > 0 and len(failed) >= 1
              and len({(x["thread_id"], x["check"], x["detail"]) for x in checks}) == len(checks),
              f"{len(checks)} checks, {len(failed)} failed")

        before = c.get("/config").json()
        put = c.put("/config", json={"threshold": 0.9}).json()
        bad = c.put("/config", json={"threshold": 1.5})
        c.put("/config", json={"threshold": before["threshold"]})
        check("   GET/PUT /config round-trips and rejects bad values",
              put["threshold"] == 0.9 and bad.status_code == 422
              and c.get("/config").json()["threshold"] == before["threshold"],
              f"{before['threshold']} -> 0.9 -> {before['threshold']}, bad PUT {bad.status_code}")

        audit = c.get("/audit", params={"limit": 500}).json()
        chain = c.get("/audit/verify").json()
        check("   GET /audit newest first; /audit/verify ok",
              audit and audit[0]["seq"] == max(a["seq"] for a in audit) and chain["ok"] is True
              and chain["rows"] == len(audit),
              f"{len(audit)} rows, chain {chain}")

        src = c.get(f"/runs/{tid}/source/{first}")
        check("   source evidence: clean 404 for fixture values (no table)",
              src.status_code == 404, f"{src.status_code} {src.json().get('detail')}")

        # ---- finish the run: correct one, reject one, approve the rest
        current, i = second, 0
        while current:
            body = [{"action": "correct", "new_value": 123.0, "note": "test correction"},
                    {"action": "reject", "note": "test rejection"}][i] if i < 2 else {"action": "approve"}
            d = c.post(f"/runs/{tid}/decision", json={"value_id": current, "reviewer": "test", **body}).json()
            current, i = d.get("next_value_id"), i + 1
        run = c.get(f"/runs/{tid}").json()
        n_aud = count(data_dir, "SELECT COUNT(*) FROM audit_log WHERE thread_id=?", (tid,))
        undecided = count(data_dir, "SELECT COUNT(*) FROM extracted_values WHERE thread_id=? "
                                    "AND status IN ('extracted','escalated')", (tid,))
        check("   run finishes: every value decided, one audit row each",
              run["status"] == "done" and run["next"] == [] and undecided == 0 and n_aud == n_values,
              f"status={run['status']}, undecided={undecided}, audit rows={n_aud}/{n_values}")
        after_done = c.post(f"/runs/{tid}/decision", json={"value_id": "nope:cash", "action": "approve"})
        check("   409 when the run is not paused", after_done.status_code == 409, str(after_done.status_code))

        # ---- report + CSV
        rep = c.get("/report", params={"thread_id": tid}).json()
        dec = rep["decisions"]
        check("   GET /report?thread_id counts this run's decisions",
              len(rep["rows"]) == n_values and dec["pending"] == 0
              and dec["auto_approved"] + dec["reviewed"] == n_values,
              f"{dec}, accuracy {rep['overall']['accuracy']} (fixtures have no XBRL ground truth)")
        csv_resp = c.get("/report.csv", params={"thread_id": tid})
        lines = csv_resp.text.strip().splitlines()
        check("   GET /report.csv downloads one row per value",
              csv_resp.status_code == 200 and csv_resp.headers["content-type"].startswith("text/csv")
              and "attachment" in csv_resp.headers.get("content-disposition", "")
              and lines[0].startswith("value_id,") and len(lines) == n_values + 1,
              f"{len(lines) - 1} rows, header: {lines[0][:60]}...")
        unknown = c.get("/report", params={"thread_id": "nope-1999"}).status_code
        check("   GET /report 404 for an unknown run", unknown == 404, str(unknown))

        # ---- force re-run: new thread id, original untouched
        forced = c.post("/runs", json={"ticker": TICKER, "force": True}).json()
        forced_run = wait_not_running(c, forced["thread_id"])
        again = c.post("/runs", json={"ticker": TICKER}).json()
        check("   POST /runs force:true starts a new thread; plain POST still returns the original",
              forced["created"] is True and forced["thread_id"] == f"{tid}-r2"
              and forced_run["status"] == "paused" and again["thread_id"] == tid and again["created"] is False,
              f"{forced['thread_id']} {forced_run['status']}; plain POST -> {again['thread_id']} ({again['status']})")

        contract_checks(c, samples)

        # ---- a run that crashes inside the graph: status=error with the message, also after restart
        bad_tid = "ZZZZQQ-1"
        kill_server(proc)
        make_failed_run(data_dir, bad_tid)
        proc = start_server(data_dir)
        bad = c.get(f"/runs/{bad_tid}").json()
        listed = {r["thread_id"]: r for r in c.get("/runs").json()}.get(bad_tid, {})
        healthy = c.get("/health").status_code == 200 and c.get(f"/runs/{tid}").json()["status"] == "done"
        check("   a crashed run shows status=error with its message after restart; API stays up",
              bad.get("status") == "error" and "fetch_filing failed" in (bad.get("error") or "")
              and listed.get("status") == "error" and healthy,
              f"{bad.get('status')}: {(bad.get('error') or '')[:70]}")

        if "--real" in sys.argv:
            real_checks(c)
    finally:
        kill_server(proc)
        for _ in range(10):   # Windows keeps the SQLite files locked for a moment after a kill
            shutil.rmtree(data_dir, ignore_errors=True)
            if not Path(data_dir).exists():
                break
            time.sleep(0.5)

    failed = [n for n, ok in _results if not ok]
    print(f"[test] {len(_results) - len(failed)}/{len(_results)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
