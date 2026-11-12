from typing import Literal
from pydantic import BaseModel, Field

Metric = Literal[
    "revenue", "operating_income", "net_income", "eps_diluted",
    "total_assets", "total_liabilities", "equity",
    "operating_cash_flow", "cash",
]

Status = Literal[
    "extracted",        # just extracted, not scored yet
    "auto_approved",    # score >= threshold and no hard-rule failure
    "escalated",        # waiting for a human
    "approved",         # human approved as-is
    "corrected",        # human changed the value
    "rejected",         # human rejected it (no usable value)
]

METRICS: list[str] = [
    "revenue", "operating_income", "net_income", "eps_diluted",
    "total_assets", "total_liabilities", "equity",
    "operating_cash_flow", "cash",
]   # 9 metrics; the PS requires at least 8


class ExtractedValue(BaseModel):
    id: str                                  # f"{accession}:{metric}" — idempotency key
    ticker: str
    company: str
    cik: str                                 # 10-digit, zero-padded
    accession: str                           # "0000320193-24-000123"
    fiscal_year: int
    metric: Metric

    value: float | None                      # chosen value, as shown in the table (391035 when "in millions")
    unit: str = "USD"                        # "USD" or "USD/shares" for EPS
    scale: int = 1                           # 1_000_000 if "in millions"; 1 for EPS
    period_start: str | None = None          # ISO date; None for balance-sheet (instant) items
    period_end: str                          # ISO date

    prior_value: float | None = None         # same metric, prior-year column (for YoY + scale sanity)
    extractor: str = "llm"                   # which extractor produced `value`: "parser" (A) | "llm" (B)
    alt_value: float | None = None           # the OTHER extractor's answer (for the agreement signal)

    source_page: str                         # primary 10-K file name, e.g. "aapl-20240928.htm"
    table_index: int | None = None           # index of the statement table inside that document
    row_label: str = ""                      # "Total net sales"
    source_snippet: str = ""                 # exact row text incl. numbers — must appear verbatim in the table
    column_header: str = ""                  # "Sep. 28, 2024"

    confidence: float = 0.0
    signals: dict[str, float] = Field(default_factory=dict)   # agreement, label, period_unit, validation
    validation: list[dict] = Field(default_factory=list)      # [{"check","severity","status","detail"}]
    status: Status = "extracted"
    escalation_reason: str | None = None
    final_value: float | None = None         # value after auto-approval / human decision
    is_derived: bool = False                 # True if computed (e.g. liabilities = L&E − equity)

    def full_value(self) -> float | None:
        """Value in base units (dollars), for comparing with XBRL."""
        v = self.final_value if self.final_value is not None else self.value
        return None if v is None else v * self.scale


class Decision(BaseModel):
    decision_id: str                         # f"{thread_id}:{value_id}" — deterministic, set by the API
    thread_id: str
    value_id: str
    action: Literal["approve", "correct", "reject"]
    new_value: float | None = None           # required when action == "correct"
    reviewer: str = "reviewer"
    note: str | None = None                  # required for "correct" and "reject"
