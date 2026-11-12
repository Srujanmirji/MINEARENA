# Demo Script + Judge Q&A — AuditLoop

**Presenter:** Srujan · **Driver (clicks):** Sai · **Backup driver:** Zeeshan · **Length:** 5 minutes + Q&A

Rehearse it twice before judging. Every click must have been done at least 10 times before.

## The rule this script is built around

The PS says: **"All mandatory requirements must be demonstrated during evaluation"** and **"Teams must clearly explain their architecture, workflow and implementation."** A feature that works but isn't shown on screen scores zero. Every row in the coverage table below must be seen by the judges.

## Requirement coverage (tick each one during rehearsal)

| PS item | Must be seen on screen | When |
|---|---|---|
| 3.1 EDGAR, 3–5 companies, 10-K | 5 company runs, each showing its 10-K accession number | 1:00 |
| 3.2 ≥ 8 metrics + period, unit, evidence | One company's 9 values with period, unit and source row | 1:00 |
| 3.3 Confidence score + **configurable** threshold | Score breakdown on one value; threshold slider | 1:30 |
| 3.4 Accounting equation | AAPL passes A = L + E | 1:50 |
| 3.4 **Segment validation** | AAPL segment revenues sum to total | 1:50 |
| 3.4 **Year-on-year** | NVDA revenue flagged as an anomaly | 1:50 |
| 3.4 Passed vs failed clearly shown | Extracted values tab: Pass / Fail / N/A per check | 1:50 |
| 3.5 Auto-pause on low confidence **or** failed check | TSLA run pauses live on A = L + E | 2:15 |
| 3.5 Value, score, snippet, reason shown | Review card | 2:15 |
| 3.5 **Approve**, **Correct**, **Reject** | Approve (TSLA equity, WMT equity + assets), Correct (WMT derived liabilities → 178,488); Reject shown with its required-reason guard (see "Reject" note below) | 2:30–3:20 |
| 3.6 Checkpoint + resume, no duplicates | Kill + restart backend; same item waiting; row count unchanged | 2:45 |
| 3.7 Completed and pending reviews tracked | Sidebar counters change after each decision | 3:20 |
| 3.8 XBRL comparison + accuracy report | Accuracy report tab | 4:05 |
| 3.8 **Auto-approved vs escalated counts** | Same tab | 4:05 |
| 3.8 Append-only audit log with original, corrected, decision, timestamp | Audit log tab + Verify chain + refused UPDATE | 3:35 |
| Sec. 8: explain architecture + workflow | Architecture slide + one-sentence workflow | 0:30 |

## Before judges arrive (checklist)

