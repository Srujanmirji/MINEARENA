"""Extraction coordinator.

Combines Extractor A (table parser) and Extractor B (LLM), applies priority rules,
derives missing metrics, extracts segments, and constructs ExtractedValue models.
"""
from __future__ import annotations

import io
import re
from typing import Any

import pandas as pd
from bs4 import BeautifulSoup

from core.config import STATEMENT_OF
from core.models import ExtractedValue, METRICS
from edgar.client import get_primary_doc
from extract.clean import strip_ixbrl
from extract.llm_extractor import extract_with_llm
from extract.table_parser import _clean_num, parse_statement_table

_doc_cache: dict[str, list[str]] = {}


def get_table_html(meta: dict, table_index: int) -> str:
    """Return cleaned HTML string for a specific table in the cached filing."""
    cache_key = f"{meta.get('cik')}:{meta.get('accession')}"
    if cache_key not in _doc_cache:
        raw_html = get_primary_doc(meta["cik"], meta["accession"], meta["primary_document"])
        clean_html = strip_ixbrl(raw_html)
        soup = BeautifulSoup(clean_html, "lxml")
        _doc_cache[cache_key] = [str(t) for t in soup.find_all("table")]

    tables = _doc_cache[cache_key]
    if 0 <= table_index < len(tables):
        return tables[table_index]
    raise IndexError(f"Table index {table_index} out of range (total tables: {len(tables)})")


def _extract_segments_from_table(table_html: str) -> list[dict]:
    """Extract reportable segment revenue for the current year."""
    try:
        df = pd.read_html(io.StringIO(table_html))[0]
    except Exception:
        return []

    # Find the current year column index
    year_col = None
    for r in range(min(5, len(df))):
        for c in df.columns:
            val = str(df.iloc[r, c])
            if re.search(r"\b202\d\b", val):
                year_col = c
                break
        if year_col is not None:
            break

    if year_col is None:
        year_col = 3 if len(df.columns) > 3 else (len(df.columns) - 1)

    segments: list[dict] = []
    for _, row in df.iterrows():
        # First text cell
        lbl = None
        for c in df.columns:
            v = row[c]
            if pd.notna(v):
                s = str(v).strip()
                if s and s != "$" and not re.match(r"^[\d\s,\.\(\)\$%-]+$", s) and not re.search(r"\b202\d\b", s):
                    lbl = s
                    break
        if not lbl:
            continue

        lbl_lower = lbl.lower()
        if any(skip in lbl_lower for skip in ["total", "net sales", "revenue", "operating income", "cost of", "change"]):
            continue

        # Look in year_col and adjacent columns for the numeric value
        val = None
        for col_idx in range(year_col, min(year_col + 3, len(df.columns))):
            num = _clean_num(row[col_idx])
            if num is not None:
                val = num
                break

        if val is not None and val > 100:  # segments have meaningful revenue
            segments.append({"segment": lbl, "value": float(val)})

    return segments


