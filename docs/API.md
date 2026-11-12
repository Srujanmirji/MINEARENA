# API Contract — AuditLoop (FastAPI, port 8000)

Owner: **Zeeshan**. Consumer: **Sai** (Streamlit).

Streamlit never imports `agent/`. It only calls these endpoints. Until the real API is up, Sai reads `data/mock_values.json` behind the same function names in `ui/api_client.py`.

Base URL: `API_BASE` from `.env` (default `http://localhost:8000`). All bodies are JSON.

---

## Runs

### `POST /runs` — start a run
```json
// request
{ "ticker": "TSLA" }
// response 200
{ "thread_id": "TSLA-2024", "status": "running", "created": true }
```
- Starts the graph in a FastAPI `BackgroundTasks` job.
- If `thread_id` already exists, **don't restart it**. Return it with `"created": false` and its current status.
- To re-run deliberately: `POST /runs` with `{ "ticker": "TSLA", "force": true }`. This uses a new thread id, `TSLA-2024-r2`.

### `GET /runs` — list runs
```json
[
  { "thread_id": "AAPL-2024", "ticker": "AAPL", "status": "done",    "n_values": 8, "n_pending": 0, "n_auto": 8, "n_reviewed": 0 },
  { "thread_id": "TSLA-2024", "ticker": "TSLA", "status": "paused",  "n_values": 8, "n_pending": 3, "n_auto": 5, "n_reviewed": 0 }
]
```
`status`: `running` · `paused` · `done` · `error`

### `GET /runs/{thread_id}` — run detail
```json
{
  "thread_id": "TSLA-2024",
  "status": "paused",
  "next": ["human_review"],
  "steps_done": ["fetch_filing","locate_statements","extract","score_confidence","validate","route","auto_approve"],
  "interrupt": { "value": { "...ExtractedValue..." }, "reason": "A = L + E off by 2.1% (equity excl. NCI)" },   // from result["__interrupt__"][0] / state.tasks
  "error": null
}
```
Built from `graph.get_state(config)`: `state.next`, and `state.tasks[0].interrupts[0].value` when paused.

---

## Review

### `GET /pending` — the review queue
Returns the **currently paused item for every paused run** (one per run), plus the queued items behind it.
```json
[
  {
    "thread_id": "TSLA-2024",
    "is_current": true,
    "value": { "...ExtractedValue..." },
    "reason": "A = L + E off by 2.1% (equity excl. NCI); label match 0.71"
  },
  { "thread_id": "TSLA-2024", "is_current": false, "value": { "..." }, "reason": "..." }
]
```
Only `is_current: true` items can be decided. Show the others as "queued".

### `POST /runs/{thread_id}/decision` — submit a decision
```json
// request
{
  "value_id": "0000104169-25-000xxx:equity",
  "action": "correct",           // approve | correct | reject
  "new_value": 91013,            // required for "correct", same scale as the table
  "reviewer": "Srujan",
  "note": "Used equity incl. NCI" // required for "correct" and "reject"
}
// response 200
{ "status": "paused", "next_value_id": "0000104169-25-000xxx:total_liabilities", "duplicate": false }
```
The API sets `decision_id = f"{thread_id}:{value_id}"` itself. The UI never generates ids.

| Case | Response |
|---|---|
| `value_id` ≠ currently paused item | **409** `{ "detail": "not the current item" }` |
| This value was already decided (`decision_id` exists) | **200** with `"duplicate": true`, no resume |
| `action == "correct"` and no `new_value` | **422** |
| `action` is `correct` or `reject` and no `note` | **422** |
| Run not paused | **409** |

### `GET /runs/{thread_id}/source/{value_id}` — source evidence
```json
{
  "heading": "CONSOLIDATED BALANCE SHEETS",
  "scale_text": "(In millions)",
  "html": "<table>…<tr class='hl'>…Total shareholders' equity…</tr>…</table>",
  "source_url": "https://www.sec.gov/Archives/edgar/data/104169/000010416925000xxx/wmt-20250131.htm"
}
```
Built from the cached, `ix:`-stripped 10-K: `extract.get_table_html(meta, table_index)` with the row matching `row_label` wrapped in `class='hl'`. The UI renders it with that row highlighted.

