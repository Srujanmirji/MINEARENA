# Demo Script + Judge Q&A — AuditLoop

**Presenter:** Srujan · **Driver (clicks):** Sai · **Backup driver:** Zeeshan · **Length:** 5 minutes + Q&A

Rehearse it twice before judging. Every click must have been done at least 10 times before.

## Before judges arrive (checklist)

- [ ] `cache/` populated for all 5 companies and committed
- [ ] Backend running in a visible terminal (the kill-and-restart is part of the show)
- [ ] Fresh `app.db`? **No.** Keep AAPL, MSFT and NVDA already done; leave TSLA ready to run live; leave one JPM item paused
- [ ] SQLite shell open in a second terminal: `sqlite3 data/app.db`
- [ ] Architecture slide open in a tab
- [ ] Laptop on charger; notifications off; font size bumped in terminal and browser
- [ ] Phone hotspot ready in case venue Wi-Fi dies

## The 5 minutes

| Time | Show | Say (short) |
|---|---|---|
| 0:00 | Architecture slide | "Auditors pull numbers from 10-Ks by hand. One wrong number is a misstatement. We automate the routine values and escalate only the uncertain ones to a human. Every decision is accountable." |
| 0:30 | Filings tab, AAPL done | "Apple: 8 metrics, all auto-approved. Here's why this value is trusted." Open one value and show the 5 confidence signals and the source row. |
| 1:15 | Click **Run TSLA** | "Tesla has noncontrolling interests, so the balance sheet equation is ambiguous. Watch it pause." |
| 1:45 | Review queue card | "Value, confidence, the exact source row, and why it escalated." Click **Correct** and enter the value. |
| 2:30 | Terminal: Ctrl+C the backend, restart it | "We just killed the server mid-review." Refresh the UI. "Same item, still paused. Nothing re-ran, no duplicate rows." Show the row count in SQLite. |
| 3:15 | Audit log tab → **Verify chain** | "Every decision, human and automatic, is hash-chained." In the SQLite shell run `UPDATE audit_log SET decision='approved' WHERE seq=1;` and the database rejects it. |
| 4:00 | Accuracy report tab | "Checked against SEC XBRL, the official machine-readable data. Accuracy X%. N auto-approved, M escalated. Escalation precision P%: most escalations were real problems. And XBRL is never used before this step, it's the answer key." |
| 4:45 | Close | "Automate the routine, escalate the uncertain, keep every decision accountable." |

## Likely judge questions (prepare these answers)

| Question | Answer |
|---|---|
| "Why not just read the XBRL data? It's already structured." | "XBRL is the ground truth the problem gives us to measure accuracy. If we extracted from it, accuracy would be 100% by definition. We extract from the human-readable statement pages and use XBRL only to grade ourselves." |
| "How is the confidence score computed?" | "Five checkable signals, not the LLM's self-reported confidence: the number appears verbatim in the source row, the label matches, the scale was found, the period matches, and a second independent method agrees. Weighted sum, threshold adjustable." |
| "How do you avoid duplicate side effects on resume?" | "LangGraph re-runs the node that paused. Our review node does no writes, only `interrupt()`. All writes happen in the next node and are keyed by `decision_id` with unique constraints, so a replay is a no-op." |
| "What if the server crashes mid-review?" | Show it again: kill and restart. "State is in a SQLite checkpointer after every node." |
| "How do you know the audit log wasn't edited?" | "Triggers reject UPDATE and DELETE in the database, and each row's hash includes the previous row's hash. Verify recomputes the chain and shows the first broken row." |
| "Is escalation precision good?" | Show the number + the calibration table: "Higher confidence bands are more accurate, so the score means something." |
| "Why these 5 companies?" | "Chosen to stress the system: a clean baseline (Apple), segments (Microsoft), a genuine growth anomaly (NVIDIA), equity ambiguity (Tesla), and a bank with no plain revenue line (JPMorgan)." |
| "What would you do with more time?" | "Adaptive thresholds from reviewer feedback, 10-Q support, MCP tools so other agents can call the auditor, and multi-period variance explanations." |
| "Segment validation?" | "Where a segment note exists we sum the segment revenues and compare them to total revenue. Where it doesn't, we show N/A rather than a fake pass." |

## If something breaks live

| Failure | Recovery |
|---|---|
| LLM call fails | Everything is cached; re-run uses the cached response |
| Network down | Cache covers SEC; stay on the pre-run companies |
| UI freezes | Refresh. State lives in the backend, not the UI |
| Backend won't start | Zeeshan fixes; Srujan keeps talking through the architecture slide |
