# Mayur — P2: SEC Data + Extraction

**GitHub:** `mayurhabib26-hub` · **Folders you own:** `edgar/`, `extract/`, `cache/`
**Read first:** `docs/PRD.md` FR-1 + FR-2, `docs/ARCHITECTURE.md` §8, `docs/DATA_MODEL.md` §1 + §5

## Your mission
Get **real numbers with real evidence** out of the 10-Ks: the right value, its unit, its period and the exact source row. That drives judging criterion 1 (accuracy) and feeds criterion 6 (the source evidence the reviewer sees).

## You depend on
| From | What | When |
|---|---|---|
| Zeeshan | `core/models.py`, `core/config.py` (SYNONYMS, SEC_USER_AGENT) | 1:45 PM |

## Others depend on you
| Who | What | By |
|---|---|---|
| Everyone | `cache/` filled for all 5 companies (incl. Company Facts JSON for Sai) | **3 PM** |
| Zeeshan | `edgar.client` + `edgar.locator` | 4 PM |
| Zeeshan, Sai | `extract.extractor.extract_filing` on real AAPL | **8 PM** |

---

## Timeline

### 1:15–1:45 PM — Setup
- [ ] `.env` with `SEC_USER_AGENT="AuditLoop Team <real email>"` and an LLM key (Gemini; Groq as backup)
- [ ] Open AAPL's `FilingSummary.xml` in a browser to see the format:
  `https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/FilingSummary.xml`

