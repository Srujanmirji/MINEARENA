"""Reliability proof + headline numbers (tasks/Srujan.md 2:40 AM block). One command:

    python -m verify.run_all            # 2 full runs of all 5 companies, each from a clean DB
    python -m verify.run_all --runs 1   # just the numbers

Each run is a fresh process with its own throwaway data folder (AUDITLOOP_DATA_DIR), so data/app.db
and the demo state are never touched. Every pause is approved unchanged, like the PS-required
"auto-approve everything that pauses" proof. Prints crashes, run-to-run identity, wrong
auto-approvals, the report numbers, the mismatch list, and the one-line slide claim.
"""
import json
import os
import subprocess
import sys
import tempfile
import traceback
from pathlib import Path

SUMMARY = "run_summary.json"


def _child() -> None:
    """One full run in this process; config already points at AUDITLOOP_DATA_DIR."""
    from langgraph.types import Command

    from agent.graph import get_graph
    from core import config, db
    from verify.report import build_report

    db.init_db()
    graph = get_graph()
    crashes = []
    for ticker in config.TICKERS:
        cfg = {"configurable": {"thread_id": f"{ticker}-proof"}}
        try:
            graph.invoke({"ticker": ticker, "threshold": config.THRESHOLD}, cfg)
            while graph.get_state(cfg).next:
                st = graph.get_state(cfg).values
                graph.invoke(Command(resume={"value_id": st["pending"][0], "action": "approve",
                                             "reviewer": "run_all"}), cfg)
        except Exception:
            crashes.append({"ticker": ticker, "error": traceback.format_exc(limit=3)})
            print(f"[run_all] CRASH {ticker}", file=sys.stderr)
    values = {v["id"]: [v["value"], v["alt_value"], v["confidence"], v["status"]] for v in db.get_values()}
    summary = {"crashes": crashes, "values": values, "report": build_report()}
    (config.DATA_DIR / SUMMARY).write_text(json.dumps(summary, default=str))


def _run_once(i: int) -> dict:
    data_dir = Path(tempfile.mkdtemp(prefix=f"auditloop-proof{i}-"))
    print(f"[run_all] run {i}: {data_dir}")
    env = {**os.environ, "AUDITLOOP_DATA_DIR": str(data_dir)}
    proc = subprocess.run([sys.executable, "-m", "verify.run_all", "--child"], env=env,
                          capture_output=True, text=True)
    out = data_dir / SUMMARY
    if proc.returncode != 0 or not out.exists():
        print(proc.stderr[-2000:], file=sys.stderr)
        return {"crashes": [{"ticker": "*", "error": f"run process exited {proc.returncode}"}],
                "values": {}, "report": None}
    return json.loads(out.read_text())


def _print_run(i: int, s: dict) -> int:
    rep = s["report"] or {}
    rows = rep.get("rows", [])
    wrong_auto = [r for r in rows if r["status"] == "auto_approved" and r["match"] is False]
    o, d = rep.get("overall", {}), rep.get("decisions", {})
    print(f"\n== run {i}: {len(s['values'])} values, {len(s['crashes'])} crashes")
    for c in s["crashes"]:
        print(f"   crash {c['ticker']}: {c['error'].strip().splitlines()[-1]}")
    print(f"   accuracy {o.get('accuracy')} ({o.get('correct')}/{o.get('verifiable')}), "
          f"pre-review {o.get('pre_review_accuracy')}, no ground truth {o.get('no_ground_truth')}")
    print(f"   auto-approved {d.get('auto_approved')}, escalated {d.get('escalated')}, "
          f"wrong auto-approvals {len(wrong_auto)}, escalation precision {rep.get('escalation_precision')}")
    print(f"   by company: { {k: v['accuracy'] for k, v in rep.get('by_company', {}).items()} }")
    print(f"   calibration: {[(b['band'], b['n'], b['accuracy']) for b in rep.get('calibration', [])]}")
    return len(wrong_auto)


def main(runs: int) -> None:
    results = [_run_once(i + 1) for i in range(runs)]
    wrong = [_print_run(i + 1, s) for i, s in enumerate(results)]

    last = (results[-1]["report"] or {}).get("rows", [])
    print("\n== mismatches (send row labels to Mayur, not XBRL numbers, until the run is graded)")
    for r in last:
        if r["match"] is False or r["orig_match"] is False:
            print(f"   {r['ticker']:5} {r['metric']:20} ours={r['orig_value']} xbrl={r['xbrl_value']} status={r['status']}")

    crashes = sum(len(s["crashes"]) for s in results)
    identical = all(s["values"] == results[0]["values"] and s["values"] for s in results)
    companies = len((results[-1]["report"] or {}).get("by_company", {}))
    print(f"\n== slide: \"{companies} companies, {runs} full runs, {crashes} crashes, "
          f"{'identical' if identical else 'DIFFERENT'} results, {max(wrong)} wrong auto-approvals\"")
    if crashes or not identical or max(wrong):
        sys.exit(1)


if __name__ == "__main__":
    if "--child" in sys.argv:
        _child()
    else:
        n = int(sys.argv[sys.argv.index("--runs") + 1]) if "--runs" in sys.argv else 2
        main(n)
