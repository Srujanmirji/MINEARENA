# Zeeshan — P1: Agent + Backend Lead

**GitHub:** `dharwadzishan-sys` · **Folders you own:** `core/` (except models.py, which is shared), `agent/`, `api/`
**Read first:** `docs/ARCHITECTURE.md` (all of it), `docs/API.md`, `docs/DATA_MODEL.md` §1 and §3

## Your mission
Make the workflow **pause, survive a crash, and resume without doing anything twice.** That carries judging criteria 5 (workflow reliability) and much of 3 and 8. You are also the integrator: everyone's modules plug into your graph.

## You depend on
| From | What | When | Until then |
|---|---|---|---|
| Mayur | `edgar.client`, `edgar.locator`, `extract.extractor` | 8 PM | Stub nodes that load `data/mock_values.json` |
| Srujan | `scoring.confidence`, `scoring.validation`, `scoring.router` | 7 PM | Stub: mark values with `confidence < 0.85` as escalated |
| Srujan | `verify.xbrl`, `verify.report` | 2 AM | Stub returning `{}` |
| Srujan | `audit.log.append`, `audit.log.init_tables` | 4 PM | Stub that prints |

## Others depend on you
| Who | What | By |
|---|---|---|
| Everyone | `core/models.py` + `core/config.py` merged | **1:45 PM** |
| Sai | API endpoints in `docs/API.md` (`/runs`, `/pending`, `/decision` first) | **4 PM** |
| Everyone | `core/db.py` helpers | 3 PM |

---

## Timeline

### 1:15–1:45 PM — Repo + contract
- [ ] Create the repo skeleton: all folders with `__init__.py`, `requirements.txt`, `.env.example`, `.gitignore` (see `CONTRIBUTING.md`)
- [ ] `core/models.py`: copy from `docs/DATA_MODEL.md` §1 **exactly** (9 metrics incl. `operating_income`; `extractor`, `table_index` fields; deterministic `decision_id`)
- [ ] `core/config.py`: load `.env`; `THRESHOLD`, `YOY_THRESHOLD`, `SEC_USER_AGENT`, `LLM_PROVIDER`; `SYNONYMS` from DATA_MODEL §5; `WEIGHTS = {"agreement":0.45,"label":0.30,"period_unit":0.25}`; `DERIVED_CAP = 0.75`; `YOY_THRESHOLD` default 0.40; `TICKERS = ["AAPL","MSFT","NVDA","WMT","TSLA"]`
- [ ] Push. Tell the group "contract is merged"