### 1:45–3:00 PM — Client + cache  ⟵ **your checkpoint 3 PM: everything cached**
- [ ] `edgar/cache.py`: `cached_get(url) -> bytes`; file = `cache/sec/<sha256(url)>`; on miss, `httpx.get` with User-Agent, sleep 0.15 s between calls; retry once on 429/5xx
- [ ] `edgar/client.py`:
  - `get_cik(ticker)` via `https://www.sec.gov/files/company_tickers.json` → zero-pad to 10 digits
  - `get_latest_10k(cik)` via `https://data.sec.gov/submissions/CIK{cik}.json`: first index where `form == "10-K"` in `filings.recent`; return `accession`, `fiscal_year`, `period_end` (`reportDate`), `filing_date`
  - `get_filing_summary(cik, accession)` → parse `<Report>` elements → `[{"file": HtmlFileName, "name": ShortName}]`
  - `get_page_html(cik, accession, file)`
  - `get_company_facts(cik)` (download + cache only; **only Sai's `verify/` may call it**)
- [ ] Script `python -m edgar.client --all` caches all 5 companies (AAPL, MSFT, NVDA, TSLA, JPM). Commit `cache/`

Archive folder path uses the CIK **without** leading zeros and the accession **without** dashes:
`https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession.replace('-','')}/FilingSummary.xml`

### 3:00–4:00 PM — Page locator
- [ ] `edgar/locator.py`: `locate_statements(summary) -> {"balance_sheet","income_statement","cash_flow","segment"?}`
  - lowercase names; skip any containing "parenthetical"
  - balance sheet: "balance sheet" or "financial condition"
  - income: "operations" / "income" / "earnings" but **not** "comprehensive"
  - cash flow: "cash flows"
  - segment: "segment" (pick the "details" page with numbers if several; check by eye for AAPL and MSFT)
- [ ] Print a table of what it found for all 5; fix the rules until every company has the first 3

### 4:00–6:00 PM — LLM wrapper + table parsing
- [ ] `extract/llm.py`: `ask_json(prompt, schema) -> dict`; cache in `cache/llm/<sha256(prompt)>.json`; provider from `LLM_PROVIDER`; JSON mode; Pydantic validate; retry once
- [ ] `extract/tables.py`: `parse_statement(html) -> (DataFrame, scale, column_dates)`
  - `pandas.read_html(io.StringIO(html))[0]`
  - scale from header text: "In Millions" → 1_000_000, "In Thousands" → 1_000, else 1. **EPS rows are never scaled**
  - column dates from the header row (e.g. "Sep. 28, 2024")
  - convert "(1,234)" → -1234, "$ 1,234" → 1234

### 6:00–8:00 PM — Extractor  ⟵ **checkpoint 8 PM: real AAPL through the pipeline**
- [ ] `extract/extractor.py`: `extract_filing(meta, pages) -> (values, segments)`
  1. For each statement page: send the table (markdown, first ~60 rows) + metric list + synonyms to the LLM
  2. LLM returns `[{metric, row_label, current_value, prior_value, column_header}]`
  3. **Fuzzy method:** rapidfuzz best match of row labels vs SYNONYMS → `alt_value` from the same column
  4. Build `ExtractedValue`: `id=f"{accession}:{metric}"`, `source_page`, `row_label`, `source_snippet` = the row joined with " | ", `scale`, `period_start/end`, `prior_value`, `alt_value`
  5. `period_end` = the matched column's date; `period_start` = one year earlier for income + cash-flow items, `None` for balance sheet
- [ ] Missing total liabilities? Compute `Total liabilities and equity − Total equity`, set `is_derived=True`, snippet explains it
- [ ] Return all 8 metrics even if `value=None` (the router escalates missing values)

**LLM prompt template** (keep it in `extract/prompts.py`):
```
You are extracting figures from one financial statement table of a US 10-K.
Table (markdown):
{table}
Metrics to find: {metrics_with_synonyms}
Rules:
- Use ONLY numbers that appear in the table. Never compute or guess.
- Return the most recent fiscal year column as current_value and the previous year as prior_value.
- Copy row_label exactly as written in the table.
- If a metric is not in this table, omit it.
Return JSON: {"items": [{"metric": "...", "row_label": "...", "current_value": number, "prior_value": number|null, "column_header": "..."}]}
```

### 8:00–11:00 PM — All 5 + segments
- [ ] Run all 5; print a table metric × company with value + row label; eyeball it
- [ ] Segments: from the segment page, extract `[{"segment": name, "value": revenue}]` for the current year (AAPL, MSFT at least). Return `[]` if unclear; Sai shows N/A
- [ ] Watch for: JPM (no "Revenue" row → it's fine if confidence is low, that's the point), TSLA equity incl./excl. NCI, EPS rows in the income statement

### 11:00 PM–2:30 AM — Fix what Sai's accuracy report shows
- [ ] For every mismatch, decide: extraction bug (fix it) or genuine ambiguity (leave it; the review flow handles it)
- [ ] **Never** look at XBRL values to "fix" extraction. Fix the method, not the number

### 2:30–5:00 AM — Sleep

### 5:00–7:30 AM
- [ ] Re-run all 5 to make sure `cache/` is complete; commit `cache/`
- [ ] Bonus B-2: `extract/explain.py`: 2-sentence AI explanation per YoY anomaly (labelled "AI-generated")

### 7:30 AM onward — Freeze
- [ ] Bug fixes only; rehearse the "why not use XBRL directly?" answer (`docs/DEMO.md`)

---

## Rules you must not break
- No XBRL / Company Facts values anywhere in `extract/`.
- Every SEC request goes through `edgar/cache.py` with the User-Agent.
- Every LLM call goes through `extract/llm.py` (cached).
- `source_snippet` must be the real row text; it's what the reviewer sees.

## Starter prompt for your AI tool
```
I'm Mayur, P2 on the AuditLoop repo. Read CLAUDE.md, docs/ARCHITECTURE.md §8 and docs/DATA_MODEL.md.
I own edgar/, extract/ and cache/. Only edit those.
Task now: <paste the current timeline block>.
SEC rules: User-Agent from .env, <10 req/s, every response cached to cache/sec/<sha256(url)>.
Never use XBRL Company Facts for extraction. Return ExtractedValue objects from core/models.py.
Show me the plan first, then the code, then a command to test it on AAPL.
```
