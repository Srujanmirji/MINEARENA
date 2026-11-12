# Srujan — P4: Dashboard, Audit Log, Demo + Pitch (Team Lead)

**Folders you own:** `ui/`, `audit/`, `docs/`
**Read first:** `docs/PRD.md` (all), `docs/API.md`, `docs/DEMO.md`, `docs/DATA_MODEL.md` §3 (audit_log)

## Your mission
Make the judges **see** everything working. You own judging criteria 6 (review experience) and 7 (auditability), and you run the demo. As team lead you also run the integration checkpoints and the 6 PM / 7 AM calls.

## You depend on
| From | What | When | Until then |
|---|---|---|---|
| Sai | `data/mock_values.json` | 1:45 PM | — |
| Zeeshan | API endpoints (`/runs`, `/pending`, `/decision` first) | 4 PM | `ui/api_client.py` reads mock data |
| Sai | `/report` data | 2 AM | Fake report dict with the API.md shape |

## Others depend on you
| Who | What | By |
|---|---|---|
| Zeeshan | `audit.log.init_tables()`, `append()`, `list_rows()`, `verify_chain()` | **4 PM** |
| Team | Integration checkpoints on time | All night |

---

## Timeline

### 1:15–1:45 PM — Lead the contract
- [ ] Push these docs to the repo (`docs/`, `tasks/`, `README.md`, `CONTRIBUTING.md`, `CLAUDE.md`)
- [ ] Walk the team through `core/models.py` for 10 minutes; everyone agrees, Zeeshan merges
- [ ] Ask the organisers the open questions (PRD §15): prizes per PS or overall, submission time and format, internet during judging

### 1:45–4:00 PM — Audit log  ⟵ **deliver to Zeeshan by 4 PM**
- [ ] `audit/log.py`
  - `init_tables(conn)`: `audit_log` DDL + both triggers from DATA_MODEL §3
  - `append(entry) -> dict`: compute `prev_hash` (last row's hash or `"GENESIS"`) + `hash`; `INSERT`; on `UNIQUE` error for `decision_id` return the existing row (idempotent)
  - `list_rows(limit=200)`: newest first
  - `verify_chain() -> {"ok", "rows", "broken_at_seq"}`: recompute every hash in `seq` order
- [ ] Test: append 3 rows, verify OK; `UPDATE audit_log ...` in the sqlite3 shell → error; append the same `decision_id` twice → still 3 rows

### 4:00–8:00 PM — UI on mock data
- [ ] `ui/api_client.py`: functions `start_run`, `list_runs`, `get_pending`, `submit_decision`, `get_values`, `get_validations`, `get_report`, `get_audit`, `verify_audit`, `get_config`, `set_config`. A `USE_MOCK` flag reads `data/mock_values.json`
- [ ] `ui/app.py`: `st.set_page_config(layout="wide")`, sidebar + 5 tabs
- [ ] **Review queue** (the most important screen):
  - company · metric · value with unit and period, large
  - confidence bar + the 5 signals as small bars
  - escalation reason in a coloured box
  - source row: show the table with the matched row highlighted (or the `source_snippet` in a code box), plus a link to the SEC page
  - buttons **Approve** · **Correct** (number input) · **Reject** + note
  - `decision_id`: create once per card and keep it in `st.session_state[f"did:{value_id}"]`
- [ ] **Filings:** a "Run" button per ticker; 8-value table with status colours; step timeline
- [ ] **Validations:** checks per company with ✅ / ❌ / N/A and detail
- [ ] **Sidebar:** counters (auto · escalated · pending · reviewed), threshold slider (note: "applies to new runs"), API health dot

### 8:00–11:00 PM — Real API  ⟵ **checkpoint 11 PM (you lead)**
- [ ] Flip `USE_MOCK=False`; fix shape mismatches with Zeeshan
- [ ] Auto-refresh: rerun every ~3 s while any run is `running` (an `st.empty()` loop or `st.rerun` after `time.sleep(3)`)
- [ ] Full flow: Run TSLA → card appears → approve one, correct one, reject one → rows in the audit log

### 11:00 PM–2:30 AM — Report + audit tabs + slide
- [ ] **Accuracy report:** headline metrics (`st.metric`): accuracy, pre-review accuracy, escalation precision, auto-approval error rate; bar chart by metric; table by company; calibration table; CSV download
- [ ] **Audit log:** dataframe newest first; **Verify chain** button → green "Chain intact (N rows)" or red "Broken at seq X"
- [ ] Architecture slide: one slide with the diagram from `docs/ARCHITECTURE.md` §1 (redraw it cleanly) + 3 bullets

### 2:30–5:00 AM — Sleep

### 5:00–7:00 AM — Polish + rehearsal prep
- [ ] Make the review card readable from 2 metres away (font sizes, spacing)
- [ ] Take Sai's 3 pitch bullets; fill the real numbers into `docs/DEMO.md`
- [ ] Bonus B-4 (3-year variance chart) only if everything is green

### 7:00 AM — **Feature freeze** (you announce it)
- [ ] Set up the demo state (see `docs/DEMO.md` checklist)
- [ ] Rehearse twice with a timer; Zeeshan watches as backup driver
- [ ] Make sure `cache/` is committed and the final code is pushed

---

## Calls you make as lead
| When | Call |
|---|---|
| 6 PM | Pause/resume not green? Everyone swarms on it |
| Any checkpoint fails | Stop new features until it passes |
| 3 AM | Cut bonus features if the report isn't ready |
| 7 AM | Freeze: no new features, period |

## Starter prompt for your AI tool
```
I'm Srujan, P4 on the AuditLoop repo. Read CLAUDE.md, docs/PRD.md, docs/API.md and docs/DATA_MODEL.md §3.
I own ui/, audit/ and docs/. Only edit those.
Task now: <paste the current timeline block>.
The UI is Streamlit and must call the API only through ui/api_client.py (with a USE_MOCK flag reading data/mock_values.json).
The audit log is append-only: triggers block UPDATE/DELETE, rows are SHA-256 hash-chained, append() is idempotent on decision_id.
Show me the plan first, then the code, then how to test it.
```
