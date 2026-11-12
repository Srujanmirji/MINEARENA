"""Extractor B: LLM-based financial extractor with strict JSON and snippet verification.

Rules:
- Reject any LLM extraction whose snippet isn't found word-for-word in the table.
- Falls back to empty dict if LLM is unavailable or fails twice.
"""
from __future__ import annotations

import re
from bs4 import BeautifulSoup

from core.config import SYNONYMS
from extract.llm import ask_json
from extract.prompts import EXTRACTION_PROMPT


def _table_to_plain_text(table_html: str) -> str:
    """Convert HTML table to plain text with rows on newlines and cells separated by ' | '."""
    soup = BeautifulSoup(table_html, "lxml")
    table = soup.find("table")
    if not table:
        return ""

    rows_text: list[str] = []
    for tr in table.find_all("tr"):
        cells = [re.sub(r"\s+", " ", cell.get_text().strip()) for cell in tr.find_all(["td", "th"])]
        cells_clean = [c for c in cells if c]
        if cells_clean:
            rows_text.append(" | ".join(cells_clean))
    return "\n".join(rows_text)


def extract_with_llm(table_html: str, target_metrics: list[str]) -> dict[str, dict]:
    """Extract metrics from table HTML using LLM.

    Verifies returned snippet word-for-word against the table text.
    Rejects any unverified items.
    """
    table_text = _table_to_plain_text(table_html)
    if not table_text:
        return {}

    metrics_with_syns = []
    for m in target_metrics:
        syns = ", ".join(SYNONYMS.get(m, []))
        metrics_with_syns.append(f"{m} (labels: {syns})")
    metrics_str = "; ".join(metrics_with_syns)

    prompt = EXTRACTION_PROMPT.format(
        table_text=table_text,
        metrics_with_synonyms=metrics_str,
    )

    try:
        data = ask_json(prompt)
    except Exception as e:
        print(f"[llm_extractor] LLM failed ({e}), falling back to parser-only mode")
        return {}

    norm_table = re.sub(r"\s+", " ", table_text).lower()

    verified_items: dict[str, dict] = {}
    for item in data.get("items", []):
        m = item.get("metric")
        if not m or m not in target_metrics:
            continue

        raw_snippet = item.get("snippet", "")
        norm_snippet = re.sub(r"\s+", " ", raw_snippet).strip().lower()

        # Reject any item whose snippet isn't found word-for-word in the table
        if not norm_snippet or norm_snippet not in norm_table:
            print(f"[llm_extractor] REJECTED {m}: snippet '{raw_snippet}' not found verbatim in table")
            continue

        try:
            curr_val = float(item["current_value"]) if item.get("current_value") is not None else None
            prior_val = float(item["prior_value"]) if item.get("prior_value") is not None else None
        except (ValueError, TypeError):
            continue

        verified_items[m] = {
            "value": curr_val,
            "prior_value": prior_val,
            "row_label": item.get("row_label", ""),
            "source_snippet": raw_snippet,
            "column_header": item.get("column_header", ""),
        }

    return verified_items


if __name__ == "__main__":
    test_html = """
    <table>
      <tr><th>Line Item</th><th>2024</th><th>2023</th></tr>
      <tr><td>Total net sales</td><td>$ 391,035</td><td>$ 383,285</td></tr>
    </table>
    """
    print("[llm_extractor] Plain text preview:")
    print(_table_to_plain_text(test_html))
    print("[llm_extractor] Smoke test complete.")

