"""Automated decision (PS 3.3/3.5, PRD FR-5). Pure: values in -> (values, pending_ids).

Auto-approve iff value present AND confidence >= threshold AND label match >= LABEL_FLOOR
AND no failed check of ANY severity
(PS: pause "whenever the confidence score is low or a validation check fails", even if the
threshold slider is lowered). Severity only changes wording: hard = possible error, soft = anomaly.
"""
from core.models import ExtractedValue
from scoring.validation import failed_checks

SIGNAL_NAMES = {"agreement": "extractor agreement", "label": "label match", "period_unit": "period/unit"}

# L has weight 0.25, so a wrong row ("Total assets of discontinued operations", L≈0.47) still scores
# C≈0.87 and would auto-approve. Any label below this floor goes to a human regardless of C.
# Clean real labels score >= 0.86 (e.g. "Total Walmart shareholders' equity").
LABEL_FLOOR = 0.80


def _label(v: ExtractedValue) -> float:
    return v.signals.get("label", 0.0)


def _is_auto(v: ExtractedValue, threshold: float) -> bool:
    return (v.value is not None and v.confidence >= threshold
            and not failed_checks(v) and _label(v) >= LABEL_FLOOR)


def _reason(v: ExtractedValue, threshold: float) -> str:
    if v.value is None:
        return "no value extracted"
    parts = [
        f"{c['detail']} ({'possible error' if c['severity'] == 'hard' else 'anomaly'})"
        for c in failed_checks(v)
    ]
    if v.is_derived:
        parts.append("derived value, not read from the filing")
    if _label(v) < LABEL_FLOOR:
        parts.append(f"label match {_label(v):.2f} < {LABEL_FLOOR:.2f}: check it is the right row")
    weak = {k: x for k, x in v.signals.items()
            if k in SIGNAL_NAMES and x < 1 and not (k == "label" and x < LABEL_FLOOR)}
    if weak:
        k = min(weak, key=weak.get)
        parts.append(f"{SIGNAL_NAMES[k]} {weak[k]:.2f}")
    if v.confidence < threshold:
        parts.append(f"confidence {v.confidence:.2f} < {threshold:.2f}")
    return "; ".join(parts)


def route(values: list[ExtractedValue], threshold: float) -> tuple[list[ExtractedValue], list[str]]:
    # ponytail: single global threshold; per-metric overrides (`threshold:<metric>`) arrive with bonus B-1.
    routed = []
    for v in values:
        if _is_auto(v, threshold):
            routed.append(v.model_copy(update={"status": "auto_approved", "escalation_reason": None}))
        else:
            routed.append(v.model_copy(update={"status": "escalated", "escalation_reason": _reason(v, threshold)}))
    escalated = [v for v in routed if v.status == "escalated"]
    escalated.sort(key=lambda v: (not failed_checks(v), v.confidence))  # failed checks first, then lowest C
    return routed, [v.id for v in escalated]


if __name__ == "__main__":
    import json

    from core.config import MOCK_VALUES, THRESHOLD
    from scoring.confidence import score_values
    from scoring.validation import validate_filing

    rows = [ExtractedValue(**r) for r in json.loads(MOCK_VALUES.read_text())]
    scored = []
    for acc in dict.fromkeys(r.accession for r in rows):
        group = [r for r in rows if r.accession == acc]
        scored += validate_filing(score_values(group, group[0].period_end), [], {})  # PS Step 3 -> Step 4
    routed, pending = route(scored, THRESHOLD)

    print(f"[router] threshold {THRESHOLD}")
    for v in routed:
        print(f"[router] {v.ticker:5} {v.metric:20} {v.confidence:.3f}  {v.status:13} {v.escalation_reason or ''}")
    print(f"[router] pending order: {[p.split(':')[0][-5:] + ':' + p.split(':')[1] for p in pending]}")

    assert all(v.status == "auto_approved" for v in routed if v.ticker == "AAPL")
    assert all(v.escalation_reason for v in routed if v.status == "escalated")
    assert {v.status for v in routed} == {"auto_approved", "escalated"}
    # a failed soft check escalates even with the slider at 0.5
    low, _ = route([v for v in scored if v.ticker == "MOCKA" and v.metric == "revenue"], 0.5)
    assert low[0].status == "escalated" and "anomaly" in low[0].escalation_reason
    by_key = {(v.ticker, v.metric): v for v in routed}
    for weak_label in (("MOCKA", "net_income"), ("MOCKB", "revenue")):  # C >= 0.85 but wrong-looking row
        assert by_key[weak_label].status == "escalated", weak_label
        assert "label match" in by_key[weak_label].escalation_reason
    by = {v.id: v for v in routed}
    first_clean = next(i for i, p in enumerate(pending) if not failed_checks(by[p]))
    assert all(not failed_checks(by[p]) for p in pending[first_clean:]), "failed checks first"
    print("[router] smoke test OK")
