"""Accuracy report (PS 3.8, PRD FR-10 + §10). Shape = `GET /report` in docs/API.md.

Read-only: every number is recomputed from app.db (extracted_values + verification), so judges
can re-derive it. The graph's report node saves the result to run_reports.
"""
from contextlib import closing

from core import db
from scoring.validation import YOY

HUMAN_FINAL = ("approved", "corrected", "rejected")
ESCALATED = ("escalated",) + HUMAN_FINAL  # a reviewed value was escalated first; its status moved on
BANDS = (("<0.6", 0.0, 0.6), ("0.6-0.85", 0.6, 0.85), (">0.85", 0.85, 1.01))  # 0.85 itself auto-approves


def _ratio(num: int, den: int) -> float | None:
    return round(num / den, 3) if den else None


def _accuracy(rows: list[dict], key: str = "match") -> dict:
    verifiable = [r for r in rows if r[key] is not None]
    correct = sum(r[key] == 1 for r in verifiable)
    return {"verifiable": len(verifiable), "correct": correct, "accuracy": _ratio(correct, len(verifiable))}


def _group(rows: list[dict], field: str) -> dict:
    return {k: _accuracy([r for r in rows if r[field] == k]) for k in sorted({r[field] for r in rows})}


def _yoy_failed(r: dict) -> bool:
    return any(c["check"] == YOY and c["status"] == "failed" for c in r["validation"])


def _band(rows: list[dict], name: str, lo: float, hi: float) -> dict:
    # Calibration grades the score against what it scored: the value as extracted (orig_match).
    acc = _accuracy([r for r in rows if lo <= r["confidence"] < hi], "orig_match")
    return {"band": name, "n": acc["verifiable"], "accuracy": acc["accuracy"]}


def _load_rows(thread_id: str | None) -> list[dict]:
    with closing(db.connect()) as conn:
        checks = {r["value_id"]: dict(r) for r in conn.execute("SELECT * FROM verification")}
    rows = []
    for v in db.get_values(thread_id=thread_id):
        c = checks.get(v["id"], {})
        rows.append({
            "value_id": v["id"], "thread_id": v["thread_id"], "ticker": v["ticker"], "metric": v["metric"],
            "status": v["status"], "confidence": v["confidence"], "escalation_reason": v["escalation_reason"],
            "orig_value": c.get("orig_value"), "our_value": c.get("our_value"),
            "xbrl_tag": c.get("xbrl_tag"), "xbrl_value": c.get("xbrl_value"), "abs_error": c.get("abs_error"),
            "match": c.get("match"), "orig_match": c.get("orig_match"),
            "validation": v["validation"],
        })
    return rows


def build_report(thread_id: str | None = None) -> dict:
    """thread_id=None -> all runs (the 5-company headline numbers)."""
    rows = _load_rows(thread_id)
    final = _accuracy(rows)
    escalated = [r for r in rows if r["status"] in ESCALATED]
    auto = [r for r in rows if r["status"] == "auto_approved"]
    # PRD §10: genuine = wrong before review (orig_match == 0) or a YoY anomaly. Missing GT counts as not genuine.
    genuine = [r for r in escalated if r["orig_match"] == 0 or _yoy_failed(r)]
    return {
        "thread_id": thread_id,
        "overall": {
            **final,
            "pre_review_accuracy": _accuracy(rows, "orig_match")["accuracy"],
            "no_ground_truth": sum(r["match"] is None for r in rows),
        },
        "by_metric": _group(rows, "metric"),
        "by_company": _group(rows, "ticker"),
        "decisions": {
            "auto_approved": len(auto),
            "escalated": len(escalated),
            "reviewed": sum(r["status"] in HUMAN_FINAL for r in rows),
            "pending": sum(r["status"] == "escalated" for r in rows),
        },
        "escalation_precision": _ratio(len(genuine), len(escalated)),
        "auto_approval_error_rate": _ratio(sum(r["match"] == 0 for r in auto), len(auto)),
        "calibration": [_band(rows, name, lo, hi) for name, lo, hi in BANDS],
        "rows": [{**{k: x for k, x in r.items() if k != "validation"},
                  "match": None if r["match"] is None else bool(r["match"]),
                  "orig_match": None if r["orig_match"] is None else bool(r["orig_match"]),
                  "yoy_anomaly": _yoy_failed(r)} for r in rows],
    }