- [ ] `cache/` populated for all 5 companies and committed
- [ ] Backend running in a visible terminal (the kill-and-restart is part of the show): `uvicorn api.main:app --port 8000`
- [ ] **Demo UI = the React dashboard** (`cd ui/frontend && npm run dev`, http://localhost:5173). Streamlit (`ui/app.py`) is backup only. Only ONE browser tab on it
- [ ] `.env` has `LLM_PROVIDER=groq` and `YOY_THRESHOLD=0.40` (the `.env.example` defaults)
- [ ] Demo state prepared, **not** a fresh `app.db`:
  - Build it with one command (API stopped): `python -m verify.demo_setup --reset` (old DBs are moved to `data/backup-*`, not deleted)
  - Result: AAPL, MSFT, NVDA done and graded (27/27 correct; AAPL segments ✅, NVDA YoY anomalies); **WMT paused with 3 waiting: equity, total liabilities (derived), total assets**; TSLA not run (runs live)
- [ ] SQLite shell open in a second terminal: `sqlite3 data/app.db`
- [ ] Architecture slide open in a tab
- [ ] Laptop on charger; notifications off; font size bumped in terminal and browser
- [ ] Phone hotspot ready in case venue Wi-Fi dies
- [ ] **Ask organisers the slot length.** If it's over 5 minutes, slow down at 2:15–3:20 (human review), not elsewhere

## Final expectation → demo moments

The PS ends with: *"Build a reliable autonomous financial auditing agent that can extract, validate, identify suspicious financial values, request human intervention when necessary, resume its workflow and maintain a verifiable audit trail."* Judges will summarise us against this sentence.

| PS phrase | Shown at |
|---|---|
| reliable | Results slide: 2 clean full runs + the kill-and-restart (2:45) |
| autonomous | Auto-approved vs escalated counts (4:05) + the "autonomy" answer in Q&A |
| extract | AAPL's 9 values with source rows (1:00) |
| validate | Extracted values tab, per-company checks (1:50) |
| identify suspicious values | TSLA pauses on A = L + E (2:15); escalation precision (4:05) |
| request human intervention when necessary | Review card + Approve / Correct / Reject (2:15–3:20) |
| resume its workflow | Kill and restart (2:45) |
| verifiable audit trail | Verify chain + refused UPDATE (3:35) |

The closing line repeats this sentence back to them.

## The 5 minutes

| Time | Sai shows | Srujan says (short) |
|---|---|---|
| 0:00 | Title / problem slide | "Auditors copy numbers out of 10-K reports by hand. One wrong number is a misstatement, and AI alone isn't reliable enough. We automate the confident values and send only the uncertain ones to a human." |
| 0:30 | Architecture slide | "The agent fetches the 10-K from SEC EDGAR, extracts with two independent readers, validates, scores, then auto-approves or pauses for a human. It's a LangGraph workflow that saves state after every step. XBRL is only used at the end, to grade us." |
| 1:00 | Runs tab: 5 companies; then Extracted values → AAPL | "Five real companies, latest 10-K each. Here are Apple's 9 metrics, each with its period, unit and the exact source row from the filing." |
| 1:30 | Click one value; point at the threshold slider | "Confidence 0.97: both readers agree, the label matches, period and unit are right, checks passed. The auto-approve threshold is configurable, here." |
| 1:50 | Extracted values tab: AAPL, then NVDA | "Accounting equation: Apple balances. Segment check: Apple's five regions add up to total revenue. Year-on-year: NVIDIA's revenue jump is flagged as an anomaly. Passed, failed, N/A, all visible." |
| 2:15 | Filings → **Run TSLA** → Review queue | "Tesla. Assets don't equal liabilities plus equity: off by half a percent. The workflow pauses by itself. The reviewer sees the value, score, source row and reason: equity may exclude noncontrolling interest." |
| 2:30 | **Approve** with note "gap is noncontrolling interest; value matches the filing" | "The number was read correctly; the gap is Tesla's noncontrolling interest. The reviewer approves it, with a reason." (Do **not** Correct equity to include NCI: XBRL `StockholdersEquity` excludes it, so that would turn a right value wrong.) |
| 2:45 | Zeeshan: Ctrl+C backend, restart. Sai refreshes | "We just crashed the server mid-review. Restarted. The workflow resumed from its saved checkpoint, nothing re-ran, and the row count is unchanged." (Show the count in SQLite.) |
| 3:05 | WMT queue, in order: **equity** → Approve, note "gap is noncontrolling interest (6,270) + redeemable NCI (293)". **Total liabilities** (derived 178,781) → **Correct to 178,488**, reason "derived figure included the $293M redeemable noncontrolling interest; the liability lines sum to 178,488". **Total assets** → Approve | "Walmart reports no total-liabilities line, so we derive it, and a derived value always goes to a human. The reviewer spots that it swallowed the $293M redeemable noncontrolling interest and corrects it. Every decision is recorded before the workflow continues." |
| 3:20 | Point at sidebar counters | "Completed and pending reviews, tracked live." |
| 3:35 | Audit log tab → **Verify chain**; SQLite `UPDATE audit_log SET decision='approved' WHERE seq=1;` (row `seq=1` must exist: on an empty log the UPDATE matches 0 rows and "succeeds" silently) | "Every decision: original value, corrected value, decision, timestamp. Hash-chained: chain intact. Try to edit history… the database refuses." |
| 4:05 | Accuracy report tab (shows finished runs) + results slide | "Graded against the SEC's XBRL data, only after review. On our full run of all 5 companies: 44 of 44 values correct, 28 auto-approved, 17 escalated, and zero wrong values auto-approved. Every value we scored above 0.85 was correct: the confidence score means something." (Dry run: at this point the tab shows **35/35 · 28 auto · 17 escalated · 4 pending**, because TSLA is still mid-review. Say "the tab shows the runs finished so far; the slide is the full run of all five".) |
| 4:40 | Results slide line: "5 companies, 2 full runs, 0 crashes, identical results, 0 wrong auto-approvals" | "So: an autonomous agent that extracts, validates and flags suspicious values, asks a human only when necessary, resumes after a crash, and leaves a verifiable audit trail. Exactly what PS-01 asked for." |

**Numbers** (`python -m verify.run_all`, all 5 companies, latest 10-Ks): accuracy **100% (44/44; WMT total liabilities has no XBRL ground truth)**, **28 auto-approved / 17 escalated**, **0 wrong auto-approvals**, escalation precision **64.7%** (the rest are correct values that failed a real accounting check, e.g. NCI gaps), calibration: **43 values scored > 0.85, 100% correct**. 2 full runs, 0 crashes, identical results. Re-run the command after any code change; never quote numbers you didn't just reproduce.

**Reject:** every real value is correct, so there is no honest Reject target in the demo data; rejecting a correct value would record an error. Show the guard instead (Reject stays disabled until a reason is typed) and say what it's for: "Reject when the filing gives no usable number." **Decided (Srujan, lead): guard-only.** At 3:05, after the WMT decisions, point at Reject, show it disabled until a reason is typed, then clear the text without clicking.

## Likely judge questions (prepare these answers)

| Question | Answer |
|---|---|
| "Why not just read the XBRL data? It's already structured." | "XBRL is the ground truth the problem gives us to measure accuracy. If we extracted from it, accuracy would be 100% by definition. We extract from the filed 10-K document, with the inline-XBRL tags stripped, and use XBRL only to grade ourselves." |
| "How is the confidence score computed?" | "Not the LLM's self-reported confidence. Three checkable parts: do two independent extractors (a table parser and an LLM) agree, does the row label match, are the period and unit right. Weighted 45/30/25. Validation is separate: if any accounting check fails, a human reviews it regardless of the score. Derived values are capped below the threshold so a human always sees them." |
| "How do you stop the LLM hallucinating numbers?" | "Every LLM answer must quote its source row, and we reject it if that row isn't found word-for-word in the table. And the parser checks it independently." |
| "How do you avoid duplicate side effects on resume?" | "LangGraph re-runs the node that paused. Our review node does no writes, only `interrupt()`. All writes happen in the next node and are keyed by `thread_id:value_id` with unique constraints, so a replay is a no-op." |
| "What if the server crashes mid-review?" | Show it again: kill and restart. "State is in a SQLite checkpointer after every node." |
| "How do you know the audit log wasn't edited?" | "Triggers reject UPDATE and DELETE in the database, and each row's hash includes the previous row's hash. Verify recomputes the chain and shows the first broken row." |
| "Is escalation precision good?" | Show the number + the calibration table: "Higher confidence bands are more accurate, so the score means something." |
| "Why these 5 companies?" | "Chosen to stress the system: a clean baseline (Apple), segments (Microsoft), a genuine growth anomaly (NVIDIA), Tesla, whose noncontrolling interest makes A = L + E miss by 0.5%, and Walmart, which has no total-liabilities line, so we derive it and a human checks it." |
| "Isn't this just a fixed pipeline? Where's the autonomy?" | "Nobody tells it which values to trust. For every number it decides by itself: which extractor to believe, whether it's confident, whether it makes accounting sense, and whether a human is needed. Humans only see 17 of 45 values, the ones it isn't sure about." (From `verify.run_all`. If the MCP bonus is done, add: "…and it calls SEC tools itself.") |
| "How do you know it's reliable?" | "We ran all 5 companies end to end twice from a clean database: zero crashes, identical results, zero wrong values auto-approved. And you just saw it survive a server crash." |
| "What would you do with more time?" | "Adaptive thresholds from reviewer feedback, 10-Q support, MCP tools so other agents can call the auditor, and multi-period variance explanations." |
| "Segment validation?" | "Where a segment note exists we sum the segment revenues and compare them to total revenue. Where it doesn't, we show N/A rather than a fake pass." |

## If something breaks live

| Failure | Recovery |
|---|---|
| LLM call fails | Everything is cached; re-run uses the cached response |
| Network down | Cache covers SEC; stay on the pre-run companies |
| UI freezes | Refresh. State lives in the backend, not the UI |
| Backend won't start | Zeeshan fixes; Srujan keeps talking through the architecture slide |
