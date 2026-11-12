"""Extractor A: deterministic table parser using pandas and rapidfuzz.

Extracts metrics from cleaned 10-K statement tables using synonym matching,
date column alignment, and cell cleaning.
"""
from __future__ import annotations

import io
import re
from typing import Any

import pandas as pd
from bs4 import BeautifulSoup
from rapidfuzz import fuzz

from core.config import SYNONYMS


def _clean_num(val: Any) -> float | None:
    """Clean table cell to float: handles $ 1,234, (1,234) -> -1234, commas, whitespace."""
    if pd.isna(val):
        return None
    s = str(val).strip()
    if not s or s == "$":
        return None

    neg = False
    if s.startswith("(") and s.endswith(")"):
        neg = True
        s = s[1:-1].strip()
    elif s.startswith("—") or s == "-":
        return 0.0

    s = s.replace("$", "").replace(",", "").replace("\xa0", " ").strip()
    try:
        f = float(s)
        return -f if neg else f
    except ValueError:
        return None


TOTAL_REVENUE_LABELS = {"total revenues", "total revenue", "total net revenues", "total net revenue", "total net sales"}
# "Total Walmart shareholders' equity": the parent's equity, which is what XBRL StockholdersEquity reports.
PARENT_EQUITY = re.compile(r"^total (?!shareholders|stockholders|shareowners)[\w.&' ]+ (shareholders|stockholders|shareowners)['’] equity$")


# Not one of the 9 metrics: total equity INCLUDING noncontrolling interest, only used to derive
# total liabilities = total liabilities & equity − total equity (tasks/Mayur.md step 5).
EXTRA_SYNONYMS = {"total_equity": ["total equity", "total shareholders' equity", "total stockholders' equity"]}


def label_allowed(metric: str, label: str) -> bool:
    """Rows that can never be this metric. Shared by both extractors (parser and LLM)."""
    lbl = label.lower().strip()
    if metric == "total_equity":
        return "total" in lbl and "equity" in lbl and "liabilities" not in lbl and "noncontrolling" not in lbl
    if metric == "eps_diluted":
        return "diluted" in lbl
    if metric == "total_liabilities":
        return "total" in lbl and "current" not in lbl and "equity" not in lbl and " and " not in lbl
    if metric == "net_income":  # parent's net income: never the NCI share, per-share or operating rows
        return not any(w in lbl for w in ("interest", "operating", "per share", "per common share", "weighted"))
    if metric == "equity":
        return "noncontrolling" not in lbl and "liabilities" not in lbl and "method" not in lbl
    if metric == "revenue":
        return "cost" not in lbl
    return True


def label_bonus(metric: str, label: str) -> float | None:
    """Score floor for rows that are clearly the right one, so they beat generic synonym matches."""
    lbl = label.lower().strip()
    if metric == "net_income" and "attributable to" in lbl:
        return 1.01  # "attributable to Walmart / common stockholders" beats an exact "Net income" (1.0)
    if metric == "net_income" and "net income" in lbl:
        return 0.95
    if metric == "eps_diluted" and "diluted" in lbl and ("per share" in lbl or "per common share" in lbl or lbl == "diluted"):
        return 0.95
    if metric == "total_liabilities" and lbl == "total liabilities":
        return 1.0
    if metric == "equity" and (PARENT_EQUITY.match(lbl) or ("equity" in lbl and "attributable to" in lbl)):
        # The parent's equity ("Total Walmart shareholders' equity", "Equity Attributable to
        # Shareowners of The Coca-Cola Company") beats a generic total that includes NCI.
        return 1.01
    if metric == "revenue" and lbl in TOTAL_REVENUE_LABELS:
        return 1.01  # "Total revenues" beats a line item like "Net sales" or "Automotive sales"
    return None


