"""Ground-truth verification against SEC XBRL Company Facts (PS 3.8, PRD FR-9, DATA_MODEL §4).

The ONLY place in the repo that reads Company Facts (CLAUDE.md rule 3). Runs after all reviews.
Correct = |our - xbrl| <= one unit of the table's scale ($1M when "in millions", $0.01 for EPS).
"""
from contextlib import closing
from datetime import date, datetime

from core import db
from core.models import ExtractedValue

# Tried in order; the first tag with a matching fact wins.
TAGS: dict[str, list[str]] = {
    "revenue": ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"],
    "operating_income": ["OperatingIncomeLoss"],
    "net_income": ["NetIncomeLoss"],
    "eps_diluted": ["EarningsPerShareDiluted"],
    "total_assets": ["Assets"],
    "total_liabilities": ["Liabilities"],  # many filers don't tag it -> no ground truth
    "equity": ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
    "operating_cash_flow": ["NetCashProvidedByUsedInOperatingActivities"],
    "cash": ["CashAndCashEquivalentsAtCarryingValue"],
}
INSTANT = {"total_assets", "total_liabilities", "equity", "cash"}  # balance-sheet: no start date
FISCAL_YEAR_DAYS, YEAR_SLACK_DAYS = 365, 10  # 52/53-week years land within ±10 days
EPS_UNIT = "USD/shares"


def _is_annual(fact: dict, end: str) -> bool:
    start = fact.get("start")
    if not start:
        return False
    days = (date.fromisoformat(end) - date.fromisoformat(start)).days
    return abs(days - FISCAL_YEAR_DAYS) <= YEAR_SLACK_DAYS


def find_fact(facts: dict, metric: str, unit: str, accession: str, period_end: str) -> tuple[str, float] | None:
    """(tag, value in base units) of the first tag with a fact from THIS filing for THIS period."""
    gaap = facts.get("facts", facts).get("us-gaap", {})  # accept the raw API response or its "facts" part
    for tag in TAGS[metric]:
        for fact in gaap.get(tag, {}).get("units", {}).get(unit, []):
            if (fact.get("accn") == accession and fact.get("form") == "10-K" and fact.get("fp") == "FY"
                    and fact.get("end") == period_end
                    and (metric in INSTANT or _is_annual(fact, period_end))):
                return tag, float(fact["val"])
    return None


def _match(ours: float | None, xbrl: float | None, tolerance: float) -> int | None:
    if xbrl is None:
        return None          # no ground truth: reported separately, never counted as right or wrong
    if ours is None:
        return 0             # ground truth exists but we have no usable value
    return int(abs(ours - xbrl) <= tolerance + 1e-9)


def verify_one(v: ExtractedValue, facts: dict, accession: str) -> dict:
    found = find_fact(facts, v.metric, v.unit, accession, v.period_end)
    tag, xbrl = found if found else (None, None)
    tolerance = 0.01 if v.unit == EPS_UNIT else float(v.scale)
    final = v.final_value if v.final_value is not None else v.value
    ours = None if v.status == "rejected" or final is None else final * v.scale
    orig = None if v.value is None else v.value * v.scale  # pre-review value, for escalation precision
    return {
        "value_id": v.id,
        "xbrl_tag": tag,
        "xbrl_value": xbrl,
        "our_value": ours,
        "orig_value": orig,
        "match": _match(ours, xbrl, tolerance),
        "orig_match": _match(orig, xbrl, tolerance),
        "abs_error": None if ours is None or xbrl is None else abs(ours - xbrl),
        "verified_at": datetime.now().astimezone().isoformat(timespec="seconds"),
    }


def save_rows(rows: list[dict]) -> None:
    """INSERT OR REPLACE keyed by value_id: re-verification overwrites, never duplicates."""
    if not rows:
        return
    cols = list(rows[0])
    sql = f"INSERT OR REPLACE INTO verification ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})"
    with closing(db.connect()) as conn, conn:
        conn.executemany(sql, [tuple(r[c] for c in cols) for r in rows])


def verify_values(values: list[ExtractedValue], facts: dict, accession: str) -> list[dict]:
    rows = [verify_one(v, facts, accession) for v in values]
    save_rows(rows)
    print(f"[verify] {accession}: {sum(r['match'] == 1 for r in rows)}/"
          f"{sum(r['match'] is not None for r in rows)} correct, "
          f"{sum(r['match'] is None for r in rows)} without ground truth")
    return rows


def verify_filing(values: list[ExtractedValue], cik: str, accession: str) -> list[dict]:
    """Graph entry point: fetch Company Facts (cached, via Mayur's client) and verify one filing."""
    from edgar.client import get_company_facts  # rule 3: only verify/ may call this

    return verify_values(values, get_company_facts(cik), accession)


if __name__ == "__main__":
    import json
    import sys
    import tempfile
    from pathlib import Path

    from core import config
    from core.config import MOCK_VALUES

    if len(sys.argv) < 2:
        sys.exit("usage: python -m verify.xbrl <path to CIK0000320193.json Company Facts>")
    facts = json.loads(Path(sys.argv[1]).read_text())
    config.APP_DB = Path(tempfile.mkdtemp()) / "verify_smoke.db"  # keep test rows out of data/app.db
    db.init_db()

    aapl = [ExtractedValue(**r) for r in json.loads(MOCK_VALUES.read_text()) if r["ticker"] == "AAPL"]
    acc = aapl[0].accession
    rows = verify_values(aapl, facts, acc)
    for r in rows:
        print(f"[verify] {r['value_id'].split(':')[1]:20} {r['xbrl_tag']:52} ours={r['our_value']:>16,.2f} "
              f"xbrl={r['xbrl_value']:>16,.2f} match={r['match']}")
    assert all(r["match"] == 1 and r["orig_match"] == 1 for r in rows), "all 9 real AAPL values must match"

    by = {v.metric: v for v in aapl}
    off_by_one = by["revenue"].model_copy(update={"final_value": by["revenue"].value + 1})  # $1M off: still correct
    off_by_two = by["revenue"].model_copy(update={"final_value": by["revenue"].value + 2})  # $2M off: wrong
    eps_wrong = by["eps_diluted"].model_copy(update={"value": 6.10, "status": "corrected", "final_value": 6.08})
    rejected = by["cash"].model_copy(update={"status": "rejected", "final_value": None})
    other_filing = by["net_income"].model_copy(update={"period_end": "2023-09-30"})  # comparative year, same accn
    assert verify_one(off_by_one, facts, acc)["match"] == 1
    assert verify_one(off_by_two, facts, acc)["match"] == 0
    eps = verify_one(eps_wrong, facts, acc)
    assert (eps["match"], eps["orig_match"]) == (1, 0), eps  # reviewer fixed an extraction error
    assert verify_one(rejected, facts, acc)["match"] == 0
    assert verify_one(other_filing, facts, acc)["xbrl_value"] == 96995000000  # end-date match picks FY2023
    assert verify_one(by["revenue"], facts, "0000000000-00-000000")["match"] is None  # wrong accn: no truth

    verify_values(aapl, facts, acc)  # re-verify: replaces, never duplicates
    with closing(db.connect()) as conn:
        assert conn.execute("SELECT COUNT(*) FROM verification").fetchone()[0] == 9
    print("[verify] smoke test OK: 9/9 AAPL correct, tolerance/EPS/reject/period/accn cases, idempotent writes")
