"""Graph state (ARCHITECTURE §3). Holds only JSON-friendly values: dicts, not Pydantic objects."""
from typing import TypedDict


class AuditState(TypedDict, total=False):
    ticker: str
    year: int | None                # fiscal year to audit; None = latest 10-K
    form: str                       # "10-K", or "20-F" for a foreign filer
    cik: str
    accession: str
    fiscal_year: int
    period_end: str                 # "2024-09-28"
    primary_document: str           # "aapl-20240928.htm"
    tables: dict[str, dict]         # {"balance_sheet": {"index": 41, "heading": "...", "scale": 1000000}, ...}
    values: list[dict]              # ExtractedValue.model_dump()
    segments: list[dict]            # [{"segment": "Americas", "value": 167045.0}]
    pending: list[str]              # value ids awaiting review, in order
    decision: dict | None           # set by human_review, consumed by apply_decision
    threshold: float
    report: dict | None
