"""Locate core financial statement tables in cleaned 10-K HTML.

Finds balance sheet, income statement, cash flow statement, and segment reporting table.
Extracts table index, heading, scale (in millions -> 1_000_000, in thousands -> 1_000, else 1),
and table HTML.
"""
from __future__ import annotations

import re
import warnings
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

INCOME_PATTERNS = [
    r"consolidated\s+statements?\s+of\s+(operations?|income|earnings)",
    r"statements?\s+of\s+(operations?|income|earnings)",
    r"\binc\s*ome\s+statements?",
]

BALANCE_PATTERNS = [
    r"consolidated\s+balance\s+sheets?",
    r"\bbalance\s+sheets?",
    r"statements?\s+of\s+financial\s+position",
    r"consolidated\s+statements?\s+of\s+financial\s+position",
]

CASH_FLOW_PATTERNS = [
    r"consolidated\s+statements?\s+of\s+cash\s+flows?",
    r"statements?\s+of\s+cash\s+flows?",
    r"cash\s+flows?\s+s?\s*tatements?",
]

# A heading near a table is not enough: notes often mention "the consolidated statements of
# operations" right before an unrelated table (e.g. Vita Coco's ASC 326 credit-loss table).
# A statement table must also contain the lines that statement always has.
MUST_CONTAIN: dict[str, list[tuple[str, ...]]] = {
    "income_statement": [("revenue", "sales"), ("net income", "net loss", "net earnings", "net (loss)", "net income (loss)")],
    "balance_sheet": [("total assets",), ("liabilities",)],
    "cash_flow": [("operating activities", "cash from operations", "provided by operations")],
}


# MD&A summary tables repeat revenue and net income next to "% of net sales" or "% change"
# columns (Home Depot); the audited statement never has them.
NOT_A_STATEMENT = ("% of net sales", "% of sales", "% of revenue", "% of total revenue", "% change", "percent of net sales")

# Scale notes as filers actually write them: "(In millions, ...)", "(MILLIONS, EXCEPT PER SHARE DATA)"
# (Pfizer), "dollars in millions", "$ in thousands", "millions of dollars".
SCALE_MILLIONS = re.compile(r"\bin\s+millions\b|\(\s*\$?\s*millions\b|\bmillions,\s+except\b|\$\s*in\s+millions|\bmillions\s+of\s+(?:u\.s\.\s+)?dollars\b")
SCALE_THOUSANDS = re.compile(r"\bin\s+thousands\b|\(\s*\$?\s*thousands\b|\bthousands,\s+except\b|\$\s*in\s+thousands|\bthousands\s+of\s+(?:u\.s\.\s+)?dollars\b")


def _looks_like(statement: str, table_text: str) -> bool:
    """True if the table holds at least one phrase from each group the statement requires."""
    text = re.sub(r"\s+", " ", table_text.lower())
    if statement == "income_statement" and any(p in text for p in NOT_A_STATEMENT):
        return False
    return all(any(p in text for p in group) for group in MUST_CONTAIN[statement])


