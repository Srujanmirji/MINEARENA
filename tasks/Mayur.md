# Mayur — P2: SEC Data + Extraction

**GitHub:** `mayurhabib26-hub` · **Folders you own:** `edgar/`, `extract/`, `cache/`
**Read first:** `docs/PRD.md` FR-1 + FR-2, `docs/ARCHITECTURE.md` §2, §5 and §9, `docs/DATA_MODEL.md` §1 + §5

## Your mission
Get **real numbers with real evidence** out of the **filed 10-K document**: the right value, its unit, its period and the exact source row, from **two independent extractors**. That drives judging criterion 1 (accuracy) and feeds criterion 6 (the source evidence the reviewer sees).

**Why the primary document and not the R pages:** SEC generates the R pages from XBRL, and their HTML contains XBRL tag names. A judge can say "you read the XBRL viewer". The filed document is the original evidence; we strip its inline-XBRL tags so nothing but the visible text is used.

## You depend on
| From | What | When |
|---|---|---|
| Zeeshan | `core/models.py`, `core/config.py` (SYNONYMS, SEC_USER_AGENT) | 1:45 PM (until then read `.env` directly) |

## Others depend on you
| Who | What | By |
|---|---|---|
| Everyone | `cache/` filled for all 5 companies (10-K documents + Company Facts JSON for Srujan) | **3 PM** |
| Zeeshan | `edgar.client` + `extract.locate` | 5 PM |
| Zeeshan, Srujan | `extract.extractor.extract_filing` on real AAPL | **8 PM** |
| Zeeshan | `extract.get_table_html` for the source-evidence endpoint | 11 PM |

---

## Timeline

### 1:15–1:45 PM — Setup
- [ ] `.env` with `SEC_USER_AGENT="AuditLoop Team <real email>"` and an LLM key (Gemini; Groq as backup)
- [ ] Open Apple's FY2024 10-K in a browser and find the balance sheet, so you've seen the real HTML:
  `https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/` (folder listing; open the main `aapl-*.htm`)