if __name__ == "__main__":
    import json
    import tempfile
    from pathlib import Path

    from core import config
    from verify.xbrl import save_rows

    config.APP_DB = Path(tempfile.mkdtemp()) / "report_smoke.db"  # keep test rows out of data/app.db
    db.init_db()

    YOY_FAIL = [{"check": YOY, "severity": "soft", "status": "failed", "detail": "+120% vs prior"}]
    # (n, ticker, status, confidence, match, orig_match, validation) -- every expected number below is
    # worked out by hand from this table.
    cases = [
        (1, "T1", "auto_approved", 0.95, 1, 1, []),
        (2, "T1", "auto_approved", 0.90, 0, 0, []),            # auto-approval error
        (3, "T1", "auto_approved", 0.92, None, None, []),      # no ground truth
        (4, "T1", "corrected", 0.55, 1, 0, []),                # genuine: extraction error, fixed
        (5, "T2", "approved", 0.70, 1, 1, YOY_FAIL),           # genuine: YoY anomaly
        (6, "T2", "approved", 0.80, 1, 1, []),                 # false alarm
        (7, "T2", "escalated", 0.00, None, None, []),          # pending, missing value, no GT
        (8, "T2", "rejected", 0.65, 0, 0, []),                 # genuine: wrong, rejected
    ]
    db.upsert_values([
        {"id": f"acc:m{n}", "ticker": t, "accession": "acc", "metric": f"m{n}", "value": 1.0,
         "period_end": "2024-12-31", "status": st, "confidence": c, "validation": val, "fiscal_year": 2024}
        for n, t, st, c, _, _, val in cases
    ], thread_id="TEST-2024")
    save_rows([
        {"value_id": f"acc:m{n}", "xbrl_tag": None, "xbrl_value": None, "our_value": None, "orig_value": None,
         "match": m, "orig_match": om, "abs_error": None, "verified_at": "2024-01-01"}
        for n, _, _, _, m, om, _ in cases
    ])

    rep = build_report("TEST-2024")
    print(json.dumps({k: x for k, x in rep.items() if k not in ("rows", "by_metric")}, indent=1))

    assert rep["overall"] == {"verifiable": 6, "correct": 4, "accuracy": 0.667,
                              "pre_review_accuracy": 0.5, "no_ground_truth": 2}, rep["overall"]
    assert rep["decisions"] == {"auto_approved": 3, "escalated": 5, "reviewed": 4, "pending": 1}
    assert rep["escalation_precision"] == 0.6           # rows 4, 5, 8 of 5 escalated
    assert rep["auto_approval_error_rate"] == 0.333     # row 2 of 3 auto-approved
    assert rep["calibration"] == [{"band": "<0.6", "n": 1, "accuracy": 0.0},
                                  {"band": "0.6-0.85", "n": 3, "accuracy": 0.667},
                                  {"band": ">0.85", "n": 2, "accuracy": 0.5}], rep["calibration"]
    assert rep["by_company"] == {"T1": {"verifiable": 3, "correct": 2, "accuracy": 0.667},
                                 "T2": {"verifiable": 3, "correct": 2, "accuracy": 0.667}}
    assert len(rep["rows"]) == 8 and rep["rows"][4]["yoy_anomaly"] is True
    assert build_report("no-such-thread")["overall"]["accuracy"] is None   # empty run: no ZeroDivisionError
    assert build_report() == {**rep, "thread_id": None}                    # all threads = this one thread
    print("[report] smoke test OK")
