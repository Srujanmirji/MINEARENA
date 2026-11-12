# PRD — AuditLoop: Human-in-the-Loop Financial Filing Auditor

| | |
|---|---|
| **Event** | MineArena 1.0 · PS-01 · 24-hour on-site hackathon, BIET Davangere |
| **Dates** | 12–13 Nov 2026 |
| **Team** | Zeeshan Madras · Mayur Habib · Sai Sudheer · Srujan Mirji |
| **Status** | Building. Feature freeze 13 Nov, 7:00 AM |
| **Doc owner** | Srujan |

---

## 1. One-line summary

An AI agent that extracts key numbers from real SEC 10-K filings, knows when it might be wrong, pauses for a human in exactly those cases, resumes without redoing work, and proves its accuracy against the SEC's own XBRL data.

## 2. Problem

- Auditors pull figures like revenue, net income and total assets out of long annual reports by hand. It is slow, and **one wrong number can cause a financial misstatement**.
- Full automation is risky because an extraction model is sometimes confidently wrong.
- Full manual review wastes reviewer time on values that are obviously right.
- **What's needed:** automate the routine values, escalate only the uncertain or suspicious ones, and keep every human decision accountable.

## 3. Users

| Persona | Need | What they do in AuditLoop |
|---|---|---|
| **Reviewer (auditor)** | See only the values that need attention, with evidence | Opens the review queue, inspects the source row, approves, corrects or rejects |
| **Audit lead** | Trust the system's output and see what humans changed | Reads the accuracy report and the audit log, verifies the hash chain |
| **Hackathon judge** | See every mandatory requirement working live | Watches the demo, asks to see pause/resume, the audit log and accuracy |

## 4. Goals and success metrics

Mapped one-to-one to the 8 judging criteria.

| # | Judging criterion | Our metric | Target |
|---|---|---|---|
| 1 | Financial extraction accuracy | Correct values ÷ verifiable values vs XBRL (within 1 unit of table scale) | ≥ 95% after review, ≥ 85% before review |
| 2 | Confidence scoring | Accuracy per confidence band | Clearly higher accuracy in the > 0.85 band than in the < 0.6 band |
| 3 | Auto-approval vs escalation | Auto-approval error rate (auto-approved but wrong) | 0 wrong auto-approvals |
| 4 | Escalation precision | Escalated values that were wrong or genuine anomalies ÷ all escalated | ≥ 60% |
| 5 | Workflow reliability | Kill-and-restart test; duplicate rows after resume | Resumes at the same item; 0 duplicates |
| 6 | Human review experience | Time for a judge to understand a review card | < 10 seconds; value, reason and source row visible without scrolling |
| 7 | Auditability | Append-only enforced + chain verification | UPDATE/DELETE rejected by DB; Verify chain passes |
| 8 | Technical implementation | Clean architecture, working end to end | All 5 companies processed live or from cache |

## 5. Non-goals

- User accounts, login, roles
- Parsing PDFs or the full 10-K main document (we use the small statement pages)
- Quarterly filings (10-Q), non-US filings
- Docker, Postgres, React, vector databases, LangChain agents
- Investment advice or financial interpretation beyond flagging anomalies

## 6. Scope

**In scope:** 5 companies × latest 10-K × 9 metrics = **45 values**, plus prior-year values for the year-on-year check.

Latest 10-K per company as of 12 Nov 2026 (from the Submissions API; decided by Srujan, lead):

| Ticker | Fiscal year end | Accession | Filed |
|---|---|---|---|
| AAPL | 2026-09-26 | 0000320193-26-000026 | 2026-11-03 |
| MSFT | 2026-06-30 | 0001193125-26-323660 | 2026-07-29 |
| NVDA | 2026-01-25 | 0001045810-26-000021 | 2026-02-25 |
| WMT | 2026-01-31 | 0000104169-26-000055 | 2026-03-13 |
| TSLA | 2025-12-31 | 0001628280-26-003952 | 2026-01-29 |

The FY2024 Apple rows in `data/mock_values.json` are test fixtures only; the demo uses the filings above.

**Metrics extracted**

| # | Metric key | Display name | Required by PS? |
|---|---|---|---|
| 1 | `revenue` | Revenue | Yes |
| 2 | `net_income` | Net income | Yes |
| 3 | `total_assets` | Total assets | Yes |
| 4 | `total_liabilities` | Total liabilities | Yes |
| 5 | `equity` | Shareholders' equity | Yes |
| 6 | `operating_cash_flow` | Operating cash flow | Yes |
| 7 | `operating_income` | Operating income | Our choice |
| 8 | `eps_diluted` | Diluted EPS | Our choice |
| 9 | `cash` | Cash and cash equivalents | Our choice |