### 1:45–3:00 PM — DB + graph skeleton
- [ ] `core/db.py`: `init_db()` (all tables except `audit_log`, which Srujan's `audit.log.init_tables()` creates; call it from `init_db`), `upsert_values`, `set_status`, `record_decision`, `get_values(thread_id|ticker)`, `get_config/set_config`
- [ ] `agent/state.py`: `AuditState` TypedDict (ARCHITECTURE §3)
- [ ] `agent/nodes.py`: all 11 nodes, in the order fetch → locate → extract → **score_confidence → validate** → route (matches PS Steps 3 → 4) → auto_approve → review loop → verify → report. Real `human_review` / `apply_decision` / `auto_approve`; others call stubs for now
- [ ] `agent/graph.py`: `build_graph()` with edges + conditional edges; long-lived `SqliteSaver` (see below)

```python
import sqlite3
from langgraph.checkpoint.sqlite import SqliteSaver
conn = sqlite3.connect("data/checkpoints.db", check_same_thread=False)
graph = build_graph().compile(checkpointer=SqliteSaver(conn))
```

### 3:00–4:00 PM — API v1 + the 5 tests  ⟵ **checkpoint 4 PM**
- [ ] `api/main.py`: `POST /runs` (background task), `GET /runs/{id}`, `GET /pending`, `POST /runs/{id}/decision`, `GET /health`
- [ ] **Test 1:** run on mock data pauses at the first escalated item
- [ ] **Test 2:** approve → resumes → pauses at the next item
- [ ] **Test 3:** kill uvicorn while paused, restart, `GET /runs/{id}` shows the same paused item
- [ ] **Test 4:** same decision sent twice (same `thread_id:value_id`) → one `review_decisions` row, one audit row, `"duplicate": true`
- [ ] **Test 5:** row count of `extracted_values` unchanged after resume

Put these tests in `api/test_flow.py` (plain `httpx` script or pytest). Run them at every checkpoint after this.

### 4:00–6:00 PM — Hardening
- [ ] Startup recovery: rebuild run list from DB, `graph.get_state` each, mark paused
- [ ] `GET /runs`, `GET /values`, `GET /validations`, `GET/PUT /config`, `GET /audit`, `GET /audit/verify` (call Srujan's module)
- [ ] 409 on wrong `value_id`, 422 on `correct` without `new_value`
- [ ] `auto_approve` writes audit rows with `reviewer="system"`, `decision_id=f"{thread_id}:{value_id}"` (same key as human decisions → a value can only ever be decided once)
- [ ] `/decision` derives `decision_id` itself, **records the decision in `review_decisions` before calling `Command(resume=...)`** (PS 3.5), and returns 422 if `correct`/`reject` has no `note`
- [ ] `GET /runs/{thread_id}/source/{value_id}` → table HTML with the row highlighted (calls Mayur's `extract.get_table_html`)
- [ ] **6 PM rule:** if tests 1–5 aren't green, call the team

### 6:00–8:00 PM — Wire real modules  ⟵ **checkpoint 8 PM (real AAPL)**
- [ ] Replace stubs with Mayur's `edgar` + `extract` and Srujan's `scoring` as they land
- [ ] Run AAPL end to end; fix serialization issues (state must hold dicts)

### 8:00–11:00 PM — UI integration  ⟵ **checkpoint 11 PM**
- [ ] Sit with Sai; make sure every UI call has an endpoint and matching shape
- [ ] `GET /report`, `GET /report.csv` (call Srujan's `build_report`)
- [ ] `POST /runs` with `force: true` → new thread id

### 11:00 PM–2:30 AM — All 5 companies
- [ ] Run AAPL, MSFT, NVDA, WMT, TSLA; fix crashes (WMT and TSLA have noncontrolling interest, so expect escalations)
- [ ] Errors set the run status to `error` with a message; they never crash the API

### 2:30–5:00 AM — Support verification  ⟵ **checkpoint 3 AM**
- [ ] Wire Srujan's `verify_vs_xbrl` + `report` nodes; re-run the test script

### 5:00–7:30 AM — Sleep

### 7:30 AM onward — Freeze + backup driver
- [ ] Bug fixes only. Run `api/test_flow.py` one last time
- [ ] Learn the demo (`docs/DEMO.md`); you're the backup driver and you own the kill-and-restart moment
- [ ] Bonus B-3 (MCP tools with FastMCP) **only** if everything above is green and Srujan agrees

---

## Rules you must not break
- `human_review` contains **only** `interrupt()` + `return {"decision": ...}`. No writes.
- One `interrupt()` per node.
- Every write keyed and idempotent.
- `graph.invoke(Command(resume=...))` is only called from the `/decision` endpoint.

## Starter prompt for your AI tool
```
I'm Zeeshan, P1 on the AuditLoop repo. Read CLAUDE.md, docs/ARCHITECTURE.md, docs/API.md and docs/DATA_MODEL.md.
I own core/ (except models.py), agent/ and api/. Only edit those.
Task now: <paste the current timeline block>.
Use LangGraph interrupt() + Command(resume=...) with a long-lived SqliteSaver(sqlite3.connect(..., check_same_thread=False)).
human_review must have NO side effects and no try/except around interrupt(); all writes go in apply_decision, idempotent by decision_id = f"{thread_id}:{value_id}".
Show me the plan first, then the code, then how to test it.
```
