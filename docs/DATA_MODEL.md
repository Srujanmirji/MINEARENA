# Data Model — AuditLoop

`core/models.py` is the contract between all 4 people. Merge it first (by 1:45 PM). After that, **change it only after posting in the group chat**.

## 1. `core/models.py`

```python
from typing import Literal
from pydantic import BaseModel, Field

Metric = Literal[
    "revenue", "net_income", "total_assets", "total_liabilities",
    "equity", "operating_cash_flow", "cash", "eps_diluted",
]

Status = Literal[
    "extracted",        # just extracted, not scored yet
    "auto_approved",    # passed threshold + all checks
    "escalated",        # waiting for a human
    "approved",         # human approved as-is
    "corrected",        # human changed the value
    "rejected",         # human rejected it (no usable value)
]

METRICS: list[str] = [
    "revenue", "net_income", "total_assets", "total_liabilities",
    "equity", "operating_cash_flow", "cash", "eps_diluted",
]


class ExtractedValue(BaseModel):
    id: str                                  # f"{accession}:{metric}" — idempotency key
    ticker: str
    company: str
    cik: str                                 # 10-digit, zero-padded
    accession: str                           # "0000320193-24-000123"
    fiscal_year: int
    metric: Metric

    value: float | None                      # as shown in the table (e.g. 391035 when "in millions")
    unit: str = "USD"                        # "USD" or "USD/shares" for EPS
    scale: int = 1                           # 1_000_000 if "in millions"; 1 for EPS
    period_start: str | None = None          # ISO date; None for balance-sheet (instant) items
    period_end: str                          # ISO date

    prior_value: float | None = None         # same metric, prior-year column (for YoY)
    alt_value: float | None = None           # value picked by the fuzzy method (for agreement)

    source_page: str                         # "R5.htm"
    row_label: str = ""                      # "Total net sales"
    source_snippet: str = ""                 # exact row text incl. numbers
    column_header: str = ""                  # "Sep. 28, 2024"

    confidence: float = 0.0
    signals: dict[str, float] = Field(default_factory=dict)   # verbatim, label, scale, period, agreement
    validation: list[dict] = Field(default_factory=list)      # [{"check","status","detail"}], status: passed|failed|na
    status: Status = "extracted"
    escalation_reason: str | None = None
    final_value: float | None = None         # value after auto-approval / human decision
    is_derived: bool = False                 # True if computed (e.g. liabilities = L&E − equity)

    def full_value(self) -> float | None:
        """Value in base units (dollars), for comparing with XBRL."""
        v = self.final_value if self.final_value is not None else self.value
        return None if v is None else v * self.scale


class Decision(BaseModel):
    decision_id: str                         # uuid4, created by the UI once per card
    thread_id: str
    value_id: str
    action: Literal["approve", "correct", "reject"]
    new_value: float | None = None           # required when action == "correct"
    reviewer: str = "reviewer"
    note: str | None = None
```

## 2. `data/mock_values.json`

About 20 fake `ExtractedValue` rows so the UI (Srujan) and scoring (Sai) can start before real extraction exists. Include:

- 8 clean AAPL-like values (high signals, all checks pass)
- 4 values with a low `label` signal
- 3 values that break A = L + E
- 2 with a big YoY change
- 1 derived total liabilities (`is_derived: true`)
- 2 with `value: null`

Example row:

```json
{
  "id": "0000320193-24-000123:revenue",
  "ticker": "AAPL", "company": "Apple Inc.", "cik": "0000320193",
  "accession": "0000320193-24-000123", "fiscal_year": 2024,
  "metric": "revenue", "value": 391035, "unit": "USD", "scale": 1000000,
  "period_start": "2023-10-01", "period_end": "2024-09-28",
  "prior_value": 383285, "alt_value": 391035,
  "source_page": "R3.htm", "row_label": "Total net sales",
  "source_snippet": "Total net sales | 391,035 | 383,285 | 394,328",
  "column_header": "Sep. 28, 2024",
  "confidence": 0.0, "signals": {}, "validation": [],
  "status": "extracted", "escalation_reason": null,
  "final_value": null, "is_derived": false
}
```

> Mock numbers are placeholders for wiring only. Never present them as real figures.

## 3. SQLite — `data/app.db`

```sql
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS filings (
  accession     TEXT PRIMARY KEY,
  ticker        TEXT NOT NULL,
  cik           TEXT NOT NULL,
  company       TEXT,
  fiscal_year   INTEGER NOT NULL,
  period_end    TEXT NOT NULL,
  pages_json    TEXT,                 -- {"balance_sheet": "R5.htm", ...}
  fetched_at    TEXT NOT NULL
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
  alt_value         REAL,
  source_page       TEXT,
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
  decision_id  TEXT PRIMARY KEY,
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
  decision_id      TEXT UNIQUE NOT NULL,
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
  pct_error    REAL,
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
-- seeds: threshold=0.85, yoy_threshold=0.30, threshold:<metric>=0.85 (adaptive, bonus)
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
| revenue | `Revenues`, `RevenueFromContractWithCustomerExcludingAssessedTax`, `SalesRevenueNet`, `RevenuesNetOfInterestExpense` | USD | duration |
| net_income | `NetIncomeLoss` | USD | duration |
| total_assets | `Assets` | USD | instant |
| total_liabilities | `Liabilities` | USD | instant |
| equity | `StockholdersEquity`, `StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest` | USD | instant |
| operating_cash_flow | `NetCashProvidedByUsedInOperatingActivities` | USD | duration |
| cash | `CashAndCashEquivalentsAtCarryingValue` | USD | instant |
| eps_diluted | `EarningsPerShareDiluted` | USD/shares | duration |

**Matching a fact:** `facts["us-gaap"][tag]["units"][unit]` → keep entries where `accn == accession` and `end == period_end`. For duration metrics also require `start` ≈ `end − 1 year` (± 10 days). No match → `match = NULL` ("no ground truth"), shown separately in the report.

## 5. Metric synonyms (used by `extract/` and `scoring/`)

| Metric | Row label synonyms |
|---|---|
| revenue | total net sales, net sales, total revenues, revenue, total net revenue, net revenues |
| net_income | net income, net earnings, net income attributable to common stockholders |
| total_assets | total assets |
| total_liabilities | total liabilities |
| equity | total shareholders' equity, total stockholders' equity, total equity |
| operating_cash_flow | net cash provided by operating activities, cash generated by operating activities, net cash from operating activities |
| cash | cash and cash equivalents |
| eps_diluted | diluted, diluted earnings per share, diluted net income per share |

Put these in `core/config.py` as `SYNONYMS: dict[str, list[str]]` so Mayur and Sai use the same list.