### 1:45–3:00 PM — Client + cache  ⟵ **your checkpoint 3 PM: everything cached**
- [ ] `edgar/cache.py`: `cached_get(url) -> bytes`; file = `cache/sec/<sha256(url)>`; on miss, `httpx.get` with User-Agent, sleep 0.15 s between calls; retry once on 429/5xx
- [ ] `edgar/client.py`:
  - `get_cik(ticker)` via `https://www.sec.gov/files/company_tickers.json` → zero-pad to 10 digits
  - `get_latest_10k(cik)` via `https://data.sec.gov/submissions/CIK{cik}.json`: first index where `form == "10-K"` in `filings.recent`; return `accession`, `fiscal_year`, `period_end` (`reportDate`), `filing_date`, `primary_document` (`primaryDocument`)
  - `get_primary_doc(cik, accession, primary_document)` → HTML string
  - `get_company_facts(cik)` (download + cache only; **only Srujan's `verify/` may call it**)
- [ ] `python -m edgar.client --all` caches all 5 companies: **AAPL, MSFT, NVDA, WMT, TSLA**. Commit `cache/`

URL rules: data.sec.gov uses the **10-digit** CIK (`CIK0000320193.json`); Archives uses **`int(cik)`** and the accession **without dashes**:
`https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession.replace('-','')}/{primary_document}`

### 3:00–5:00 PM — Clean + locate
- [ ] `extract/clean.py`: `strip_ixbrl(html) -> html` with BeautifulSoup + lxml
  - unwrap every tag whose name starts with `ix:` (keep the text inside)
  - delete `ix:header` entirely and any element with `display:none` (hidden XBRL facts)
- [ ] `extract/locate.py`: `locate_statements(clean_html) -> {"balance_sheet","income_statement","cash_flow","segment"?}`, each `{"index", "heading", "scale", "html"}`
  - walk all `<table>`s in order; for each, look at the text just before it (previous ~500 characters) for a heading:
    - balance sheet: "consolidated balance sheets" / "statements of financial position"
    - income: "consolidated statements of operations" / "of income" / "of earnings" (**not** "comprehensive")
    - cash flow: "consolidated statements of cash flows"
    - segment: "segment" in a note heading + a table with a revenue/net sales row
  - skip tables with fewer than 5 rows that contain numbers (the table of contents also names these statements)
  - scale from nearby text: "in millions" → 1_000_000, "in thousands" → 1_000, else 1. **EPS is never scaled**
- [ ] Print a table of what was found for all 5. Every company must have the first 3

### 5:00–8:00 PM — Two extractors  ⟵ **checkpoint 8 PM: real AAPL through the pipeline**
- [ ] `extract/llm.py`: `ask_json(prompt) -> dict`; cache `cache/llm/<sha256(prompt)>.json`; provider from `LLM_PROVIDER`; JSON mode; retry once on parse error
- [ ] **Extractor A**, `extract/table_parser.py`: `pandas.read_html(io.StringIO(table_html))[0]` → clean the cells ("(1,234)" → -1234, "$ 1,234" → 1234, merge `$` and value columns) → rapidfuzz best row per metric vs `SYNONYMS` → current-year and prior-year columns
- [ ] **Extractor B**, `extract/llm_extractor.py`: send the table as plain text (rows joined with " | ") + metric list + synonyms; prompt below
  - **Reject any item whose `snippet` isn't found word-for-word in the table text** (normalise whitespace only)
- [ ] `extract/extractor.py`: `extract_filing(meta, tables) -> (values, segments)`
  1. Run A and B on each statement table
  2. `value` = B's answer if its snippet verified, else A's; `alt_value` = the other extractor's answer; `extractor` = "llm" or "parser"
  3. Fill `ExtractedValue`: `id=f"{accession}:{metric}"`, `source_page=primary_document`, `table_index`, `row_label`, `source_snippet`, `scale`, `period_start/end`, `prior_value`, `column_header`
  4. `period_start` = one year before `period_end` for income + cash-flow items, `None` for balance sheet
  5. Missing total liabilities? Derive `Total liabilities and equity − Total equity`, `is_derived=True`, snippet explains it
  6. Return all 9 metrics even if `value=None` (the router escalates missing values)
- [ ] **Parser-only mode:** if the LLM fails twice, use A alone (`alt_value=None`) and print a warning
- [ ] **Test:** AAPL output must equal the 9 rows marked `"_source": "REAL…"` in `data/mock_values.json`

**LLM prompt template** (keep it in `extract/prompts.py`):
```
You are extracting figures from one financial statement table of a US company's 10-K.
Table (rows separated by newlines, cells by " | "):
{table_text}
Metrics to find, with common row labels: {metrics_with_synonyms}
Rules:
- Use ONLY numbers that appear in the table. Never compute, round or guess.
- current_value = the most recent fiscal year column; prior_value = the previous year.
- snippet = the full table row exactly as written, copied character for character.
- If a metric is not in this table, omit it.
Return JSON: {"items": [{"metric": "...", "row_label": "...", "current_value": number, "prior_value": number|null,
                         "column_header": "...", "snippet": "..."}]}
```

### 8:00 PM — **Fallback decision** (with Srujan + Zeeshan)
If the primary-document locator fails for 2 or more companies, switch `locate.py` to R pages (via `FilingSummary.xml`), **strip every `onclick`/`defref_*` link** before parsing, and note it in the README so we can disclose it to judges. Otherwise, continue below.

### 8:00–11:00 PM — All 5 + segments + evidence
- [ ] Run all 5; print metric × company with value, row label, extractor, A vs B; eyeball it
- [ ] Segments: from the segment note table, `[{"segment": name, "value": revenue}]` for the current year (AAPL and MSFT at least). Return `[]` if unclear; validation shows N/A
- [ ] `extract.get_table_html(meta, table_index) -> str`: the cleaned table HTML from the cached document (Zeeshan's source endpoint highlights the row)
- [ ] Watch for: WMT and TSLA equity incl./excl. noncontrolling interest, EPS rows (never scaled), WMT's fiscal year ending in January

### 11:00 PM–2:30 AM — Fix what Srujan's accuracy report shows
- [ ] For every mismatch, decide: extraction bug (fix the method) or genuine ambiguity (leave it; the review flow handles it)
- [ ] **Never** look at XBRL values to "fix" extraction. Fix the method, not the number

### 2:30–5:00 AM — Sleep

### 5:00–7:30 AM
- [ ] Re-run all 5 to make sure `cache/` is complete; commit `cache/`
- [ ] Bonus B-2: `extract/explain.py`: 2-sentence AI explanation per YoY anomaly from the filing's MD&A text (labelled "AI-generated")

### 7:30 AM onward — Freeze
- [ ] Bug fixes only; rehearse the answers to "why not use XBRL directly?" and "how do you stop hallucinated numbers?" (`docs/DEMO.md`)

---

## Rules you must not break
- No XBRL / Company Facts values anywhere in `extract/`. No reading `ix:` concept names.
- Every SEC request goes through `edgar/cache.py` with the User-Agent.
- Every LLM call goes through `extract/llm.py` (cached). Unverified snippets are rejected.
- `source_snippet` must be the real row text; it's what the reviewer sees.

## Starter prompt for your AI tool
```
I'm Mayur, P2 on the AuditLoop repo. Read CLAUDE.md, tasks/Mayur.md, docs/ARCHITECTURE.md §2, §5, §9 and docs/DATA_MODEL.md.
I own edgar/, extract/ and cache/. Only edit those.
Task now: <paste the current timeline block>.
Extract from the primary 10-K HTML with ix: tags stripped — never from XBRL or Company Facts.
Two extractors: A = pandas + rapidfuzz table parser, B = LLM with strict JSON; reject LLM items whose snippet isn't word-for-word in the table.
SEC rules: User-Agent from .env, <10 req/s, cache everything. Return ExtractedValue objects from core/models.py.
Show me the plan first, then the code, then a command to test it on AAPL.
```
