# Sai — P3: Frontend + UI/UX

**GitHub:** `SaiSudhee2723` · **Folders you own:** `ui/`
**Read first:** `docs/PRD.md` §3, §9 and FR-8, FR-10, FR-11, `docs/API.md` (all), `docs/DEMO.md`

## Your mission
Make the judges **understand the system in 10 seconds per screen**. You own judging criterion 6 (human review experience) and the visible half of 7 (auditability). You also **drive the clicks in the final demo**, because you'll know the UI best. Srujan presents.

You do not write backend code. Everything you need comes through `ui/api_client.py`.

## You depend on
| From | What | When | Until then |
|---|---|---|---|
| Srujan | `data/mock_values.json` | 1:45 PM | Make 3 rows by hand |
| Zeeshan | API endpoints (`/runs`, `/pending`, `/decision` first) | 4 PM | `USE_MOCK=True` |
| Srujan | `/report` data | 2 AM | Fake report dict copied from the `/report` example in `docs/API.md` |
| Srujan | `audit.verify_chain` via `/audit/verify` | 4 PM | Fake `{"ok": true}` |

## Others depend on you
| Who | What | By |
|---|---|---|
| Team | UI drives approve, correct and reject end to end | **11 PM checkpoint (you lead it)** |
| Srujan | Architecture slide + 3–4 pitch slides | 7 AM |

---

## Timeline

### 1:15–1:45 PM — Organisers + wireframe + stack decision
- [ ] **Decide now: Streamlit or React.** React (Vite + Tailwind) only if you're genuinely fast in it. Rule: if React isn't showing the review card on real API data by **11 PM**, switch to Streamlit. Tell the group which one you picked
- [ ] Ask the organisers (PRD §15): prizes per PS or overall? Submission time and format? Internet during judging? Post the answers in the group chat
- [ ] Sketch the **review card** on paper. It's the most important screen (spec below)

### 1:45–4:00 PM — Skeleton on mock data
- [ ] `ui/api_client.py`: `start_run`, `list_runs`, `get_run`, `get_pending`, `submit_decision`, `get_values`, `get_validations`, `get_report`, `get_audit`, `verify_audit`, `get_config`, `set_config`, `health`
  - `USE_MOCK = True` at the top: mock mode reads `data/mock_values.json` and returns the shapes in `docs/API.md`
  - real mode: `httpx` to `API_BASE` with a 10 s timeout; on error return `None` and show a friendly message, never a stack trace
- [ ] `ui/app.py`: `st.set_page_config(page_title="AuditLoop", layout="wide")`, sidebar, 5 tabs: **Review queue · Filings · Validations · Accuracy report · Audit log**
- [ ] Sidebar: 4 counters (auto-approved · escalated · pending · reviewed), threshold slider with caption "applies to new runs", API health dot (green/red)

### 4:00–8:00 PM — The screens (on mock data)
- [ ] **Review queue** (spec below). Build this first and make it great
- [ ] **Filings:** one row per ticker with status chip + **Run** button; expand a ticker → 8-value table (metric, value, unit, period, confidence, status colour); step timeline (fetch → locate → extract → score → validate → review → verify)
- [ ] **Validations:** per company, each check as ✅ passed / ❌ failed / ➖ N/A with its detail text

### 8:00–11:00 PM — Real API  ⟵ **checkpoint 11 PM (you lead it)**
- [ ] Flip `USE_MOCK=False`; fix shape mismatches with Zeeshan (sit together)
- [ ] Auto-refresh while any run is `running` or `paused`: `time.sleep(3); st.rerun()` guarded by a toggle
- [ ] Full flow live: Run TSLA → card appears → approve one, correct one, reject one → rows in Audit log tab
- [ ] Double-click Approve → still one audit row (the API dedupes on `thread_id:value_id`; also disable the buttons after the first click)

### 11:00 PM–2:30 AM — Report + audit tabs
- [ ] **Accuracy report:** 4 headline `st.metric`s (accuracy, pre-review accuracy, escalation precision, auto-approval error rate); bar chart accuracy by metric; table by company; calibration table (band · n · accuracy); **Download CSV** button. Works on the fake report until Srujan's lands at 2 AM
- [ ] **Audit log:** dataframe newest first (seq, time, metric, original → corrected, decision, reviewer); **Verify chain** button → green "Chain intact · N rows" or red "Broken at seq X"; short caption: "Database triggers block edits and deletes"