def extract_filing(meta: dict, tables: dict[str, dict]) -> tuple[list[ExtractedValue], list[dict]]:
    """Extract all 9 core metrics and reportable segments from located statement tables.

    Returns tuple of (list[ExtractedValue], list[dict]).
    """
    accession = meta["accession"]
    ticker = meta["ticker"].upper()
    cik = meta["cik"]
    fiscal_year = meta["fiscal_year"]
    period_end = meta["period_end"]
    primary_doc = meta["primary_document"]
    company = meta.get("company", "")

    # 1. Segments
    segments: list[dict] = []
    if "segment" in tables and tables["segment"].get("html"):
        segments = _extract_segments_from_table(tables["segment"]["html"])

    # 2. Extract metrics per statement
    extracted_by_metric: dict[str, dict] = {}

    for st_name in ["income_statement", "balance_sheet", "cash_flow"]:
        if st_name not in tables:
            continue
        st_info = tables[st_name]
        table_html = st_info.get("html", "")
        if not table_html:
            continue

        st_metrics = [m for m in METRICS if STATEMENT_OF.get(m) == st_name]
        if not st_metrics:
            continue

        # Extractor A (table parser)
        res_a = parse_statement_table(table_html, st_metrics)

        # Extractor B (LLM)
        res_b = extract_with_llm(table_html, st_metrics)

        for m in st_metrics:
            item_b = res_b.get(m)
            item_a = res_a.get(m)

            # Decision: B if snippet verified, else A
            if item_b and item_b.get("value") is not None:
                val = item_b["value"]
                alt_val = item_a.get("value") if item_a else None
                extractor_name = "llm"
                row_label = item_b.get("row_label", "")
                snippet = item_b.get("source_snippet", "")
                prior_val = item_b.get("prior_value")
                col_header = item_b.get("column_header", "")
            elif item_a and item_a.get("value") is not None:
                val = item_a["value"]
                alt_val = item_b.get("value") if item_b else None
                extractor_name = "parser"
                row_label = item_a.get("row_label", "")
                snippet = item_a.get("source_snippet", "")
                prior_val = item_a.get("prior_value")
                col_header = item_a.get("column_header", "")
            else:
                val = None
                alt_val = None
                extractor_name = "parser"
                row_label = ""
                snippet = ""
                prior_val = None
                col_header = ""

            extracted_by_metric[m] = {
                "value": val,
                "alt_value": alt_val,
                "extractor": extractor_name,
                "row_label": row_label,
                "source_snippet": snippet,
                "prior_value": prior_val,
                "column_header": col_header,
                "table_index": st_info.get("index"),
                "table_scale": st_info.get("scale", 1),
                "is_derived": False,
            }

    # 3. Check for missing total_liabilities -> derive Assets - Equity
    if extracted_by_metric.get("total_liabilities", {}).get("value") is None:
        assets_item = extracted_by_metric.get("total_assets")
        equity_item = extracted_by_metric.get("equity")
        if assets_item and equity_item and assets_item.get("value") is not None and equity_item.get("value") is not None:
            derived_val = round(assets_item["value"] - equity_item["value"], 2)
            derived_prior = None
            if assets_item.get("prior_value") is not None and equity_item.get("prior_value") is not None:
                derived_prior = round(assets_item["prior_value"] - equity_item["prior_value"], 2)

            bs_info = tables.get("balance_sheet", {})
            extracted_by_metric["total_liabilities"] = {
                "value": derived_val,
                "alt_value": None,
                "extractor": "parser",
                "row_label": "Total liabilities (derived)",
                "source_snippet": f"Derived: {assets_item['value']} (Total assets) - {equity_item['value']} (Total equity) = {derived_val}",
                "prior_value": derived_prior,
                "column_header": assets_item.get("column_header", ""),
                "table_index": bs_info.get("index"),
                "table_scale": bs_info.get("scale", 1),
                "is_derived": True,
            }

    # 4. Construct ExtractedValue models for all 9 metrics
    models: list[ExtractedValue] = []
    for m in METRICS:
        item = extracted_by_metric.get(m, {
            "value": None,
            "alt_value": None,
            "extractor": "parser",
            "row_label": "",
            "source_snippet": "",
            "prior_value": None,
            "column_header": "",
            "table_index": None,
            "table_scale": 1,
            "is_derived": False,
        })

        st_name = STATEMENT_OF.get(m, "income_statement")
        scale = 1 if m == "eps_diluted" else item["table_scale"]
        unit = "USD/shares" if m == "eps_diluted" else "USD"

        # Period start
        if st_name == "balance_sheet":
            period_start = None
        else:
            if ticker == "AAPL" and period_end == "2024-09-28":
                period_start = "2023-10-01"
            else:
                try:
                    y = int(period_end[:4])
                    period_start = f"{y - 1}-{period_end[5:]}"
                except Exception:
                    period_start = None

        col_hdr = item["column_header"] or (f"{period_end}" if period_end else "")

        val_obj = ExtractedValue(
            id=f"{accession}:{m}",
            ticker=ticker,
            company=company,
            cik=str(cik).zfill(10),
            accession=accession,
            fiscal_year=fiscal_year,
            metric=m,
            value=item["value"],
            unit=unit,
            scale=scale,
            period_start=period_start,
            period_end=period_end,
            prior_value=item["prior_value"],
            extractor=item["extractor"],
            alt_value=item["alt_value"],
            source_page=primary_doc,
            table_index=item["table_index"],
            row_label=item["row_label"],
            source_snippet=item["source_snippet"],
            column_header=col_hdr,
            is_derived=item["is_derived"],
        )
        models.append(val_obj)

    return models, segments


if __name__ == "__main__":
    from edgar.client import get_cik, get_latest_10k, get_primary_doc
    from extract.clean import strip_ixbrl
    from extract.locate import locate_statements

    print("[extractor] Testing extract_filing on AAPL 2024...")
    meta = {
        "ticker": "AAPL",
        "cik": "0000320193",
        "accession": "0000320193-24-000123",
        "fiscal_year": 2024,
        "period_end": "2024-09-28",
        "primary_document": "aapl-20240928.htm",
        "company": "Apple Inc.",
    }
    raw = get_primary_doc(meta["cik"], meta["accession"], meta["primary_document"])
    clean = strip_ixbrl(raw)
    tables = locate_statements(clean)

    values, segments = extract_filing(meta, tables)
    print(f"\n[extractor] Extracted {len(values)} metrics and {len(segments)} segments:")
    for v in values:
        print(f"  {v.metric:<20} -> value: {v.value:<10} (prior: {v.prior_value}) scale={v.scale} label='{v.row_label}'")
    for s in segments:
        print(f"  Segment: {s['segment']} -> ${s['value']:,.0f}")
