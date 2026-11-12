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


def parse_statement_table(table_html: str, target_metrics: list[str]) -> dict[str, dict]:
    """Parse one statement table HTML and extract target metrics.

    Returns dict mapping metric name to dict with:
    value, prior_value, row_label, source_snippet, column_header, score
    """
    df = pd.read_html(io.StringIO(table_html))[0]

    # 1. Identify date / period columns from top header rows
    col_dates: dict[int, str] = {}
    for r_idx in range(min(6, len(df))):
        for c_idx in df.columns:
            val = str(df.iloc[r_idx, c_idx])
            m = re.search(r"\b(202\d|201\d)\b", val)
            if m and c_idx not in col_dates:
                col_dates[c_idx] = val

    # Group columns by date
    date_groups: list[tuple[str, list[int]]] = []
    seen_dates: set[str] = set()
    for c_idx in sorted(col_dates.keys()):
        d_val = re.sub(r"\s+", " ", col_dates[c_idx]).strip()
        if d_val not in seen_dates:
            seen_dates.add(d_val)
            date_groups.append((d_val, []))
        date_groups[-1][1].append(c_idx)

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

        # Extract values for date groups (group 0 = current year, group 1 = prior year)
        vals_by_group: list[float | None] = []
        for _, cols in date_groups:
            g_val: float | None = None
            for c in cols:
                cn = _clean_num(row[c])
                if cn is not None:
                    g_val = cn
                    break
            vals_by_group.append(g_val)

        # Fallback if no date groups detected
        if not date_groups:
            seq_nums: list[float] = []
            for c in df.columns:
                cn = _clean_num(row[c])
                if cn is not None and (not seq_nums or seq_nums[-1] != cn):
                    seq_nums.append(cn)
            vals_by_group = seq_nums

        if any(v is not None for v in vals_by_group):
            parsed_rows.append({
                "label": label,
                "values": vals_by_group,
                "snippet": tr_text,
                "header": date_groups[0][0] if date_groups else "",
            })

    # 3. Match metrics using rapidfuzz against SYNONYMS
    results: dict[str, dict] = {}
    for metric in target_metrics:
        syns = SYNONYMS.get(metric, [metric])
        best_row: dict | None = None
        best_score = -1.0

        for r in parsed_rows:
            lbl = r["label"].lower()
            # For eps_diluted, ignore rows representing share counts (> 1000)
            if metric == "eps_diluted":
                if r["values"] and r["values"][0] is not None and abs(r["values"][0]) > 1000:
                    continue
                if "diluted" not in lbl:
                    continue

            # rapidfuzz ratio
            score = max(fuzz.ratio(lbl, s.lower()) / 100.0 for s in syns)
            if score > best_score:
                best_score = score
                best_row = r

        if best_row and best_score >= 0.70:
            val = best_row["values"][0] if len(best_row["values"]) > 0 else None
            prior = best_row["values"][1] if len(best_row["values"]) > 1 else None
            results[metric] = {
                "value": val,
                "prior_value": prior,
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

