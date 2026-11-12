"""Financial validation engine (PS 3.4, PRD FR-4). Pure: values in -> values out.

Each check result: {"check", "severity": "hard"|"soft", "status": "passed"|"failed"|"na", "detail"}.
Runs BEFORE scoring: the confidence score's V term reads these results.
"""
from collections import defaultdict

from core.models import ExtractedValue

EQUATION = "A = L + E"
SEGMENTS = "Segment sum"
YOY = "Year-on-year"
SCALE = "Scale sanity"
SIGN = "Sign"
UNITS = "Units"

BALANCE = ("total_assets", "total_liabilities", "equity")
MUST_BE_POSITIVE = ("revenue", "total_assets", "total_liabilities")
# Filing-level checks made at extraction time, carried through untouched; a failed one escalates.
CARRIED_CHECKS = ("Auditor's opinion", "Net income tie-out", "Cash tie-out", "Amended filing", "Filing type")
MARGIN, EPS_SIGN = "Margin sanity", "EPS sign"
SCALE_LOW, SCALE_HIGH = 500, 2000  # ratio band that smells like thousands vs millions


def _result(check: str, severity: str, status: str, detail: str) -> dict:
    return {"check": check, "severity": severity, "status": status, "detail": detail}


def _base(v: ExtractedValue | None) -> float | None:
    return None if v is None or v.value is None else v.value * v.scale


def check_equation(by_metric: dict[str, ExtractedValue], tolerance: float) -> dict:
    a, l, e = (_base(by_metric.get(m)) for m in BALANCE)
    if a is None or l is None or e is None or a == 0:
        missing = [m for m, x in zip(BALANCE, (a, l, e)) if x is None]
        return _result(EQUATION, "hard", "na", f"missing {', '.join(missing) or 'total_assets'}")
    gap = (a - (l + e)) / a
    if abs(gap) <= tolerance:
        return _result(EQUATION, "hard", "passed", f"A = L + E within {abs(gap):.2%}")
    scale = by_metric["total_assets"].scale or 1
    detail = f"A=L+E off by {abs(gap):.1%} (gap {abs(a - (l + e)) / scale:,.0f})"
    if "noncontrolling" not in by_metric["equity"].row_label.lower():
        detail += " (equity may exclude NCI)"
    return _result(EQUATION, "hard", "failed", detail)


def check_segments(revenue: ExtractedValue | None, segments: list[dict], tolerance: float) -> dict:
    if not segments:
        return _result(SEGMENTS, "hard", "na", "no segment data")
    if revenue is None or revenue.value is None:
        return _result(SEGMENTS, "hard", "na", "no revenue value")
    total = sum(float(s["value"]) for s in segments)  # same table scale as revenue
    gap = (total - revenue.value) / revenue.value if revenue.value else float("inf")
    if abs(gap) <= tolerance:
        return _result(SEGMENTS, "hard", "passed", f"{len(segments)} segments sum to revenue")
    return _result(SEGMENTS, "hard", "failed", f"segments sum {total:,.0f} vs revenue {revenue.value:,.0f} ({gap:+.1%})")


def check_yoy(v: ExtractedValue, threshold: float) -> dict:
    if v.value is None or not v.prior_value:
        return _result(YOY, "soft", "na", "no prior-year value")
    change = (v.value - v.prior_value) / abs(v.prior_value)
    if abs(change) > threshold:
        return _result(YOY, "soft", "failed", f"{change:+.0%} vs prior{_trend(v)}")
    return _result(YOY, "soft", "passed", f"{change:+.0%} vs prior")


def _trend(v: ExtractedValue) -> str:
    """Context for a big jump from the 3-year history: one-off break, or part of a trend?"""
    years = sorted(v.history or {})
    if len(years) < 3:
        return ""
    a, b = v.history[years[-3]], v.history[years[-2]]
    if not a:
        return ""
    earlier = (b - a) / abs(a)
    kind = "continues a trend" if abs(earlier) > 0.2 and (earlier > 0) == (v.value > v.prior_value) else "breaks the trend"
    return f"; year before was {earlier:+.0%}, so this {kind}"


def check_margin(by_metric: dict[str, ExtractedValue]) -> dict:
    """Hard: operating income can't exceed revenue (an operating margin over 100% means a wrong row)."""
    rev, op = _base(by_metric.get("revenue")), _base(by_metric.get("operating_income"))
    if rev is None or op is None or rev <= 0:
        return _result(MARGIN, "hard", "na", "revenue or operating income missing")
    if abs(op) > rev:
        return _result(MARGIN, "hard", "failed", f"operating margin {op / rev:.0%}: operating income larger than revenue")
    return _result(MARGIN, "hard", "passed", f"operating margin {op / rev:.0%}")


def check_eps_sign(by_metric: dict[str, ExtractedValue]) -> dict:
    """Hard: diluted EPS and net income must have the same sign (a profit can't give a loss per share)."""
    ni, eps = by_metric.get("net_income"), by_metric.get("eps_diluted")
    if ni is None or eps is None or ni.value is None or eps.value is None or not ni.value or not eps.value:
        return _result(EPS_SIGN, "hard", "na", "net income or EPS missing")
    if (ni.value > 0) == (eps.value > 0):
        return _result(EPS_SIGN, "hard", "passed", "EPS and net income agree in sign")
    return _result(EPS_SIGN, "hard", "failed", f"net income {ni.value:,.0f} but EPS {eps.value:.2f}")


