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
        top_rows_text = " ".join(r.get_text(separator=" ", strip=True) for r in rows[:3])

        # Scale detection: "in millions" -> 1_000_000, "in thousands" -> 1_000, else 1
        scale = 1
        combined_text = (prev_text + " " + top_rows_text).lower()
        if re.search(r"\b(in\s+millions|amounts\s+in\s+millions|dollars\s+in\s+millions)\b", combined_text):
            scale = 1_000_000
        elif re.search(r"\b(in\s+thousands|amounts\s+in\s+thousands|dollars\s+in\s+thousands)\b", combined_text):
            scale = 1_000

        close_text = prev_text[-250:]

        # Income Statement
        if "income_statement" not in located:
            for pat in INCOME_PATTERNS:
                m = re.search(pat, close_text, re.I)
                if m:
                    surrounding = close_text[max(0, m.start()-30):min(len(close_text), m.end()+40)].lower()
                    if "comprehensive" not in surrounding and "percentage" not in surrounding and "certain items in" not in surrounding:
                        located["income_statement"] = {
                            "index": idx,
                            "heading": m.group(0).strip(),
                            "scale": scale,
                            "html": str(t),
                        }
                        break

        # Balance Sheet
        if "balance_sheet" not in located:
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
        if "cash_flow" not in located:
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
            is_seg_heading = any(kw in close_text.lower() for kw in ["segment revenue", "segment results", "reportable segment", "segment information", "segments of operations"]) or \
                             ("segment" in close_text.lower() and "note" in close_text.lower())
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
