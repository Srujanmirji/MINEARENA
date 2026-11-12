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

BALANCE = ("total_assets", "total_liabilities", "equity")
MUST_BE_POSITIVE = ("revenue", "total_assets", "total_liabilities")
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
    detail = f"A=L+E off by {abs(gap):.1%}"
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
        return _result(YOY, "soft", "failed", f"{change:+.0%} vs prior")
    return _result(YOY, "soft", "passed", f"{change:+.0%} vs prior")


def check_scale(v: ExtractedValue) -> dict:
    if v.value is None or not v.prior_value or not v.value:
        return _result(SCALE, "hard", "na", "no prior-year value")
    ratio = abs(v.value / v.prior_value)
    if SCALE_LOW <= ratio <= SCALE_HIGH or SCALE_LOW <= 1 / ratio <= SCALE_HIGH:
        return _result(SCALE, "hard", "failed", f"possible scale error ({ratio:,.4g}x prior)")
    return _result(SCALE, "hard", "passed", "same order of magnitude as prior")


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

    out = []
    for v in values:
        results = []
        if v.metric in BALANCE:
            results.append(equation)
        if v.metric == "revenue":
            results.append(segment)
        results += [check_yoy(v, yoy_threshold), check_scale(v)]
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
