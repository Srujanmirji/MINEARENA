"""AuditLoop UI API Client (Owner: Sai, P3).

Talks to the FastAPI backend (docs/API.md).
Streamlit never imports agent/.
In mock mode (USE_MOCK=True), reads data/mock_values.json and returns
the exact response shapes specified in docs/API.md.
In real mode, uses httpx with a 10s timeout, returning None on error
without exposing stack traces.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

# Global toggle: True during offline dev or when backend is unavailable
USE_MOCK: bool = os.getenv("USE_MOCK", "true").lower() in ("true", "1", "yes")
API_BASE: str = os.getenv("API_BASE", "http://localhost:8000")
TIMEOUT_SECONDS: float = 10.0

REPO_ROOT = Path(__file__).resolve().parent.parent
MOCK_DATA_PATH = REPO_ROOT / "data" / "mock_values.json"

# In-memory mock state for persistent decisions across interactions
_mock_decisions: list[dict[str, Any]] = []
_mock_pending_cache: list[dict[str, Any]] | None = None
_mock_config: dict[str, Any] = {"threshold": 0.85, "yoy_threshold": 0.40}
_mock_runs: list[dict[str, Any]] = [
    {
        "thread_id": "TSLA-2024",
        "ticker": "TSLA",
        "status": "paused",
        "n_values": 8,
        "n_pending": 2,
        "n_auto": 5,
        "n_reviewed": 1,
    },
    {
        "thread_id": "AAPL-2024",
        "ticker": "AAPL",
        "status": "done",
        "n_values": 8,
        "n_pending": 0,
        "n_auto": 8,
        "n_reviewed": 0,
    },
    {
        "thread_id": "NVDA-2024",
        "ticker": "NVDA",
        "status": "done",
        "n_values": 8,
        "n_pending": 0,
        "n_auto": 7,
        "n_reviewed": 1,
    },
]


def _load_mock_values() -> list[dict[str, Any]]:
    if not MOCK_DATA_PATH.exists():
        print(f"[api_client] Warning: Mock data not found at {MOCK_DATA_PATH}")
        return []
    try:
        with open(MOCK_DATA_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[api_client] Error loading mock values: {e}")
        return []


def _init_mock_pending() -> list[dict[str, Any]]:
    global _mock_pending_cache
    if _mock_pending_cache is not None:
        return _mock_pending_cache

    raw_values = _load_mock_values()
    pending: list[dict[str, Any]] = []

    # Filter rows with confidence 0.0 or escalated status
    for item in raw_values:
        conf = float(item.get("confidence", 0.0))
        status = item.get("status", "extracted")
        if conf == 0.0 or status in ("escalated", "extracted"):
            item_copy = dict(item)
            # Enhance signals for review card sketch if empty
            if not item_copy.get("signals"):
                item_copy["signals"] = {
                    "agreement": 0.0 if item_copy.get("metric") == "equity" else 1.0,
                    "label": 0.42 if item_copy.get("metric") == "equity" else 0.88,
                    "period_unit": 1.0,
                    "validation": 0.75,
                }
            if not item_copy.get("validation"):
                if item_copy.get("metric") == "equity":
                    item_copy["validation"] = [
                        {"check": "A=L+E", "severity": "hard", "status": "failed", "detail": "off by 2.1% (equity may excl. NCI)"},
                        {"check": "yoy", "severity": "soft", "status": "passed", "detail": "+12.4% YoY"},
                        {"check": "sign", "severity": "hard", "status": "passed", "detail": "> 0"},
                    ]
                else:
                    item_copy["validation"] = [
                        {"check": "A=L+E", "severity": "hard", "status": "passed", "detail": "diff 0.00%"},
                        {"check": "yoy", "severity": "soft", "status": "passed", "detail": "normal"},
                        {"check": "sign", "severity": "hard", "status": "passed", "detail": "> 0"},
                    ]
            if not item_copy.get("alt_value") and item_copy.get("value"):
                item_copy["alt_value"] = round(float(item_copy["value"]) * 1.018, 2)
            if not item_copy.get("escalation_reason"):
                item_copy["escalation_reason"] = (
                    "A = L + E off by 2.1% (equity may exclude NCI); label match 0.42"
                    if item_copy.get("metric") == "equity"
                    else "Label similarity 0.74 below threshold 0.85"
                )

            # Assign synthetic thread_id
            t_id = f"{item_copy.get('ticker', 'TSLA')}-2024"
            pending.append({
                "thread_id": t_id,
                "is_current": len(pending) == 0,
                "value": item_copy,
                "reason": item_copy.get("escalation_reason", "Low confidence score"),
            })

    # Ensure TSLA equity item exists at head for demo fidelity
    if not any(p["value"].get("ticker") == "TSLA" and p["value"].get("metric") == "equity" for p in pending):
        tsla_mock = {
            "id": "0001318605-25-000012:equity",
            "ticker": "TSLA",
            "company": "Tesla, Inc.",
            "cik": "0001318605",
            "accession": "0001318605-25-000012",
            "fiscal_year": 2024,
            "metric": "equity",
            "value": 72913.0,
            "alt_value": 74180.0,
            "extractor": "parser",
            "unit": "USD",
            "scale": 1000000,
            "period_start": "2024-01-01",
            "period_end": "2024-12-31",
            "confidence": 0.68,
            "signals": {"agreement": 0.0, "label": 0.42, "period_unit": 1.0, "validation": 0.70},
            "validation": [
                {"check": "A=L+E", "severity": "hard", "status": "failed", "detail": "off by 2.1% (equity may exclude NCI)"},
                {"check": "yoy", "severity": "soft", "status": "passed", "detail": "+16.4% YoY"},
                {"check": "sign", "severity": "hard", "status": "passed", "detail": "> 0"},
            ],
            "status": "escalated",
            "escalation_reason": "A = L + E off by 2.1% (equity may exclude NCI); label match 0.42",
            "source_page": "tsla-20241231.htm",
            "row_label": "Total stockholders' equity",
            "source_snippet": "Total stockholders' equity | $ 72,913 | $ 62,634",
            "column_header": "Dec. 31, 2024",
        }
        pending.insert(0, {
            "thread_id": "TSLA-2024",
            "is_current": True,
            "value": tsla_mock,
            "reason": tsla_mock["escalation_reason"],
        })
        for i in range(1, len(pending)):
            pending[i]["is_current"] = False

    _mock_pending_cache = pending
    return _mock_pending_cache


# ---------------------------------------------------------------------------
# HTTP Helpers for Real Mode
# ---------------------------------------------------------------------------

def _get(endpoint: str, params: dict | None = None) -> Any | None:
    if USE_MOCK:
        return None
    try:
        import httpx
        url = f"{API_BASE.rstrip('/')}/{endpoint.lstrip('/')}"
        with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
            resp = client.get(url, params=params)
            if resp.status_code == 200:
                return resp.json()
            print(f"[api_client] GET {url} returned {resp.status_code}: {resp.text[:120]}")
            return None
    except Exception as e:
        print(f"[api_client] GET {endpoint} failed: {e}")
        return None


def _post(endpoint: str, json_body: dict | None = None) -> Any | None:
    if USE_MOCK:
        return None
    try:
        import httpx
        url = f"{API_BASE.rstrip('/')}/{endpoint.lstrip('/')}"
        with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
            resp = client.post(url, json=json_body)
            if resp.status_code in (200, 201):
                return resp.json()
            print(f"[api_client] POST {url} returned {resp.status_code}: {resp.text[:120]}")
            return None
    except Exception as e:
        print(f"[api_client] POST {endpoint} failed: {e}")
        return None


def _put(endpoint: str, json_body: dict | None = None) -> Any | None:
    if USE_MOCK:
        return None
    try:
        import httpx
        url = f"{API_BASE.rstrip('/')}/{endpoint.lstrip('/')}"
        with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
            resp = client.put(url, json=json_body)
            if resp.status_code == 200:
                return resp.json()
            print(f"[api_client] PUT {url} returned {resp.status_code}: {resp.text[:120]}")
            return None
    except Exception as e:
        print(f"[api_client] PUT {endpoint} failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Public API Client Functions
# ---------------------------------------------------------------------------

def health() -> dict[str, Any] | None:
    """GET /health - service and checkpoint status."""
    if USE_MOCK:
        pending = _init_mock_pending()
        return {
            "ok": True,
            "db": True,
            "llm_provider": "gemini",
            "paused_runs": len(pending),
            "mock_mode": True,
        }
    data = _get("/health")
    if data is not None:
        data["mock_mode"] = False
    return data


def start_run(ticker: str, force: bool = False) -> dict[str, Any] | None:
    """POST /runs - start a filing extraction run."""
    if USE_MOCK:
        t_id = f"{ticker.upper()}-2024"
        return {"thread_id": t_id, "status": "running", "created": True}
    return _post("/runs", {"ticker": ticker.upper(), "force": force})


def list_runs() -> list[dict[str, Any]] | None:
    """GET /runs - list all runs with counters."""
    if USE_MOCK:
        return _mock_runs
    return _get("/runs")


def get_run(thread_id: str) -> dict[str, Any] | None:
    """GET /runs/{thread_id} - detailed step progression and interrupt."""
    if USE_MOCK:
        return {
            "thread_id": thread_id,
            "status": "paused",
            "next": ["human_review"],
            "steps_done": [
                "fetch_filing",
                "locate_statements",
                "extract",
                "score_confidence",
                "validate",
                "route",
            ],
            "interrupt": {
                "value": {"metric": "equity", "value": 72913},
                "reason": "A = L + E off by 2.1% (equity excl. NCI)",
            },
            "error": None,
        }
    return _get(f"/runs/{thread_id}")


def get_pending() -> list[dict[str, Any]] | None:
    """GET /pending - review queue items."""
    if USE_MOCK:
        return _init_mock_pending()
    return _get("/pending")


def submit_decision(
    thread_id: str,
    value_id: str,
    action: str,
    new_value: float | None = None,
    reviewer: str = "Sai",
    note: str | None = None,
) -> dict[str, Any] | None:
    """POST /runs/{thread_id}/decision - commit human decision."""
    if USE_MOCK:
        global _mock_pending_cache, _mock_decisions
        pending = _init_mock_pending()

        # Find target item
        idx = next((i for i, p in enumerate(pending) if p["value"]["id"] == value_id), 0)
        resolved_item = pending.pop(idx) if pending else None

        orig_val = resolved_item["value"].get("value") if resolved_item else 72913.0
        final_val = new_value if action == "correct" else orig_val

        # Record mock decision in append-only audit trail
        seq = len(_mock_decisions) + 1
        _mock_decisions.insert(0, {
            "seq": seq,
            "ts": "2026-11-12T15:00:00+05:30",
            "decision_id": f"{thread_id}:{value_id}",
            "thread_id": thread_id,
            "value_id": value_id,
            "metric": resolved_item["value"].get("metric", "unknown") if resolved_item else "equity",
            "original_value": orig_val,
            "corrected_value": final_val,
            "decision": action,
            "reviewer": reviewer,
            "reason": note or "Auditor verified against Form 10-K statement table",
            "prev_hash": "7a3f89b1c2049e01da34",
            "hash": f"hash_{seq:04d}_{action}_sha256",
        })

        # Update current pointer
        if pending:
            pending[0]["is_current"] = True
            next_id = pending[0]["value"]["id"]
        else:
            next_id = None

        _mock_pending_cache = pending
        return {
            "status": "paused" if pending else "done",
            "next_value_id": next_id,
            "duplicate": False,
        }

    body = {
        "value_id": value_id,
        "action": action,
        "new_value": new_value,
        "reviewer": reviewer,
        "note": note,
    }
    return _post(f"/runs/{thread_id}/decision", body)


def get_source(thread_id: str, value_id: str) -> dict[str, Any] | None:
    """GET /runs/{thread_id}/source/{value_id} - statement HTML table with highlighted row."""
    if USE_MOCK:
        metric = value_id.split(":")[-1] if ":" in value_id else "equity"
        return {
            "heading": "CONSOLIDATED BALANCE SHEETS",
            "scale_text": "(In millions, except per share data)",
            "html": f"""
            <table style="width:100%; border-collapse: collapse; font-family: -apple-system, sans-serif; font-size: 13px;">
              <thead>
                <tr style="border-bottom: 2px solid #000; text-align: left; background-color: #f9fafb;">
                  <th style="padding: 8px 10px;">Item / Classification</th>
                  <th style="padding: 8px 10px; text-align: right;">December 31, 2024</th>
                  <th style="padding: 8px 10px; text-align: right;">December 31, 2023</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 6px 10px;">Current assets: Cash and cash equivalents</td>
                  <td style="padding: 6px 10px; text-align: right;">$ 16,399</td>
                  <td style="padding: 6px 10px; text-align: right;">$ 16,400</td>
                </tr>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 6px 10px;">Total current assets</td>
                  <td style="padding: 6px 10px; text-align: right;">$ 41,539</td>
                  <td style="padding: 6px 10px; text-align: right;">$ 35,768</td>
                </tr>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 6px 10px;">Total assets</td>
                  <td style="padding: 6px 10px; text-align: right;">$ 119,774</td>
                  <td style="padding: 6px 10px; text-align: right;">$ 106,618</td>
                </tr>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 6px 10px;">Total liabilities</td>
                  <td style="padding: 6px 10px; text-align: right;">$ 46,861</td>
                  <td style="padding: 6px 10px; text-align: right;">$ 43,009</td>
                </tr>
                <tr class="hl" style="background-color: #fef3c7; font-weight: 600; border-left: 4px solid #f59e0b; border-bottom: 1px solid #f59e0b;">
                  <td style="padding: 7px 10px;">Total stockholders' equity ({metric})</td>
                  <td style="padding: 7px 10px; text-align: right; color: #b45309;">$ 72,913</td>
                  <td style="padding: 7px 10px; text-align: right;">$ 62,634</td>
                </tr>
                <tr>
                  <td style="padding: 6px 10px;">Total liabilities and stockholders' equity</td>
                  <td style="padding: 6px 10px; text-align: right;">$ 119,774</td>
                  <td style="padding: 6px 10px; text-align: right;">$ 106,618</td>
                </tr>
              </tbody>
            </table>
            """,
            "source_url": "https://www.sec.gov/edgar/searchedgar/companysearch",
        }
    return _get(f"/runs/{thread_id}/source/{value_id}")


def get_values(ticker: str | None = None) -> list[dict[str, Any]] | None:
    """GET /values - list extracted financial values with validation and signals."""
    if USE_MOCK:
        values = _load_mock_values()
        if ticker:
            values = [v for v in values if v.get("ticker", "").upper() == ticker.upper()]
        return values
    params = {"ticker": ticker} if ticker else None
    return _get("/values", params=params)


def get_validations(ticker: str | None = None) -> list[dict[str, Any]] | None:
    """GET /validations - accounting equation, segment sum, and YoY checks."""
    if USE_MOCK:
        sample = [
            {"ticker": "AAPL", "check": "A=L+E", "severity": "hard", "status": "passed", "detail": "diff 0.00% (Assets == Liabilities + Equity)"},
            {"ticker": "AAPL", "check": "segment_sum", "severity": "hard", "status": "passed", "detail": "5 operating segments match reported net sales"},
            {"ticker": "AAPL", "check": "yoy:revenue", "severity": "soft", "status": "passed", "detail": "+2.02% YoY change within threshold"},
            {"ticker": "TSLA", "check": "A=L+E", "severity": "hard", "status": "failed", "detail": "Assets $119,774M != L ($46,861M) + E ($72,913M), variance 2.1%"},
            {"ticker": "TSLA", "check": "sign:assets", "severity": "hard", "status": "passed", "detail": "Value > 0 confirmed"},
            {"ticker": "NVDA", "check": "yoy:revenue", "severity": "soft", "status": "failed", "detail": "+114% vs prior year exceeds soft threshold 40%"},
            {"ticker": "MSFT", "check": "A=L+E", "severity": "hard", "status": "passed", "detail": "diff 0.00%"},
            {"ticker": "AMZN", "check": "segment_sum", "severity": "hard", "status": "passed", "detail": "AWS + North America + Intl sum reconciled"},
        ]
        if ticker:
            sample = [s for s in sample if s["ticker"].upper() == ticker.upper()]
        return sample
    params = {"ticker": ticker} if ticker else None
    return _get("/validations", params=params)


def get_report() -> dict[str, Any] | None:
    """GET /report - accuracy report comparing extractions vs SEC XBRL facts."""
    if USE_MOCK:
        return {
            "overall": {
                "verifiable": 38,
                "correct": 37,
                "accuracy": 0.974,
                "pre_review_accuracy": 0.895,
                "no_ground_truth": 2,
            },
            "by_metric": {
                "revenue": {"verifiable": 5, "correct": 5, "accuracy": 1.0},
                "net_income": {"verifiable": 5, "correct": 5, "accuracy": 1.0},
                "total_assets": {"verifiable": 5, "correct": 5, "accuracy": 1.0},
                "total_liabilities": {"verifiable": 5, "correct": 4, "accuracy": 0.80},
                "equity": {"verifiable": 5, "correct": 5, "accuracy": 1.0},
                "operating_cash_flow": {"verifiable": 5, "correct": 5, "accuracy": 1.0},
                "operating_income": {"verifiable": 5, "correct": 5, "accuracy": 1.0},
                "eps_diluted": {"verifiable": 3, "correct": 3, "accuracy": 1.0},
            },
            "by_company": {
                "AAPL": {"verifiable": 8, "correct": 8, "accuracy": 1.0},
                "TSLA": {"verifiable": 8, "correct": 7, "accuracy": 0.875},
                "NVDA": {"verifiable": 8, "correct": 8, "accuracy": 1.0},
                "MSFT": {"verifiable": 8, "correct": 8, "accuracy": 1.0},
                "AMZN": {"verifiable": 6, "correct": 6, "accuracy": 1.0},
            },
            "decisions": {
                "auto_approved": 29,
                "escalated": 11,
                "reviewed": 11,
                "pending": 0,
            },
            "escalation_precision": 0.73,
            "auto_approval_error_rate": 0.0,
            "calibration": [
                {"band": "<0.60", "n": 4, "accuracy": 0.50},
                {"band": "0.60-0.85", "n": 7, "accuracy": 0.86},
                {"band": ">0.85", "n": 29, "accuracy": 1.00},
            ],
            "rows": [
                {"value_id": "0000320193-24-000123:revenue", "ticker": "AAPL", "metric": "revenue", "our_value": 391035, "xbrl_value": 391035, "match": True},
                {"value_id": "0000320193-24-000123:net_income", "ticker": "AAPL", "metric": "net_income", "our_value": 93736, "xbrl_value": 93736, "match": True},
                {"value_id": "0001318605-25-000012:equity", "ticker": "TSLA", "metric": "equity", "our_value": 72913, "xbrl_value": 72913, "match": True},
                {"value_id": "0001045810-25-000010:revenue", "ticker": "NVDA", "metric": "revenue", "our_value": 60922, "xbrl_value": 60922, "match": True},
            ],
        }
    return _get("/report")


def get_report_csv() -> str | None:
    """GET /report.csv - accuracy rows in CSV format."""
    if USE_MOCK:
        return (
            "value_id,ticker,metric,our_value,xbrl_value,match\n"
            "0000320193-24-000123:revenue,AAPL,revenue,391035,391035,True\n"
            "0000320193-24-000123:net_income,AAPL,net_income,93736,93736,True\n"
            "0001318605-25-000012:equity,TSLA,equity,72913,72913,True\n"
            "0001045810-25-000010:revenue,NVDA,revenue,60922,60922,True\n"
        )
    try:
        import httpx
        url = f"{API_BASE.rstrip('/')}/report.csv"
        with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
            resp = client.get(url)
            return resp.text if resp.status_code == 200 else None
    except Exception as e:
        print(f"[api_client] GET /report.csv failed: {e}")
        return None


def get_audit(limit: int = 200) -> list[dict[str, Any]] | None:
    """GET /audit - append-only log newest first."""
    if USE_MOCK:
        if not _mock_decisions:
            _mock_decisions.append({
                "seq": 1,
                "ts": "2026-11-12T14:40:00+05:30",
                "decision_id": "TSLA-2024:0001318605-25-000012:equity",
                "thread_id": "TSLA-2024",
                "value_id": "0001318605-25-000012:equity",
                "metric": "equity",
                "original_value": 72913.0,
                "corrected_value": 72913.0,
                "decision": "approved",
                "reviewer": "Sai",
                "reason": "Verified source table row 'Total stockholders equity' Item 8",
                "prev_hash": "00000000000000000000000000000000",
                "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            })
        return _mock_decisions[:limit]
    return _get("/audit", params={"limit": limit})


def verify_audit() -> dict[str, Any] | None:
    """GET /audit/verify - verify hash chain integrity."""
    if USE_MOCK:
        return {"ok": True, "rows": max(len(_mock_decisions), 1), "broken_at_seq": None}
    return _get("/audit/verify")


def get_config() -> dict[str, Any] | None:
    """GET /config - extraction confidence and variance thresholds."""
    if USE_MOCK:
        return dict(_mock_config)
    return _get("/config")


def set_config(threshold: float, yoy_threshold: float | None = None) -> dict[str, Any] | None:
    """PUT /config - update configuration for future runs."""
    payload: dict[str, Any] = {"threshold": threshold}
    if yoy_threshold is not None:
        payload["yoy_threshold"] = yoy_threshold
    if USE_MOCK:
        _mock_config.update(payload)
        return dict(_mock_config)
    return _put("/config", payload)