Nine metrics gives us one spare above the required 8.

## 7. Functional requirements

Each requirement has an owner and acceptance criteria. "Done" means the acceptance criteria pass in a live demo.

### FR-1 SEC EDGAR integration — *Mayur*
- Resolve ticker → CIK, find the latest 10-K accession number and its `primaryDocument` in the Submissions API, download the primary 10-K HTML.
- Every request sends the `User-Agent` header and stays under 10 requests/second.
- Every response is cached to `cache/`; the second run makes zero network calls.

**Accept:** `python -m edgar.client AAPL` prints the accession number, fiscal year, period end and primary document name. Works offline on a second run.

### FR-2 Financial data extraction — *Mayur*
- Extract from the **filed 10-K document**, never from XBRL. Strip inline-XBRL (`ix:`) tags first so no concept names are visible.
- Locate the balance sheet, income statement, cash-flow statement and segment note tables by their headings; read the scale ("In millions").
- **Two independent extractors:** A = table parser (pandas + rapidfuzz synonyms), B = LLM with strict JSON. An LLM answer whose snippet isn't found word-for-word in the table is rejected.
- Extract 9 metrics per filing with value, unit, scale, period, row label and the exact source row text, plus the prior-year value.
- **Parser-only mode** when the LLM is unavailable.
- **Fallback (8 PM decision):** if the primary-document locator fails for 2+ companies, use R pages with the XBRL tag links stripped, and disclose it.

**Accept:** for AAPL, all 9 metrics match the 9 REAL rows in `data/mock_values.json`, each with `source_snippet` filled.

### FR-3 Confidence scoring — *Srujan*
- **C = 0.45·A + 0.30·L + 0.25·P**: A = parser/LLM agreement, L = label match, P = period + unit (details in `docs/ARCHITECTURE.md` §6). Confidence measures *did we read it right*; validation (FR-4) separately measures *does it make sense*.
- Derived values are capped at 0.75 so they always reach a human.
- Threshold configurable (default 0.85) from `.env` and the UI slider.
- Each value stores its three parts so the UI can explain the score.

**Accept:** changing the threshold from 0.85 to 0.6 changes the number of escalated values on the next run.

### FR-4 Validation engine — *Srujan*
Runs **after** confidence scoring, matching PS workflow Steps 3 → 4.
- **Accounting equation (hard):** |Assets − (Liabilities + Equity)| / Assets ≤ 0.5%; retry with equity including noncontrolling interest before flagging.
- **Segment sum (hard when available):** Σ segment revenue vs total revenue ≤ 0.5%; otherwise "N/A".
- **Year-on-year (soft):** change above `YOY_THRESHOLD` (default 40%) is an anomaly.
- **Scale sanity (hard):** value ≈ 1,000× or ÷1,000 the prior year → "possible scale error".
- **Sign (hard):** revenue, total assets, total liabilities > 0.
- Every result stored as passed / failed / N/A with severity and a human-readable detail.

**Accept:** NVDA revenue is flagged by year-on-year; AAPL passes A = L + E; a value multiplied by 1,000 is flagged as a scale error.

### FR-5 Automated decision — *Srujan (logic), Zeeshan (graph)*
- A value is auto-approved only if confidence ≥ threshold **and** no validation check failed (hard **or** soft) **and** its row label matches a known synonym at ≥ 0.80 **and** it is not missing. The PS says the workflow must pause "whenever the confidence score is low **or** a validation check fails", so a failed check escalates even if the threshold is lowered.
- Otherwise it is escalated with a reason string, e.g. *"A = L + E off by 2.1%; label match 0.71"*.
- Auto-approvals are written to the audit log as `reviewer = "system"`.

**Accept:** a run produces both auto-approved and escalated values, each escalation with a non-empty reason.

### FR-6 Human-in-the-loop workflow — *Zeeshan*
- The workflow pauses automatically on the first escalated value, using LangGraph `interrupt()`.
- The reviewer sees the value, confidence, source snippet and reason, then approves, corrects or rejects it.
- The decision is recorded before the workflow continues to the next escalated value.

**Accept:** starting a TSLA run pauses within 60 seconds and shows a review card in the UI.

### FR-7 Persistent workflow and resume — *Zeeshan*
- State is checkpointed in `data/checkpoints.db` (SQLite) after every node.
- The workflow resumes with `Command(resume=decision)` after a decision is submitted.
- No duplicate processing or side effects: all writes are idempotent by key.

**Accept:** kill the backend while a run is paused, restart it, and the same item is still pending. Row counts in `extracted_values` and `audit_log` are unchanged except for new decisions.

