"""Confidence score (PS Step 3, ARCHITECTURE §6): did we read this number correctly?

C = 0.45·agreement + 0.30·label + 0.25·period_unit. Pure: values in -> values out.
Derived values are capped at 0.75 (always reach a human); missing values score 0.
Independent of validation (PS Step 4), so graph order does not matter; the router reads both.
"""
from rapidfuzz import fuzz

from core.config import DERIVED_CAP, SYNONYMS, WEIGHTS
from core.models import ExtractedValue

EPS_UNIT = "USD/shares"


def one_unit(v: ExtractedValue) -> float:
    """Smallest step in the source table: 1 table unit ($1M when "in millions"), $0.01 for EPS."""
    return 0.01 if v.unit == EPS_UNIT else 1.0


def agreement(v: ExtractedValue) -> float:
    if v.value is None or v.alt_value is None:
        return 0.5
    return 1.0 if abs(v.value - v.alt_value) <= one_unit(v) else 0.0


def label(v: ExtractedValue) -> float:
    if not v.row_label:
        return 0.0
    # fuzz.ratio, not token_set_ratio: token_set scores 1.0 whenever a synonym's words are a subset of
    # the label, so "Total assets of discontinued operations" would match "total assets" perfectly.
    best = max(fuzz.ratio(v.row_label.lower(), s) for s in SYNONYMS[v.metric])
    return round(best / 100, 3)


def period_unit(v: ExtractedValue, period_end: str) -> float:
    # ponytail: "scale detected" = table scale > 1 (or EPS, which is per-share by definition).
    # A filer reporting whole dollars scores 0.5 here; pass the locator's detected flag if that ever happens.
    scale_ok = v.unit == EPS_UNIT or v.scale > 1
    return ((v.period_end == period_end) + scale_ok) / 2


def score_one(v: ExtractedValue, period_end: str) -> ExtractedValue:
    signals = {
        "agreement": agreement(v),
        "label": label(v),
        "period_unit": period_unit(v, period_end),
    }
    c = round(sum(WEIGHTS[k] * signals[k] for k in WEIGHTS), 3)
    if v.is_derived:
        c = min(c, DERIVED_CAP)
    if v.value is None:
        c = 0.0
    return v.model_copy(update={"signals": signals, "confidence": c})


def score_values(values: list[ExtractedValue], period_end: str) -> list[ExtractedValue]:
    return [score_one(v, period_end) for v in values]


if __name__ == "__main__":
    import json

    from core.config import MOCK_VALUES
    rows = [ExtractedValue(**r) for r in json.loads(MOCK_VALUES.read_text())]
    scored = []
    for acc in dict.fromkeys(r.accession for r in rows):
        group = [r for r in rows if r.accession == acc]
        scored += score_values(group, group[0].period_end)
    for v in scored:
        s = " ".join(f"{k[:4]}={x:.2f}" for k, x in v.signals.items())
        print(f"[confidence] {v.ticker:5} {v.metric:20} C={v.confidence:.3f}  {s}")

    by = {(v.ticker, v.metric): v for v in scored}
    assert all(v.confidence == 1.0 for v in scored if v.ticker == "AAPL"), "AAPL is clean: every part = 1"
    assert by["MOCKA", "cash"].confidence == 0.0                       # missing value
    assert by["MOCKA", "operating_cash_flow"].signals["agreement"] == 0.0  # extractors disagree
    assert by["MOCKB", "total_liabilities"].confidence <= DERIVED_CAP  # derived cap
    assert set(by["MOCKA", "revenue"].signals) == set(WEIGHTS)          # 3 parts, no validation term
    from scoring.router import LABEL_FLOOR
    assert by["MOCKA", "net_income"].signals["label"] < LABEL_FLOOR     # weak label still goes to a human
    print("[confidence] smoke test OK")
