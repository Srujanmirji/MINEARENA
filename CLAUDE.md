# CLAUDE.md — rules for AI coding tools in this repo

You are helping a 4-person team build **AuditLoop** for MineArena PS-01 in 24 hours. Read `docs/PRD.md`, `docs/ARCHITECTURE.md` and `docs/DATA_MODEL.md` before writing code.

## Hard rules

1. **Only edit files in the current developer's folders** (see `CONTRIBUTING.md` §1). If a change is needed elsewhere, stop and say so.
2. **Never change `core/models.py`** without the developer confirming that the team agreed.
3. **Never call `get_company_facts` / XBRL Company Facts outside `verify/`.** It's the ground truth; using it in extraction or scoring invalidates the accuracy metric.
4. **Never put writes (DB, files, API calls) inside the `human_review` node.** LangGraph re-runs that node from the top on resume. All writes go in `apply_decision`, keyed by `decision_id`.
5. **All DB writes must be idempotent:** `INSERT OR IGNORE`, or upserts keyed by `id` / `decision_id`.
6. **Never UPDATE or DELETE `audit_log`.** It's append-only, and triggers will raise.
7. **Every SEC request:** send the `User-Agent` from `.env`, stay under 10 req/s, go through the disk cache in `edgar/cache.py`.
8. **Every LLM call:** go through `extract/llm.py` (cached by sha256 of the prompt, provider from `LLM_PROVIDER`), request JSON output, validate with Pydantic, retry once on parse failure.
9. **Streamlit never imports `agent/`.** UI talks to the API only (`ui/api_client.py`).
10. **No new dependencies** beyond `requirements.txt` without asking.
11. **No secrets in code.** Read keys from `.env` via `python-dotenv`.

## Style

- Python 3.11, type hints, small functions, no classes unless they hold state.
- Pure functions in `scoring/`, `verify/`, `extract/` where possible: easy to test with `data/mock_values.json`.
- Every module has a `if __name__ == "__main__":` smoke test that runs on mock or cached data.
- Log with `print(f"[module] ...")`. No logging frameworks.
- Prefer boring and working over clever.

## Gotchas you will hit

- `SqliteSaver.from_conn_string()` is a context manager. In FastAPI, use `SqliteSaver(sqlite3.connect(path, check_same_thread=False))`.
- Keep graph state JSON-friendly: store `ExtractedValue.model_dump()` dicts, not model objects.
- Resume with `graph.invoke(Command(resume=payload), config={"configurable": {"thread_id": tid}})`.
- After `invoke()`, a paused graph returns the payload in `result["__interrupt__"][0]`.
- **Never wrap `interrupt()` in a bare `try/except`.** It pauses by raising a special exception; a bare except swallows it and the graph never pauses.
- Pass only JSON-serializable values to `interrupt()` (dicts, not Pydantic objects).
- `pandas.read_html` needs `lxml`. SEC R pages have a header row with the scale ("In Millions") and dates.
- Company Facts contains restated values from later filings. Match on `accn` **and** `end`.
- Streamlit reruns the whole script on every interaction. Keep `decision_id` in `st.session_state`.