def check_scale(v: ExtractedValue) -> dict:
    if v.value is None or not v.prior_value or not v.value:
        return _result(SCALE, "hard", "na", "no prior-year value")
    ratio = abs(v.value / v.prior_value)
    if SCALE_LOW <= ratio <= SCALE_HIGH or SCALE_LOW <= 1 / ratio <= SCALE_HIGH:
        return _result(SCALE, "hard", "failed", f"possible scale error ({ratio:,.4g}x prior)")
    return _result(SCALE, "hard", "passed", "same order of magnitude as prior")


def check_units(v: ExtractedValue) -> dict:
    """Hard: a dollar value whose table scale ("in millions"/"in thousands") was not found.
    Scale sanity can't see it (value and prior share the same wrong scale), and a 10-K reported
    in whole dollars is rare, so a human confirms. Found by testing Pfizer and Home Depot."""
    if v.value is None or v.unit != "USD":
        return _result(UNITS, "hard", "na", "per-share or missing value")
    if v.scale > 1:
        return _result(UNITS, "hard", "passed", f"table scale found (×{v.scale:,})")
    return _result(UNITS, "hard", "failed", "table scale not found: check whether the table is in millions or thousands")


def check_sign(v: ExtractedValue) -> dict:
    if v.value is None:
        return _result(SIGN, "hard", "na", "no value")
    if v.value > 0:
        return _result(SIGN, "hard", "passed", "positive")
    return _result(SIGN, "hard", "failed", f"{v.metric} must be > 0, got {v.value:,.0f}")


def _validate_one_filing(values: list[ExtractedValue], segments: list[dict], cfg: dict) -> list[ExtractedValue]:
    tolerance = float(cfg.get("equation_tolerance", 0.005))
    yoy_threshold = float(cfg.get("yoy_threshold", 0.40))
    by_metric = {v.metric: v for v in values}
    equation = check_equation(by_metric, tolerance)
    segment = check_segments(by_metric.get("revenue"), segments, tolerance)
    margin, eps_sign = check_margin(by_metric), check_eps_sign(by_metric)

    out = []
    for v in values:
        # Filing-level checks made at extraction (the auditor's opinion) are kept, not recomputed.
        results = [c for c in v.validation if c.get("check") in CARRIED_CHECKS]
        if v.metric in BALANCE:
            results.append(equation)
        if v.metric == "revenue":
            results.append(segment)
        if v.metric == "operating_income":
            results.append(margin)
        if v.metric in ("net_income", "eps_diluted"):
            results.append(eps_sign)
        results += [check_yoy(v, yoy_threshold), check_scale(v), check_units(v)]
        if v.metric in MUST_BE_POSITIVE:
            results.append(check_sign(v))
        out.append(v.model_copy(update={"validation": [dict(r) for r in results]}))
    return out


def validate_filing(values: list[ExtractedValue], segments: list[dict], cfg: dict) -> list[ExtractedValue]:
    """Validate every value. Groups by accession so cross-metric checks never mix filings."""
    by_filing: dict[str, list[ExtractedValue]] = defaultdict(list)
    for v in values:
        by_filing[v.accession].append(v)
    checked = {v.id: v for group in by_filing.values() for v in _validate_one_filing(group, segments, cfg)}
    return [checked[v.id] for v in values]  # keep input order


def failed_checks(v: ExtractedValue) -> list[dict]:
    return [c for c in v.validation if c["status"] == "failed"]


if __name__ == "__main__":
    import json

    from core.config import MOCK_VALUES

    rows = [ExtractedValue(**r) for r in json.loads(MOCK_VALUES.read_text())]
    aapl_segments = [  # Apple FY2024 geographic segments, $M (sum = 391,035)
        {"segment": "Americas", "value": 167045}, {"segment": "Europe", "value": 101328},
        {"segment": "Greater China", "value": 66952}, {"segment": "Japan", "value": 25052},
        {"segment": "Rest of Asia Pacific", "value": 30658},
    ]
    aapl = validate_filing([r for r in rows if r.ticker == "AAPL"], aapl_segments, {})
    mocks = validate_filing([r for r in rows if r.ticker != "AAPL"], [], {})
    for v in aapl + mocks:
        marks = " ".join(f"{c['check']}:{c['status']}" for c in v.validation)
        fails = "; ".join(c["detail"] for c in failed_checks(v))
        print(f"[validation] {v.ticker:5} {v.metric:20} {marks}  {fails}")

    assert all(not failed_checks(v) for v in aapl), "AAPL must pass every validation"
    assert any(c["check"] == SEGMENTS and c["status"] == "passed" for v in aapl for c in v.validation)
    by = {(v.ticker, v.metric): v for v in mocks}
    assert failed_checks(by["MOCKA", "total_assets"])[0]["detail"].startswith("A=L+E off by 2.0%")
    assert failed_checks(by["MOCKA", "revenue"])[0]["detail"] == "+120% vs prior"

    scaled = aapl[0].model_copy(update={"value": aapl[0].value * 1000})  # FR-4: x1000 must be flagged
    assert any(c["check"] == SCALE for c in failed_checks(validate_filing([scaled], [], {})[0]))
    print("[validation] AAPL passes all checks; A=L+E, YoY and x1000 scale cases flagged: OK")
