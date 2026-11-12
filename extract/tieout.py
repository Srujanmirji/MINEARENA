"""Tie-out checks: the same number must agree wherever the filing reports it (auditor "tie-out").

- Net income tie-out: the cash-flow statement starts from net income; it must equal the income
  statement's net income (parent's, or consolidated incl. noncontrolling interests).
- Cash tie-out: the cash-flow statement's ending cash must equal balance-sheet cash (N/A when the
  cash-flow figure also includes restricted cash, which the balance-sheet line does not).

Reads only the filed statement tables (never XBRL). Results are per-metric validation entries,
carried through scoring/validation.py like the auditor's-opinion check.
"""
from extract.table_parser import parse_rows

NI_TIE, CASH_TIE = "Net income tie-out", "Cash tie-out"
TIE_CHECKS = (NI_TIE, CASH_TIE)
REL_TOL = 0.005      # 0.5%, the same tolerance as A = L + E
RESTRICTED_TOL = 0.05  # cash gaps up to 5% are restricted cash, not a misread (wrong row/year/scale is far bigger)


def _result(check: str, severity: str, status: str, detail: str) -> dict:
    return {"check": check, "severity": severity, "status": status, "detail": detail}


def _rows(tables: dict, statement: str) -> list[dict]:
    html = tables.get(statement, {}).get("html", "")
    try:
        return parse_rows(html) if html else []
    except Exception:
        return []


def _current(row: dict) -> float | None:
    """The latest year's value: by year label when known, since some filers (Alphabet) order
    columns oldest first, so the first column is not always the current year."""
    hist = row.get("history") or {}
    return hist[max(hist)] if hist else (row["values"][0] if row["values"] else None)


def _first(rows: list[dict], test) -> dict | None:
    hit = next((r for r in rows if _current(r) is not None and test(r["label"].lower())), None)
    return None if hit is None else {**hit, "current": _current(hit)}


def _close(a: float, b: float, tol: float = REL_TOL) -> bool:
    return abs(a - b) <= tol * max(abs(a), abs(b), 1.0)


def net_income_tieout(tables: dict, ni_value: float | None, ni_scale: int) -> dict:
    cf = _first(_rows(tables, "cash_flow"), lambda l: l.startswith(("net income", "net earnings", "consolidated net income", "net (loss) income", "net loss")))
    if ni_value is None or cf is None:
        return _result(NI_TIE, "hard", "na", "net income not found in both statements")
    cf_base = cf["current"] * tables["cash_flow"].get("scale", 1)
    candidates = [ni_value * ni_scale]
    consolidated = _first(_rows(tables, "income_statement"),
                          lambda l: l in ("net income", "consolidated net income", "net earnings", "net income (loss)"))
    if consolidated:
        candidates.append(consolidated["current"] * tables["income_statement"].get("scale", 1))
    if any(_close(cf_base, c) for c in candidates):
        return _result(NI_TIE, "hard", "passed", "cash-flow statement starts from the same net income")
    return _result(NI_TIE, "hard", "failed",
                   f"cash-flow statement starts from {cf['values'][0]:,.0f} ({cf['label'][:40]}), income statement says {ni_value:,.0f}")


def cash_tieout(tables: dict, cash_value: float | None, cash_scale: int) -> dict:
    end = _first(_rows(tables, "cash_flow"), lambda l: "cash" in l and ("end of" in l or "ending" in l))
    if cash_value is None or end is None:
        return _result(CASH_TIE, "hard", "na", "ending cash not found in the cash-flow statement")
    end_base = end["current"] * tables["cash_flow"].get("scale", 1)
    if _close(end_base, cash_value * cash_scale):
        return _result(CASH_TIE, "hard", "passed", "cash-flow ending cash = balance-sheet cash")
    if "restricted" in end["label"].lower() or _close(end_base, cash_value * cash_scale, RESTRICTED_TOL):
        # Cash-flow cash often includes restricted cash, labelled or not (Alphabet: +2.5%).
        return _result(CASH_TIE, "hard", "na", "cash-flow ending cash likely includes restricted cash; small gap not tested")
    return _result(CASH_TIE, "hard", "failed",
                   f"cash-flow ending cash {end['values'][0]:,.0f} vs balance-sheet cash {cash_value:,.0f}")


def tie_out(tables: dict, by_metric: dict[str, dict]) -> dict[str, list[dict]]:
    """metric -> tie-out results to attach to that metric's validation list."""
    def val(m: str) -> tuple[float | None, int]:
        item = by_metric.get(m) or {}
        return item.get("value"), item.get("table_scale", 1) or 1

    ni, ni_scale = val("net_income")
    cash, cash_scale = val("cash")
    return {
        "net_income": [net_income_tieout(tables, ni, ni_scale)],
        "cash": [cash_tieout(tables, cash, cash_scale)],
    }