def locate_statements(clean_html: str) -> dict[str, dict]:
    """Locate primary statement tables and scale in cleaned 10-K HTML.

    Returns dict mapping statement name to {"index": int, "heading": str, "scale": int, "html": str}.
    Keys: "balance_sheet", "income_statement", "cash_flow", and optionally "segment".
    """
    soup = BeautifulSoup(clean_html, "lxml")
    tables = soup.find_all("table")

    located: dict[str, dict] = {}

    for idx, t in enumerate(tables):
        rows = t.find_all("tr")
        if len(rows) < 5:
            continue

        # Skip tables with fewer than 5 rows that contain numbers (e.g. signature tables, small TOC)
        num_numeric_rows = sum(1 for r in rows if re.search(r"\d", r.get_text()))
        if num_numeric_rows < 5:
            continue

        t_text = t.get_text().lower()
        # Skip table of contents
        if "index to" in t_text or "table of contents" in t_text:
            continue

        # Walk preceding strings up to ~600 characters
        prev_nodes: list[str] = []
        for s in t.find_all_previous(string=True):
            txt = s.strip()
            if txt:
                prev_nodes.append(txt)
                if sum(len(x) for x in prev_nodes) > 600:
                    break
        prev_text = " ".join(reversed(prev_nodes))
        top_rows_text = " ".join(r.get_text(separator=" ", strip=True) for r in rows[:6])

        # Scale detection: millions -> 1_000_000, thousands -> 1_000, else 1 (an undetected scale is
        # caught downstream: scoring/validation.py sends it to a human).
        scale = 1
        combined_text = re.sub(r"\s+", " ", (prev_text + " " + top_rows_text).lower())
        if SCALE_MILLIONS.search(combined_text):
            scale = 1_000_000
        elif SCALE_THOUSANDS.search(combined_text):
            scale = 1_000

        close_text = prev_text[-250:]

        # Income Statement
        if "income_statement" not in located and _looks_like("income_statement", t_text):
            for pat in INCOME_PATTERNS:
                m = re.search(pat, close_text, re.I)
                if m:
                    surrounding = close_text[max(0, m.start()-30):min(len(close_text), m.end()+40)].lower()
                    # No "comprehensive" exclusion: a combined "Statements of Operations & Other
                    # Comprehensive Income" is the income statement, and a standalone comprehensive-
                    # income statement has no revenue line, so _looks_like() already rejects it.
                    if "percentage" not in surrounding and "certain items in" not in surrounding:
                        located["income_statement"] = {
                            "index": idx,
                            "heading": m.group(0).strip(),
                            "scale": scale,
                            "html": str(t),
                        }
                        break

        # Balance Sheet
        if "balance_sheet" not in located and _looks_like("balance_sheet", t_text):
            for pat in BALANCE_PATTERNS:
                m = re.search(pat, close_text, re.I)
                if m:
                    surrounding = close_text[max(0, m.start()-30):min(len(close_text), m.end()+40)].lower()
                    if "comprehensive" not in surrounding and "off-balance" not in surrounding and "certain balance" not in surrounding:
                        located["balance_sheet"] = {
                            "index": idx,
                            "heading": m.group(0).strip(),
                            "scale": scale,
                            "html": str(t),
                        }
                        break

        # Cash Flow Statement
        if "cash_flow" not in located and _looks_like("cash_flow", t_text):
            for pat in CASH_FLOW_PATTERNS:
                m = re.search(pat, close_text, re.I)
                if m:
                    located["cash_flow"] = {
                        "index": idx,
                        "heading": m.group(0).strip(),
                        "scale": scale,
                        "html": str(t),
                    }
                    break

        # Segment Reporting
        if "segment" not in located:
            is_seg_heading = any(kw in close_text.lower() for kw in [
                "segment revenue", "segment results", "reportable segment",
                "segment information", "segments of operations", "company's segments",
                "information by segment", "by reportable segment"
            ]) or ("segment" in close_text.lower() and "note" in close_text.lower())
            if is_seg_heading and ("revenue" in t_text or "sales" in t_text):
                located["segment"] = {
                    "index": idx,
                    "heading": "Segment Reporting",
                    "scale": scale,
                    "html": str(t),
                }

    return located


if __name__ == "__main__":
    from edgar.client import TICKERS, get_cik, get_latest_10k, get_primary_doc
    from extract.clean import strip_ixbrl

    print("=" * 80)
    print(f"{'TICKER':<8} {'STATEMENT':<18} {'TABLE #':<10} {'SCALE':<12} {'HEADING'}")
    print("-" * 80)

    for ticker in TICKERS:
        cik = get_cik(ticker)
        meta = get_latest_10k(cik)
        raw_html = get_primary_doc(cik, meta["accession"], meta["primary_document"])
        clean_html = strip_ixbrl(raw_html)
        tables = locate_statements(clean_html)

        for st_name in ["income_statement", "balance_sheet", "cash_flow", "segment"]:
            if st_name in tables:
                info = tables[st_name]
                print(f"{ticker:<8} {st_name:<18} #{info['index']:<9} {info['scale']:<12} {info['heading']}")
            else:
                print(f"{ticker:<8} {st_name:<18} {'NOT FOUND':<10} {'-':<12} -")

        assert "income_statement" in tables, f"Missing income_statement for {ticker}"
        assert "balance_sheet" in tables, f"Missing balance_sheet for {ticker}"
        assert "cash_flow" in tables, f"Missing cash_flow for {ticker}"

    print("=" * 80)
    print("[locate] ALL 5 COMPANIES LOCATED ALL 3 PRIMARY STATEMENTS SUCCESSFULLY!")