Inside the endpoint, **record first, then resume** (PS 3.5: "record the reviewer's decision before continuing the workflow"):
```python
decision_id = f"{thread_id}:{body.value_id}"
created = db.record_decision({**body.model_dump(), "decision_id": decision_id, "thread_id": thread_id})  # INSERT OR IGNORE
if not created:
    return {"status": status, "duplicate": True}
graph.invoke(Command(resume={**body.model_dump(), "decision_id": decision_id, "thread_id": thread_id}),
             config={"configurable": {"thread_id": thread_id}})
```
`apply_decision` then writes the audit row and value status. Its own `record_decision` call is a no-op because the row already exists. If the resume crashes, the decision is still on record and a retry resumes cleanly.

---

## Data

### `GET /values?ticker=AAPL` — values for the Filings tab
Returns `ExtractedValue[]` (with `status`, `final_value`, `signals`, `validation`). No `ticker` returns all of them.

### `GET /validations?ticker=AAPL`
```json
[
  { "ticker": "AAPL", "check": "A=L+E",      "severity": "hard", "status": "passed", "detail": "diff 0.00%" },
  { "ticker": "AAPL", "check": "segment_sum","severity": "hard", "status": "passed", "detail": "5 segments, diff 0.00%" },
  { "ticker": "NVDA", "check": "yoy:revenue","severity": "soft", "status": "failed", "detail": "+114% vs prior year (threshold 40%)" }
]
```

### `GET /report` — accuracy report (after verification)
```json
{
  "overall": { "verifiable": 38, "correct": 37, "accuracy": 0.974, "pre_review_accuracy": 0.895,
               "no_ground_truth": 2 },
  "by_metric":  { "revenue": { "verifiable": 5, "correct": 5, "accuracy": 1.0 } },
  "by_company": { "AAPL": { "verifiable": 8, "correct": 8, "accuracy": 1.0 } },
  "decisions":  { "auto_approved": 29, "escalated": 11, "reviewed": 11, "pending": 0 },
  "escalation_precision": 0.73,
  "auto_approval_error_rate": 0.0,
  "calibration": [
    { "band": "<0.6",     "n": 4,  "accuracy": 0.5 },
    { "band": "0.6-0.85", "n": 7,  "accuracy": 0.86 },
    { "band": ">0.85",    "n": 29, "accuracy": 1.0 }
  ],
  "rows": [ { "value_id": "...", "metric": "...", "our_value": 0, "xbrl_value": 0, "match": true } ]
}
```
> The numbers above only show the shape. They are not results.

### `GET /report.csv` — same `rows` as CSV

---

## Audit

### `GET /audit?limit=200` — newest first
```json
[
  { "seq": 14, "ts": "2026-11-13T02:14:09+05:30", "decision_id": "...", "thread_id": "TSLA-2024",
    "value_id": "...", "metric": "equity", "original_value": 72913, "corrected_value": 73680,
    "decision": "corrected", "reviewer": "Srujan", "reason": "...", "prev_hash": "ab12…", "hash": "cd34…" }
]
```

### `GET /audit/verify`
```json
{ "ok": true, "rows": 40, "broken_at_seq": null }
```

---

## Config

### `GET /config` · `PUT /config`
```json
{ "threshold": 0.85, "yoy_threshold": 0.40 }
```
A changed threshold applies to **new** runs only, not to already-routed values. Say this in the UI.

### `GET /health`
```json
{ "ok": true, "db": true, "llm_provider": "gemini", "paused_runs": 1 }
```

---

## Startup behaviour
On startup the API must:
1. `init_db()` (create tables and triggers if missing).
2. Re-open `checkpoints.db` with the long-lived connection.
3. Rebuild the run list from `extracted_values.thread_id`, then call `graph.get_state` for each and mark paused ones.

This is what makes the "kill the backend and restart" demo work.
