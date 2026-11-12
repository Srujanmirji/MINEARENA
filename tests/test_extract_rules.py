"""Extraction rules that protect accuracy on unseen filings (no network: synthetic tables)."""
import unittest

from extract.locate import _looks_like
from extract.opinion import check_opinion
from extract.table_parser import label_allowed, parse_rows

TABLE = """<table>
<tr><td></td><td>2023</td><td>2024</td><td>2025</td></tr>
<tr><td>Total revenues</td><td>100</td><td>150</td><td>200</td></tr>
<tr><td>Net income</td><td>10</td><td>15</td><td>20</td></tr>
</table>"""


class TestRowRules(unittest.TestCase):
    def test_non_gaap_rows_never_count(self):
        self.assertFalse(label_allowed("revenue", "Adjusted revenue (non-GAAP)"))

    def test_net_income_never_takes_nci_comprehensive_or_per_share(self):
        for label in ("Net income attributable to noncontrolling interests",
                      "Total comprehensive income attributable to the Company",
                      "Net income per share"):
            self.assertFalse(label_allowed("net_income", label), label)

    def test_total_liabilities_never_takes_current_or_combined_rows(self):
        self.assertFalse(label_allowed("total_liabilities", "Total current liabilities"))
        self.assertFalse(label_allowed("total_liabilities", "Total liabilities and shareholders' equity"))

    def test_latest_year_is_current_even_when_columns_run_oldest_first(self):
        revenue = next(r for r in parse_rows(TABLE) if r["label"] == "Total revenues")
        self.assertEqual(revenue["values"][:2], [200.0, 150.0])  # current, prior


class TestLocate(unittest.TestCase):
    def test_statement_must_contain_its_lines(self):
        self.assertTrue(_looks_like("income_statement", "Net sales ... Net income"))
        self.assertFalse(_looks_like("income_statement", "Allowance for credit losses"))

    def test_mdna_summary_is_not_the_income_statement(self):
        self.assertFalse(_looks_like("income_statement", "Net sales % of net sales Net income"))


class TestAuditorOpinion(unittest.TestCase):
    CLEAN = "In our opinion, the financial statements present fairly, in all material respects, ..."

    def test_clean_opinion_passes_even_with_standard_definitions(self):
        self.assertEqual(check_opinion(self.CLEAN + " A material weakness is a deficiency ...")["status"], "passed")

    def test_red_flags_fail(self):
        for text in ("we do not express an opinion",
                     "the Company has not maintained, in all material respects, effective internal control",
                     "substantial doubt about its ability to continue as a going concern"):
            self.assertEqual(check_opinion(text)["status"], "failed", text)


if __name__ == "__main__":
    unittest.main()
