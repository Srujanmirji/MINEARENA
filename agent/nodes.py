"""The 11 graph nodes (ARCHITECTURE §3).

Other people's modules are imported inside try/except ImportError. Until they land,
stubs read data/mock_values.json so the graph can pause/resume end to end.

Rules (CLAUDE.md 4, 5):
- human_review has NO side effects and no try/except around interrupt().
- Every write is keyed: extracted_values.id, decision_id = f"{thread_id}:{value_id}".
"""
import json

from langchain_core.runnables import RunnableConfig
from langgraph.types import interrupt

from agent.state import AuditState
from core import config as settings, db
from core.models import ExtractedValue

# ---------- optional imports (owned by Mayur / Srujan) ----------

try:
    from edgar.client import get_cik, get_latest_10k, get_primary_doc
    HAVE_EDGAR = True
except ImportError:
    HAVE_EDGAR = False

try:
    from extract.clean import strip_ixbrl
    from extract.locate import locate_statements
    HAVE_LOCATE = True
except ImportError:
    HAVE_LOCATE = False

try:
    from extract.extractor import extract_filing
    HAVE_EXTRACT = True
except ImportError:
    HAVE_EXTRACT = False

try:
    from scoring.validation import validate_filing
    HAVE_VALIDATION = True
except ImportError:
    HAVE_VALIDATION = False

try:
    from scoring.confidence import score_values
    HAVE_CONFIDENCE = True
except ImportError:
    HAVE_CONFIDENCE = False

try:
    from scoring.router import route as route_values
    HAVE_ROUTER = True
except ImportError:
    HAVE_ROUTER = False

try:
    from verify.xbrl import verify_filing
    HAVE_VERIFY = True
except ImportError:
    HAVE_VERIFY = False

try:
    from verify.report import build_report as verify_build_report
    HAVE_REPORT = True
except ImportError:
    HAVE_REPORT = False

try:
    from audit.log import append as audit_append
except ImportError:
    def audit_append(entry: dict) -> dict:
        print(f"[audit-stub] {entry['decision_id']} {entry['decision']} by {entry['reviewer']}")
        return entry


# ---------- helpers ----------

def _thread_id(cfg: RunnableConfig) -> str:
    return cfg["configurable"]["thread_id"]


def _dump(values: list) -> list[dict]:
    return [v.model_dump() if isinstance(v, ExtractedValue) else dict(v) for v in values]


def _models(values: list[dict]) -> list[ExtractedValue]:
    return [ExtractedValue(**v) for v in values]


def _meta(state: AuditState) -> dict:
    return {k: state.get(k) for k in ("ticker", "cik", "accession", "fiscal_year", "period_end", "primary_document")}


def is_mock(ticker: str) -> bool:
    """MOCK* tickers are fixtures: always served from mock_values.json, never from SEC."""
    return ticker.upper().startswith("MOCK")


def resolve_filing(ticker: str) -> dict:
    """Which filing a run is about. Used by fetch_filing and by the API to build thread_id."""
    ticker = ticker.upper()
    if HAVE_EDGAR and not is_mock(ticker):
        cik = get_cik(ticker)
        meta = get_latest_10k(cik)
        return {"ticker": ticker, "cik": cik, "accession": meta["accession"],
                "fiscal_year": meta["fiscal_year"], "period_end": meta["period_end"],
                "primary_document": meta["primary_document"], "company": meta.get("company")}
    r = _mock_rows(ticker)[0]
    return {"ticker": ticker, "cik": r["cik"], "accession": r["accession"],
            "fiscal_year": r["fiscal_year"], "period_end": r["period_end"],
            "primary_document": r.get("source_page", ""), "company": r.get("company")}


def _mock_rows(ticker: str) -> list[dict]:
    rows = [r for r in json.loads(settings.MOCK_VALUES.read_text()) if r["ticker"] == ticker]
    if not rows:
        raise ValueError(f"[nodes] stub mode: no mock rows for {ticker} in mock_values.json")
    return [{k: v for k, v in r.items() if not k.startswith("_")} for r in rows]


