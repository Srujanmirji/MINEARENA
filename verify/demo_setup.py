"""Build the judging demo state in data/ (docs/DEMO.md "Before judges arrive").

    python -m verify.demo_setup            # refuses if data/app.db already has runs
    python -m verify.demo_setup --reset    # moves the old data/*.db to data/backup-<time>/ first

Result: AAPL, MSFT, NVDA run to completion (every pause approved by the reviewer below and
graded against XBRL); WMT paused on its first escalated value with its queue intact (for the
Correct + Reject moments); TSLA not run (Sai clicks Run TSLA live). Stop the API first.
Thread ids match the API's: f"{ticker}-{fiscal_year}".
"""
import shutil
import sys
from datetime import datetime

from core import config

DONE = ["AAPL", "MSFT", "NVDA"]
PAUSED = "WMT"
REVIEWER = "Srujan"
DB_FILES = ["app.db", "app.db-wal", "app.db-shm", "checkpoints.db", "checkpoints.db-wal", "checkpoints.db-shm"]


def _move_old_data() -> None:
    existing = [f for f in DB_FILES if (config.DATA_DIR / f).exists()]
    if not existing:
        return
    if "--reset" not in sys.argv:
        sys.exit(f"[demo_setup] {config.DATA_DIR} already has {existing}. Re-run with --reset "
                 "(they are moved to a backup folder, not deleted).")
    backup = config.DATA_DIR / f"backup-{datetime.now():%Y%m%d-%H%M%S}"
    backup.mkdir()
    for f in existing:
        shutil.move(str(config.DATA_DIR / f), backup / f)
    print(f"[demo_setup] moved {existing} to {backup}")


def main() -> None:
    _move_old_data()
    from langgraph.types import Command

    from agent.graph import get_graph
    from agent.nodes import resolve_filing
    from core import db
    from verify.report import build_report

    db.init_db()
    graph = get_graph()
    for ticker in DONE + [PAUSED]:
        tid = f"{ticker}-{resolve_filing(ticker)['fiscal_year']}"
        cfg = {"configurable": {"thread_id": tid}}
        graph.invoke({"ticker": ticker, "threshold": config.THRESHOLD}, cfg)
        if ticker == PAUSED:
            pending = graph.get_state(cfg).values.get("pending", [])
            print(f"[demo_setup] {tid}: paused with {len(pending)} waiting: {[p.split(':')[1] for p in pending]}")
            continue
        n = 0
        while graph.get_state(cfg).next:
            vid = graph.get_state(cfg).values["pending"][0]
            graph.invoke(Command(resume={"value_id": vid, "action": "approve", "reviewer": REVIEWER}), cfg)
            n += 1
        print(f"[demo_setup] {tid}: done, {n} reviewed")

    rep = build_report()
    o, d = rep["overall"], rep["decisions"]
    print(f"[demo_setup] report: accuracy {o['correct']}/{o['verifiable']}, {d['auto_approved']} auto-approved, "
          f"{d['escalated']} escalated, {d['pending']} pending, precision {rep['escalation_precision']}")
    print("[demo_setup] ready. Start the API and the React app; TSLA is left for the live run.")


if __name__ == "__main__":
    main()
