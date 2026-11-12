"""Scoring rules: confidence, validation checks, routing. Pure functions on data/mock_values.json.

Run all tests:  .venv/bin/python -m unittest discover -s tests -v
"""
import json
import unittest

from core.config import MOCK_VALUES
from core.models import ExtractedValue
from scoring.confidence import score_values
from scoring.router import LABEL_FLOOR, route
from scoring.validation import check_eps_sign, check_margin, check_units, validate_filing

ROWS = [ExtractedValue(**{k: v for k, v in r.items() if not k.startswith("_")}) for r in json.loads(MOCK_VALUES.read_text())]


def run(ticker: str, threshold: float = 0.85) -> dict[str, ExtractedValue]:
    group = [r for r in ROWS if r.ticker == ticker]
    routed, _ = route(validate_filing(score_values(group, group[0].period_end), [], {}), threshold)
    return {v.metric: v for v in routed}


def checks(v: ExtractedValue) -> dict[str, str]:
    return {c["check"]: c["status"] for c in v.validation}


class TestRouting(unittest.TestCase):
    def test_clean_real_aapl_rows_all_auto_approve(self):
        self.assertTrue(all(v.status == "auto_approved" for v in run("AAPL").values()))

    def test_every_escalation_has_a_reason(self):
        for v in run("MOCKA").values():
            if v.status == "escalated":
                self.assertTrue(v.escalation_reason)

    def test_failed_check_escalates_even_with_low_threshold(self):
        self.assertEqual(run("MOCKA", threshold=0.5)["revenue"].status, "escalated")  # +120% YoY

    def test_missing_value_escalates(self):
        self.assertEqual(run("MOCKA")["cash"].status, "escalated")

    def test_weak_label_escalates_despite_high_confidence(self):
        v = run("MOCKA")["net_income"]
        self.assertLess(v.signals["label"], LABEL_FLOOR)
        self.assertEqual(v.status, "escalated")

    def test_derived_value_capped_and_escalated(self):
        v = run("MOCKB")["total_liabilities"]
        self.assertLessEqual(v.confidence, 0.75)
        self.assertEqual(v.status, "escalated")


class TestChecks(unittest.TestCase):
    def test_balance_sheet_equation_fails_on_2_percent_gap(self):
        self.assertEqual(checks(run("MOCKA")["total_assets"])["A = L + E"], "failed")

    def test_scale_error_is_caught(self):
        v = run("AAPL")["revenue"]
        bad = v.model_copy(update={"value": v.value * 1000})
        self.assertEqual(checks(validate_filing([bad], [], {})[0])["Scale sanity"], "failed")

    def test_units_fail_when_scale_not_found(self):
        v = run("AAPL")["revenue"].model_copy(update={"scale": 1})
        self.assertEqual(check_units(v)["status"], "failed")

    def test_margin_over_100_percent_fails(self):
        by = run("AAPL")
        by = {**by, "operating_income": by["operating_income"].model_copy(update={"value": by["revenue"].value * 2})}
        self.assertEqual(check_margin(by)["status"], "failed")

    def test_eps_sign_must_match_net_income(self):
        by = run("AAPL")
        by = {**by, "eps_diluted": by["eps_diluted"].model_copy(update={"value": -1.0})}
        self.assertEqual(check_eps_sign(by)["status"], "failed")


if __name__ == "__main__":
    unittest.main()