def _stub_confidence(v: dict, period_end: str) -> tuple[float, dict]:
    """Rough stand-in for scoring.confidence until Srujan's module lands."""
    from rapidfuzz import fuzz
    if v.get("value") is None:
        return 0.0, {"agreement": 0.0, "label": 0.0, "period_unit": 0.0}
    alt = v.get("alt_value")
    agreement = 0.5 if alt is None else (1.0 if abs(v["value"] - alt) <= 1 else 0.0)
    # fuzz.ratio, NOT token_set_ratio (that one scores long, wrong labels as 100)
    label = max((fuzz.ratio(v.get("row_label", "").lower(), s) / 100
                 for s in settings.SYNONYMS[v["metric"]]), default=0.0)
    period_unit = (0.5 if v.get("period_end") == period_end else 0.0) + (0.5 if v.get("scale") else 0.0)
    signals = {"agreement": agreement, "label": round(label, 3), "period_unit": period_unit}
    c = sum(settings.WEIGHTS[k] * signals[k] for k in settings.WEIGHTS)
    if v.get("is_derived"):
        c = min(c, settings.DERIVED_CAP)
    return round(c, 4), signals


# ---------- nodes ----------

def fetch_filing(state: AuditState) -> dict:
    meta = resolve_filing(state["ticker"])
    db.upsert_filing(meta)
    real = HAVE_EDGAR and not is_mock(meta["ticker"])
    print(f"[nodes] fetch_filing {meta['ticker']} -> {meta['accession']} (edgar={'real' if real else 'stub'})")
    return {k: v for k, v in meta.items() if k != "company"}


def _locate_full(state: AuditState) -> dict[str, dict]:
    html = get_primary_doc(state["cik"], state["accession"], state["primary_document"])
    return locate_statements(strip_ixbrl(html))


def locate_statements_node(state: AuditState) -> dict:
    if HAVE_EDGAR and HAVE_LOCATE and not is_mock(state["ticker"]):
        full = _locate_full(state)
        tables = {k: {kk: vv for kk, vv in t.items() if kk != "html"} for k, t in full.items()}
    else:
        tables = {}
    db.upsert_filing({**_meta(state), "company": None}, tables)
    print(f"[nodes] locate_statements -> {sorted(tables) or 'stub (no tables)'}")
    return {"tables": tables}


def extract(state: AuditState, config: RunnableConfig) -> dict:
    tid = _thread_id(config)
    if HAVE_EDGAR and HAVE_LOCATE and HAVE_EXTRACT and not is_mock(state["ticker"]):
        full = _locate_full(state)   # re-read from disk cache; table HTML stays out of the checkpoint
        values, segments = extract_filing(_meta(state), full)
        values = _dump(values)
    else:
        values = _dump(_models(_mock_rows(state["ticker"])))
        segments = []
    db.upsert_values(values, thread_id=tid)   # INSERT OR IGNORE: replay-safe
    print(f"[nodes] extract -> {len(values)} values, {len(segments)} segments")
    return {"values": values, "segments": segments}


def validate(state: AuditState) -> dict:
    values = state["values"]
    if HAVE_VALIDATION:
        cfg = db.get_config()
        values = _dump(validate_filing(_models(values), state.get("segments", []), cfg))
    print(f"[nodes] validate ({'real' if HAVE_VALIDATION else 'stub: no checks'})")
    return {"values": values}


def score_confidence(state: AuditState) -> dict:
    if HAVE_CONFIDENCE:
        values = _dump(score_values(_models(state["values"]), state["period_end"]))
    else:
        values = []
        for v in state["values"]:
            c, signals = _stub_confidence(v, state["period_end"])
            values.append({**v, "confidence": c, "signals": signals})
    print(f"[nodes] score_confidence ({'real' if HAVE_CONFIDENCE else 'stub'})")
    return {"values": values}


def route(state: AuditState) -> dict:
    threshold = state.get("threshold") or settings.THRESHOLD
    if HAVE_ROUTER:
        routed, pending = route_values(_models(state["values"]), threshold)
        values = _dump(routed)
    else:
        values, pending = [], []
        for v in state["values"]:
            # ARCHITECTURE §7: ANY failed check pauses, whatever the threshold.
            # Severity only changes the wording: hard = "possible error", soft = "anomaly".
            failed = [c for c in v.get("validation", []) if c.get("status") == "failed"]
            label = v.get("signals", {}).get("label", 0.0)
            if (v.get("value") is not None and v["confidence"] >= threshold and not failed
                    and label >= settings.LABEL_FLOOR):
                values.append({**v, "status": "auto_approved", "escalation_reason": None})
            else:
                if v.get("value") is None:
                    reason = "no value extracted"
                elif failed:
                    reason = "; ".join(
                        f"{'possible error' if c.get('severity') == 'hard' else 'anomaly'}: "
                        f"{c.get('check', 'check')} {c.get('detail', '')}".strip()
                        for c in failed)
                elif v["confidence"] < threshold:
                    reason = f"confidence {v['confidence']:.2f} < {threshold:.2f}"
                else:
                    reason = f"label match {label:.2f} < {settings.LABEL_FLOOR:.2f}"
                values.append({**v, "status": "escalated", "escalation_reason": reason})
                pending.append(v["id"])
    print(f"[nodes] route -> {len(values) - len(pending)} clean, {len(pending)} pending")
    return {"values": values, "pending": list(pending)}


