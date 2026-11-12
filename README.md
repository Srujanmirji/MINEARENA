# AuditLoop — Human-in-the-Loop Financial Filing Auditor

**MineArena 1.0 · PS-01 · Code Commit, BIET Davangere · 12–13 Nov 2026**

AuditLoop is an agent that pulls real 10-K filings from SEC EDGAR, extracts 8 financial metrics per company, scores its confidence in each one, and validates them with accounting rules. When it is unsure, it **pauses for a human reviewer**, then **resumes from a saved checkpoint without repeating work**. Every human decision is written to an **append-only, hash-chained audit log**. At the end, every value is checked against SEC XBRL Company Facts (the ground truth).

> Rename the product if you like. "AuditLoop" is a placeholder.

---

## Team

| Person | GitHub | Role | Task file |
|---|---|---|---|
| Zeeshan Madras | `dharwadzishan-sys` | P1 — Agent + backend lead | [`tasks/Zeeshan.md`](tasks/Zeeshan.md) |
| Mayur Habib | `mayurhabib26-hub` | P2 — SEC data + extraction | [`tasks/Mayur.md`](tasks/Mayur.md) |
| Sai Sudheer | `SaiSudhee2723` | P3 — Frontend + UI/UX (Streamlit dashboard, slides) | [`tasks/Sai.md`](tasks/Sai.md) |
| Srujan Mirji | `Srujanmirji` | P4 — Scoring, validation, ground truth, audit log, pitch (lead) | [`tasks/Srujan.md`](tasks/Srujan.md) |

## Docs

| File | What it is |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Product requirements, A to Z. Read this first. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, LangGraph flow, idempotency rules |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Shared Pydantic schema, SQLite tables, XBRL tag map |
| [`docs/API.md`](docs/API.md) | FastAPI endpoint contract (request/response examples) |
| [`docs/DEMO.md`](docs/DEMO.md) | 5-minute demo script + judge Q&A prep |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Git rules, folder ownership, integration checkpoints |
| [`CLAUDE.md`](CLAUDE.md) | Rules for AI coding tools (Claude Code / Cursor) in this repo |

## Quick start

```bash
git clone https://github.com/Srujanmirji/MINEARENA.git && cd MINEARENA
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                    # fill in keys

# terminal 1 — backend
uvicorn api.main:app --port 8000

# terminal 2 — reviewer dashboard (React, the demo UI)
cd ui/frontend && npm install && npm run dev            # http://localhost:5173 (proxies /api to :8000)

# backup UI only (if the React app is unavailable): streamlit run ui/app.py
```

One-command proof run (2 clean runs of all 5 companies, prints the slide numbers):
```bash
python -m verify.run_all
```

### `requirements.txt`
```
langgraph
langgraph-checkpoint-sqlite
fastapi
uvicorn
streamlit
google-genai
groq
pydantic
httpx
pandas
lxml
beautifulsoup4
rapidfuzz
python-dotenv
```

### `.env.example`
```
GEMINI_API_KEY=
GROQ_API_KEY=
LLM_PROVIDER=groq                   # groq (openai/gpt-oss-120b) | gemini (gemini-3.8-flash); the other is the automatic backup
SEC_USER_AGENT="AuditLoop Team yourname@example.com"
API_BASE=http://localhost:8000
CONFIDENCE_THRESHOLD=0.85
YOY_THRESHOLD=0.40
```

## Folder structure

```
auditloop/
├── core/            # shared: models.py, db.py, config.py        (Zeeshan; models.py = everyone)
├── edgar/           # SEC client, disk cache, page locator        (Mayur)
├── extract/         # LLM + fuzzy extraction                      (Mayur)
├── scoring/         # confidence, validation, routing             (Srujan)
├── verify/          # XBRL ground truth + report                  (Srujan)
├── agent/           # LangGraph graph + nodes                     (Zeeshan)
├── api/             # FastAPI app                                 (Zeeshan)
├── audit/           # append-only log + hash chain                (Srujan)
├── ui/              # React reviewer dashboard (ui/frontend); Streamlit backup (ui/app.py)  (Sai)
├── data/            # app.db, checkpoints.db, mock_values.json
├── cache/           # cached SEC + LLM responses (commit this before judging!)
├── docs/            # PRD, architecture, API, data model, demo
└── tasks/           # one task file per teammate
```

## Companies

| Ticker | CIK | Why |
|---|---|---|
| AAPL | 320193 | Clean baseline; 5 geographic segments sum to revenue |
| MSFT | 789019 | Clean balance sheet (A = L + E exact) |
| NVDA | 1045810 | Revenue +65% year on year → genuine YoY anomaly |
| WMT | 104169 | No total-liabilities line → liabilities derived (capped at 0.75, a human checks); noncontrolling interest makes A = L + E miss by 2.2% |
| TSLA | 1318605 | Noncontrolling interest → A = L + E misses by 0.5%; the live pause in the demo |

Backups if one breaks: KO, GOOGL, JNJ, PG. CIKs are resolved at runtime from `company_tickers.json`; the table is for reference.

**Approach in one line:** extract from the filed 10-K document (inline-XBRL tags stripped) with two independent extractors, grade against XBRL Company Facts.
