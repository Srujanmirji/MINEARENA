# Data Model — AuditLoop

`core/models.py` is the contract between all 4 people. **Change it only after posting in the group chat.**

## 1. `core/models.py`

```python
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
    signals: dict[str, float] = Field(default_factory=dict)   # agreement, label, period_unit
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
```

**Why `decision_id` is deterministic:** each value can be decided exactly once (by the system or a human). Using `thread_id:value_id` as the key means a double-click, a page refresh or a resumed node can never write a second row, and the UI doesn't need to generate anything.

## 2. `data/mock_values.json`

21 rows already in the repo. Each row has a `_source` field (ignored by Pydantic):

- **9 REAL rows:** Apple FY2024 10-K (revenue, operating income, net income, diluted EPS, total assets, total liabilities, equity, cash, operating cash flow). Mayur's extractor must reproduce these exactly for AAPL.
- **12 SYNTHETIC rows** ("Mock Industries" and "Mock Bank", clearly labelled): A = L + E off by 2%, revenue +120% YoY, weak label match, missing value, extractors disagree, bank with no plain revenue line, derived liabilities, missing EPS.

> Synthetic rows are for wiring and tests only. They never appear in the demo.

## 3. SQLite — `data/app.db`

```sql
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS filings (
  accession         TEXT PRIMARY KEY,
  ticker            TEXT NOT NULL,
  cik               TEXT NOT NULL,
  company           TEXT,
  fiscal_year       INTEGER NOT NULL,
  period_end        TEXT NOT NULL,
  primary_document  TEXT NOT NULL,     -- e.g. aapl-20240928.htm
  tables_json       TEXT,              -- {"balance_sheet": 41, "income_statement": 38, ...} table indexes
  fetched_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS extracted_values (
  id                TEXT PRIMARY KEY,  -- accession:metric
  thread_id         TEXT NOT NULL,
  ticker            TEXT NOT NULL,
  accession         TEXT NOT NULL,
  metric            TEXT NOT NULL,
  value             REAL,
  scale             INTEGER NOT NULL DEFAULT 1,
  unit              TEXT NOT NULL DEFAULT 'USD',
  period_start      TEXT,
  period_end        TEXT NOT NULL,
  prior_value       REAL,
  extractor         TEXT,
  alt_value         REAL,
  source_page       TEXT,
  table_index       INTEGER,
  row_label         TEXT,
  source_snippet    TEXT,
  confidence        REAL NOT NULL DEFAULT 0,
  signals_json      TEXT NOT NULL DEFAULT '{}',
  validation_json   TEXT NOT NULL DEFAULT '[]',
  status            TEXT NOT NULL DEFAULT 'extracted',
  escalation_reason TEXT,
  final_value       REAL,
  is_derived        INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_decisions (
  decision_id  TEXT PRIMARY KEY,        -- thread_id:value_id
  thread_id    TEXT NOT NULL,
  value_id     TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('approve','correct','reject')),
  new_value    REAL,
  reviewer     TEXT NOT NULL,
  note         TEXT,
  ts           TEXT NOT NULL
);

-- Append-only audit log (owner: Srujan)
CREATE TABLE IF NOT EXISTS audit_log (
  seq              INTEGER PRIMARY KEY AUTOINCREMENT,
  ts               TEXT NOT NULL,
  decision_id      TEXT UNIQUE NOT NULL,  -- thread_id:value_id (idempotency key)
  thread_id        TEXT NOT NULL,
  value_id         TEXT NOT NULL,
  metric           TEXT NOT NULL,
  original_value   REAL,
  corrected_value  REAL,
  decision         TEXT NOT NULL CHECK (decision IN ('approved','corrected','rejected','auto_approved')),
  reviewer         TEXT NOT NULL,
  reason           TEXT,
  prev_hash        TEXT NOT NULL,
  hash             TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;

CREATE TABLE IF NOT EXISTS verification (
  value_id     TEXT PRIMARY KEY,
  xbrl_tag     TEXT,
  xbrl_value   REAL,                    -- base units (dollars or USD/share)
  our_value    REAL,                    -- base units, final value
  orig_value   REAL,                    -- base units, value before review
  match        INTEGER,                 -- 1 / 0 / NULL (no ground truth)
  orig_match   INTEGER,
  abs_error    REAL,
  verified_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run_reports (
  thread_id    TEXT PRIMARY KEY,
  report_json  TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
-- seeds: threshold=0.85, yoy_threshold=0.40, equation_tolerance=0.005, threshold:<metric>=0.85 (adaptive, bonus)
```

### Audit hash chain

```python
row_wo_hash = {k: row[k] for k in row if k not in ("seq", "hash")}
hash = sha256((prev_hash + json.dumps(row_wo_hash, sort_keys=True, default=str)).encode()).hexdigest()
# first row: prev_hash = "GENESIS"
```

## 4. Metric → XBRL tag map (used only by `verify/`)

Try tags in order; the first one with a matching fact wins.

| Metric | us-gaap tags | Unit | Kind |
|---|---|---|---|
| revenue | `Revenues`, `RevenueFromContractWithCustomerExcludingAssessedTax`, `SalesRevenueNet` | USD | duration |
| operating_income | `OperatingIncomeLoss` | USD | duration |
| net_income | `NetIncomeLoss` | USD | duration |
| eps_diluted | `EarningsPerShareDiluted` | USD/shares | duration |
| total_assets | `Assets` | USD | instant |
| total_liabilities | `Liabilities` (if missing: no ground truth; our value is derived) | USD | instant |
| equity | `StockholdersEquity`, `StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest` | USD | instant |
| operating_cash_flow | `NetCashProvidedByUsedInOperatingActivities` | USD | duration |
| cash | `CashAndCashEquivalentsAtCarryingValue` | USD | instant |

**Matching a fact:** `facts["us-gaap"][tag]["units"][unit]` → keep entries where `accn == accession`, `form == "10-K"`, `fp == "FY"` and `end == period_end`. For duration metrics also require `start` ≈ `end − 1 year` (± 10 days). No match → `match = NULL` ("no ground truth"), listed separately in the report.

**Correct =** |our − xbrl| ≤ **one unit of the table's scale** (≤ $1M when the table is "in millions"; ≤ $0.01 for EPS).

## 5. Metric synonyms (used by `extract/` and `scoring/`)

| Metric | Statement | Row label synonyms |
|---|---|---|
| revenue | Income | total net sales, net sales, total revenues, revenues, total net revenue, net revenues |
| operating_income | Income | operating income, income from operations, operating profit |
| net_income | Income | net income, net earnings, net income attributable to … (the parent) |
| eps_diluted | Income | diluted, diluted earnings per share, diluted net income per share |
| total_assets | Balance | total assets |
| total_liabilities | Balance | total liabilities |
| equity | Balance | total shareholders' equity, total stockholders' equity, total equity |
| operating_cash_flow | Cash flow | net cash provided by operating activities, cash generated by operating activities, net cash from operating activities |
| cash | Balance | cash and cash equivalents |

Put these in `core/config.py` as `SYNONYMS: dict[str, list[str]]` so Mayur and Srujan use the same list.