### FR-8 Reviewer dashboard — *Sai*
- Tabs: Review queue · Filings · Validations · Accuracy report · Audit log.
- Shows extracted metrics, flagged values, source evidence, validation results, confidence scores, and completed vs pending reviews.
- Sidebar: counters + threshold slider.

**Accept:** a judge can complete one approve, one correct and one reject from the UI without help.

### FR-9 Ground-truth verification — *Srujan*
- After reviews finish, compare each final value to XBRL Company Facts, matched by tag + accession + `form = 10-K` + `fp = FY` + period end.
- Correct = within **one unit of the table's scale** ($1M for "in millions", $0.01 for EPS).
- XBRL data is **never** used before this step.

**Accept:** the report shows accuracy per metric and per company, and lists values with no ground truth separately.

### FR-10 Accuracy report — *Srujan (data), Sai (UI)*
- Overall accuracy, per metric, per company.
- Auto-approved count vs escalated count; completed vs pending reviews.
- Escalation precision; auto-approval error rate; accuracy per confidence band.
- Download as CSV.

**Accept:** all numbers on the report can be recomputed from `app.db`.

### FR-11 Append-only audit log — *Srujan*
- Every decision (human and auto) is stored with original value, corrected value (if any), decision, reviewer, reason and timestamp.
- SQLite triggers reject UPDATE and DELETE.
- Each row stores `prev_hash` and `hash` (SHA-256 chain); a Verify button recomputes the chain.

**Accept:** an `UPDATE audit_log ...` in a SQLite shell fails; Verify chain returns OK.

### Bonus (only after the 3 AM checkpoint passes; nothing new after 7 AM)
| ID | Feature | Owner | Effort |
|---|---|---|---|
| Order | ID | Feature | Owner | Effort |
|---|---|---|---|---|
| 1 | B-2 | **AI explanation of anomalies:** 2 sentences per YoY/variance flag, written from the filing's own MD&A text, labelled "AI-generated", shown on the review card. Never uses XBRL | Mayur | 1 h |
| 2 | B-4 | **Multi-period variance:** keep **every year column** the statement shows (3 years for income + cash flow, 2 for balance sheet) in `history`; chart 3 years per metric; flag unusual variation across all periods, not just the last one | Mayur (data) + Sai (chart) | 1 h |
| 3 | B-3 | **MCP tools with per-step access:** FastMCP server exposing `get_filing` and `get_xbrl_fact`. Extraction steps are given `get_filing` only; **only the verify step is given `get_xbrl_fact`**, so the agent can call XBRL itself but never before human review | Zeeshan | 1–2 h |
| 4 | B-1 | **Adaptive escalation threshold (global):** after ≥ 5 reviews in total, if ≥ 90% of escalations that failed *only* on confidence were approved unchanged, lower the global threshold by 0.02 (floor 0.75). Validation failures always escalate, whatever the threshold. Show a before/after table: escalations ↓, wrong auto-approvals still 0 | Zeeshan (after B-3) | 1 h |

Why these designs:
- **B-3:** an XBRL tool the LLM can call at any time would let it read the answer key during extraction or review. Scoping tools per step keeps the accuracy test honest; say so in the pitch.
- **B-1:** per-metric adaptation needs ≥ 5 reviews *per metric*. With ~45 values and ~10 escalations spread over 9 metrics that never happens, so the feature would never visibly act. A global threshold does.
- **B-4:** 10-K tables already contain prior years, so multi-period analysis needs no extra filings.

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Runtime | One laptop, Python 3.11, no Docker |
| Offline resilience | All SEC responses and LLM responses cached; demo works if Wi-Fi drops (except new LLM calls) |
| Performance | Full run for one company < 90 seconds when cached |
| Reliability | Backend restart never loses a paused run |
| Security | API keys only in `.env` (git-ignored); no keys in commits |
| Explainability | Every confidence score and every escalation has a visible reason |
| Honesty | Any injected-error demo toggle is clearly labelled in the UI |

## 9. User flows

### 9.1 Happy path (clean company)
1. Reviewer clicks **Run AAPL** in the Filings tab.
2. Agent fetches the filing, extracts, scores and validates.
3. All values pass → auto-approved → verified against XBRL → report updated.
4. Filings tab shows 8 green values.

### 9.2 Escalation path
1. Reviewer clicks **Run TSLA**.
2. A value fails A = L + E → the run pauses.
3. The Review queue shows a card: value, confidence bar, signals, reason, highlighted source row.
4. Reviewer clicks **Correct**, types the right number, submits.
5. Decision is logged; the run resumes and pauses at the next escalated item, or finishes.