def auto_approve(state: AuditState, config: RunnableConfig) -> dict:
    tid = _thread_id(config)
    db.update_scored(state["values"])   # keyed by id, never touches human-decided rows
    values = []
    for v in state["values"]:
        if v["status"] == "auto_approved":
            db.set_status(v["id"], "auto_approved", v["value"])
            audit_append({
                "decision_id": f"{tid}:{v['id']}", "thread_id": tid, "value_id": v["id"],
                "metric": v["metric"], "original_value": v["value"], "corrected_value": None,
                "decision": "auto_approved", "reviewer": "system",
                "reason": f"confidence {v['confidence']:.2f}",
            })
            v = {**v, "final_value": v["value"]}
        values.append(v)
    print(f"[nodes] auto_approve -> {sum(v['status'] == 'auto_approved' for v in values)} approved")
    return {"values": values}


def human_review(state: AuditState) -> dict:
    vid = state["pending"][0]
    item = next(v for v in state["values"] if v["id"] == vid)
    decision = interrupt({"value": item, "reason": item["escalation_reason"]})   # NO side effects before this
    return {"decision": decision}                                                  # nothing else in this node


ACTION_STATUS = {"approve": "approved", "correct": "corrected", "reject": "rejected"}


def apply_decision(state: AuditState, config: RunnableConfig) -> dict:
    tid = _thread_id(config)
    pending = state["pending"]
    d = dict(state.get("decision") or {})
    if not pending or d.get("value_id") != pending[0]:
        print(f"[nodes] apply_decision: decision for {d.get('value_id')} is not the current item; re-asking")
        return {"decision": None}

    vid = pending[0]
    item = next(v for v in state["values"] if v["id"] == vid)
    d["thread_id"] = tid
    d["decision_id"] = f"{tid}:{vid}"            # deterministic idempotency key
    status = ACTION_STATUS[d["action"]]
    final = {"approve": item["value"], "correct": d.get("new_value"), "reject": None}[d["action"]]

    db.record_decision(d)                         # INSERT OR IGNORE on decision_id
    audit_append({                                # UNIQUE(decision_id) -> no-op on replay
        "decision_id": d["decision_id"], "thread_id": tid, "value_id": vid, "metric": item["metric"],
        "original_value": item["value"], "corrected_value": d.get("new_value") if d["action"] == "correct" else None,
        "decision": status, "reviewer": d.get("reviewer") or "reviewer", "reason": d.get("note"),
    })
    db.set_status(vid, status, final)

    values = [{**v, "status": status, "final_value": final} if v["id"] == vid else v for v in state["values"]]
    print(f"[nodes] apply_decision {d['decision_id']} -> {status}")
    return {"values": values, "pending": pending[1:], "decision": None}


def verify_vs_xbrl(state: AuditState) -> dict:
    # Rule 3: XBRL Company Facts are fetched only inside verify/ (verify_filing does it).
    # Mock fixtures have no ground truth, and verify_filing needs Mayur's edgar client.
    if HAVE_VERIFY and HAVE_EDGAR and not is_mock(state["ticker"]):
        rows = verify_filing(_models(state["values"]), state["cik"], state["accession"])   # INSERT OR REPLACE by value_id
        print(f"[nodes] verify_vs_xbrl -> {len(rows)} rows")
    else:
        print("[nodes] verify_vs_xbrl (skipped: mock fixture or edgar client not available)")
    return {}


def build_report(state: AuditState, config: RunnableConfig) -> dict:
    tid = _thread_id(config)
    if HAVE_REPORT:
        report = verify_build_report(tid)
    else:
        statuses = [v["status"] for v in state["values"]]
        report = {"thread_id": tid, "stub": True,
                  "decisions": {s: statuses.count(s) for s in sorted(set(statuses))},
                  "n_values": len(statuses)}
    db.save_report(tid, report)
    print(f"[nodes] report ({'real' if HAVE_REPORT else 'stub'}) -> {report.get('decisions')}")
    return {"report": report}


# ---------- routing helpers for conditional edges ----------

def has_pending(state: AuditState) -> str:
    return "human_review" if state.get("pending") else "verify_vs_xbrl"