def parse_statement_table(table_html: str, target_metrics: list[str]) -> dict[str, dict]:
    """Parse one statement table HTML and extract target metrics.

    Returns dict mapping metric name to dict with:
    value, prior_value, row_label, source_snippet, column_header, score
    """
    df = pd.read_html(io.StringIO(table_html))[0]

    # 1. Identify date / period columns from top header rows, normalized to 4-digit year
    col_years: dict[int, str] = {}
    for r_idx in range(min(6, len(df))):
        for c_idx in df.columns:
            val = str(df.iloc[r_idx, c_idx])
            m = re.search(r"\b(202\d|201\d)\b", val)
            if m and c_idx not in col_years:
                col_years[c_idx] = m.group(0)

    # Group columns by normalized year
    year_groups: list[tuple[str, list[int]]] = []
    seen_years: set[str] = set()
    for c_idx in sorted(col_years.keys()):
        y = col_years[c_idx]
        if y not in seen_years:
            seen_years.add(y)
            year_groups.append((y, []))
        year_groups[-1][1].append(c_idx)

    # 2. Extract parsed rows with label, values per date group, and snippet
    soup = BeautifulSoup(table_html, "lxml")
    tr_tags = soup.find_all("tr")

    parsed_rows: list[dict] = []
    for r_idx, row in df.iterrows():
        # Clean tr text for source_snippet
        tr_text = tr_tags[r_idx].get_text(separator=" | ", strip=True) if r_idx < len(tr_tags) else ""
        tr_text = re.sub(r"\s+", " ", tr_text)
        tr_text = re.sub(r"(\s*\|\s*)+", " | ", tr_text).strip(" |")

        # Row label is first non-numeric text column
        label: str | None = None
        for c_idx in df.columns:
            val = row[c_idx]
            if pd.notna(val):
                s = str(val).strip()
                if s and s != "$" and not re.match(r"^[\d\s,\.\(\)\$%-]+$", s) and not re.search(r"\b(202\d|201\d)\b", s):
                    label = s
                    break

        if not label:
            continue

        # Extract values for year groups (group 0 = current year, group 1 = prior year)
        vals_by_group: list[float | None] = []
        for _, cols in year_groups:
            g_val: float | None = None
            for c in cols:
                cn = _clean_num(row[c])
                if cn is not None:
                    g_val = cn
                    break
            vals_by_group.append(g_val)

        # Fallback if no year groups detected
        if not year_groups:
            seq_nums: list[float] = []
            for c in df.columns:
                cn = _clean_num(row[c])
                if cn is not None and (not seq_nums or seq_nums[-1] != cn):
                    seq_nums.append(cn)
            vals_by_group = seq_nums

        if any(v is not None for v in vals_by_group):
            hist = {y: v for (y, _), v in zip(year_groups, vals_by_group) if v is not None}
            parsed_rows.append({
                "label": label,
                "values": vals_by_group,
                "history": hist,
                "snippet": tr_text,
                "header": year_groups[0][0] if year_groups else "",
            })

    # 3. Match metrics using rapidfuzz against SYNONYMS with semantic filtering
    results: dict[str, dict] = {}
    for metric in target_metrics:
        syns = SYNONYMS.get(metric) or EXTRA_SYNONYMS.get(metric, [metric])
        best_row: dict | None = None
        best_score = -1.0

        for r in parsed_rows:
            lbl = r["label"].lower().strip()

            # Rule filters to prevent false positive matches
            if not label_allowed(metric, lbl):
                continue
            if metric == "eps_diluted" and r["values"] and r["values"][0] is not None and abs(r["values"][0]) > 1000:
                continue

            # rapidfuzz ratio, raised for rows that are clearly the right one
            score = max(fuzz.ratio(lbl, s.lower()) / 100.0 for s in syns)
            bonus = label_bonus(metric, lbl)
            if bonus is not None:
                score = max(score, bonus)

            if score > best_score:
                best_score = score
                best_row = r

        if best_row and best_score >= 0.70:
            val = best_row["values"][0] if len(best_row["values"]) > 0 else None
            prior = best_row["values"][1] if len(best_row["values"]) > 1 else None
            results[metric] = {
                "value": val,
                "prior_value": prior,
                "history": best_row.get("history", {}),
                "row_label": best_row["label"],
                "source_snippet": best_row["snippet"],
                "column_header": best_row["header"],
                "score": best_score,
            }

    return results


if __name__ == "__main__":
    from edgar.client import get_cik, get_latest_10k, get_primary_doc
    from extract.clean import strip_ixbrl
    from extract.locate import locate_statements

    print("[table_parser] Smoke testing Extractor A on AAPL...")
    cik = get_cik("AAPL")
    meta = get_latest_10k(cik)
    clean = strip_ixbrl(get_primary_doc(cik, meta["accession"], meta["primary_document"]))
    tables = locate_statements(clean)

    res = parse_statement_table(tables["income_statement"]["html"], ["revenue", "operating_income", "net_income", "eps_diluted"])
    print("[table_parser] Extracted income metrics:", res)
    assert "revenue" in res
    print("[table_parser] Smoke test PASSED!")

