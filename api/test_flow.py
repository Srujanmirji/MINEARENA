"""The 5 pause/resume tests (tasks/Zeeshan.md). Run at every checkpoint:

    python -m api.test_flow

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


def wait_not_running(c: httpx.Client, thread_id: str) -> dict:
    for _ in range(120):
        run = c.get(f"/runs/{thread_id}").json()
        if run["status"] != "running":
            return run
        time.sleep(0.25)
    raise RuntimeError("run still 'running' after 30s")


def count(data_dir: str, sql: str, args: tuple = ()) -> int:
    conn = sqlite3.connect(Path(data_dir) / "app.db")
    try:
        return conn.execute(sql, args).fetchone()[0]
    finally:
        conn.close()


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
        check("3. kill + restart shows the same paused item",
              run["status"] == "paused" and run["interrupt"]["value"]["id"] == second
              and health["paused_runs"] >= 1,
              f"paused on {run.get('interrupt', {}).get('value', {}).get('id')}, paused_runs={health['paused_runs']}")

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
    finally:
        kill_server(proc)
        shutil.rmtree(data_dir, ignore_errors=True)

    failed = [n for n, ok in _results if not ok]
    print(f"[test] {len(_results) - len(failed)}/{len(_results)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