### 2:30–5:00 AM — Sleep

### 5:00–7:00 AM — Polish + slides
- [ ] Readability pass: everything on the review card readable from 2 m away
- [ ] Empty states: "No items waiting for review", "Run a company to see results"
- [ ] **Slides** (Google Slides is fine): 1 title · 1 problem · 1 architecture (redraw `docs/ARCHITECTURE.md` §1 cleanly) · 1 results (numbers from Srujan) · 1 closing line
- [ ] Bonus B-4 (3-year variance chart per metric from each value's `history`) only if everything is green

### 7:00 AM onward — Freeze + rehearsal
- [ ] No new features. Rehearse `docs/DEMO.md` twice as the driver, with Srujan presenting
- [ ] Practise the kill-and-restart moment with Zeeshan: you refresh the UI right after he restarts the backend

---

## UI/UX spec

### Review card (Review queue tab)
```
┌──────────────────────────────────────────────────────────────────────┐
│ TSLA · FY2024 · Shareholders' equity                     ⏸ PAUSED    │
│                                                                      │
│   $ 72,913 M          period ending 2024-12-31                       │
│                                                                      │
│ Confidence  ███████░░░  0.68   (threshold 0.85)                      │
│   A agreement ░░░░░░░░░░ 0.0   L label ████░░░░░░ 0.42               │
│   P period+unit ██████████ 1.0   Checks: ❌ A=L+E  ✅ YoY  ✅ sign     │
│   Parser (A): 72,913   LLM (B): 74,180   ← disagree                  │
│                                                                      │
│ ⚠ Why escalated: A = L + E off by 2.1% (equity may exclude NCI);     │
│   label match 0.42                                                   │
│                                                                      │
│ Source evidence  (10-K · CONSOLIDATED BALANCE SHEETS)    ↗ SEC page  │
│   Total stockholders' equity | 72,913 | 62,634     ← highlighted     │
│                                                                      │
│ [ ✓ Approve ]   [ ✎ Correct: ______ ]   [ ✕ Reject ]   note: ____    │
└──────────────────────────────────────────────────────────────────────┘
   Queued behind this: 2 more for TSLA
```
> Numbers in the sketch are layout placeholders, not real figures.

- The **value** is the biggest text on the screen; the **reason** is the second thing the eye hits (amber box)
- The source row sits inside its table with the matched row highlighted (`st.dataframe` with a style, or an HTML table via `st.markdown(..., unsafe_allow_html=True)`)
- Source table: call `GET /runs/{thread_id}/source/{value_id}` and render its `html` (row with `class='hl'` highlighted); link to its `source_url`
- Escalation reason as badges: "Low confidence", "Equation failed", "YoY +62%", "Possible scale error", "Extractors disagree"
- **Correct** needs a number input **and a reason**; **Reject** needs a reason; disable submit until filled
- The API derives `decision_id`; the UI sends `value_id`, `action`, `new_value`, `reviewer`, `note`
- Nice to have: keyboard shortcuts A / C / R (React only; skip in Streamlit)
- After submit: toast "Decision recorded. Workflow resumed", then refresh

### Colour meaning (use the same everywhere)
| Status | Colour |
|---|---|
| auto_approved | green |
| approved / corrected | blue |
| escalated / pending | amber |
| rejected / failed check | red |
| N/A / no ground truth | grey |

### Rules
- Never show a Python traceback; show a one-line error + "Retry"
- Every number shows its unit and scale ("$ 391,035 M", "EPS $ 6.08")
- Keep the UI honest: if a demo "inject error" toggle exists, label it clearly as injected

## Starter prompt for your AI tool
```
I'm Sai, P3 (frontend + UI/UX) on the AuditLoop repo. Read CLAUDE.md, docs/API.md, docs/PRD.md (FR-8, FR-10, FR-11, §9) and tasks/Sai.md (UI/UX spec).
I own ui/ only. Never edit anything else.
Task now: <paste the current timeline block>.
Streamlit app; all data via ui/api_client.py with a USE_MOCK flag that reads data/mock_values.json and returns the shapes in docs/API.md.
Never import agent/. The API derives decision_id; disable buttons after submit. Never show tracebacks to the user.
Show me the plan first, then the code, then how to run it.
```