### 9.3 Crash and resume
1. A run is paused on an item.
2. The backend is killed (Ctrl+C) and restarted.
3. On startup the API lists paused threads; the UI shows the same item still pending.
4. Reviewer approves; the run continues with no duplicate rows.

## 10. Metric definitions

| Metric | Formula |
|---|---|
| Correct | \|final − xbrl\| ≤ one unit of the table's scale (after scaling to base units) |
| Accuracy | correct ÷ values with ground truth |
| Pre-review accuracy | same, using the originally extracted value |
| Escalation precision | escalated values that were wrong before review **or** flagged as YoY anomalies ÷ all escalated values |
| Auto-approval error rate | auto-approved values that are wrong ÷ all auto-approved values |
| Calibration | accuracy within confidence bands < 0.6, 0.6–0.85, > 0.85 |

## 11. Data sources

| Source | URL | Used for | When |
|---|---|---|---|
| Ticker → CIK | `https://www.sec.gov/files/company_tickers.json` | CIK lookup | Fetch step |
| Submissions | `https://data.sec.gov/submissions/CIK{cik:010d}.json` | Latest 10-K accession | Fetch step |
| 10-K document | `https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc_no_dashes}/{primaryDocument}` | Extraction + source evidence | Fetch / extract |
| Filing index (fallback only) | same folder + `FilingSummary.xml` → `R{n}.htm` | Fallback locator | Only if the 8 PM decision says so |
| Company Facts | `https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json` | **Ground truth only** | Verify step |

## 12. Assumptions and constraints

- Each company's latest 10-K primary document contains its financial statements as HTML tables with standard headings.
- Every statistic in the pitch has a cited source; uncited numbers are cut.
- Free-tier LLM limits are enough for ~50 calls.
- All code is written during the 24 hours (PS rule). These docs are planning, not code.
- XBRL is the answer key. Using it during extraction would make accuracy meaningless; we keep it out on purpose and will say so to judges.

## 13. Risks

| Risk | Mitigation |
|---|---|
| Pause/resume not working | Built first on mock data; checkpoint at 4 PM; whole team swarms if it fails |
| Wi-Fi fails during judging | `cache/` committed before judging |
| LLM rate limit or outage | Groq fallback via `LLM_PROVIDER`; LLM responses cached; parser-only mode as last resort |
| Primary-document locator unreliable | 8 PM decision: fall back to R pages with tag links stripped, disclosed to judges |
| Too few real escalations | NVDA (YoY), TSLA (noncontrolling interest: A = L + E misses by 0.5%), WMT (no total-liabilities line, so liabilities are derived and capped at 0.75) chosen for genuine ambiguity; never fake data |
| Integration breaks at night | Folder ownership, shared schema, 5 integration checkpoints |

## 14. Milestones (12–13 Nov)

| Time | Milestone | Gate |
|---|---|---|
| 1:45 PM | `core/models.py` + `data/mock_values.json` merged | Everyone imports them |
| 4:00 PM | Pause/resume works on mock data via API | Zeeshan's 5 tests pass |
| 8:00 PM | Real AAPL data flows through extract → score → validate → pause | One real escalation visible |
| 11:00 PM | UI drives a full review; decisions in audit log | Approve, correct, reject all work |
| 3:00 AM | All 5 companies + accuracy report vs XBRL | Report tab populated |
| 7:00 AM | **Feature freeze** | Only bug fixes after this |
| 9:00 AM | Demo rehearsed twice, `cache/` committed | Ready for judging |

## 15. Open questions

- [ ] Prizes per problem statement or overall? (ask organisers)
- [ ] Exact submission time and format (repo link? video? slides?)
- [ ] Is internet available during judging?
- [ ] Final product name
- [ ] Demo slot length (our script is 5 min; Zeeshan's draft was 7)

## 16. Glossary

| Term | Meaning |
|---|---|
| 10-K | Annual report US public companies file with the SEC |
| EDGAR | SEC's public filing system |
| CIK | Central Index Key, the SEC's company ID |
| Accession number | Unique ID of one filing, e.g. `0000320193-24-000123` |
| XBRL | Machine-readable tags on filing numbers; Company Facts is the API that serves them |
| Primary document | The main 10-K HTML file as filed; our extraction source |
| Inline XBRL (`ix:` tags) | XBRL tags embedded in the 10-K HTML; we strip them before extracting |
| R pages | SEC-generated HTML pages per statement, rendered from XBRL; fallback only |
| Interrupt | LangGraph call that pauses a graph and waits for outside input |
| Checkpointer | Stores graph state after every step so it can resume |
| Idempotent | Running it twice has the same effect as running it once |
| NCI | Noncontrolling interest, the part of a subsidiary the parent doesn't own |
