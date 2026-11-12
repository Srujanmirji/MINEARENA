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
uvicorn api.main:app --reload --port 8000

# terminal 2 — dashboard
streamlit run ui/app.py
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
LLM_PROVIDER=gemini                 # gemini | groq
SEC_USER_AGENT="AuditLoop Team yourname@example.com"
API_BASE=http://localhost:8000
CONFIDENCE_THRESHOLD=0.85
YOY_THRESHOLD=0.30
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
├── ui/              # Streamlit dashboard                         (Sai)
├── data/            # app.db, checkpoints.db, mock_values.json
├── cache/           # cached SEC + LLM responses (commit this before judging!)
├── docs/            # PRD, architecture, API, data model, demo
└── tasks/           # one task file per teammate
```

## Companies

| Ticker | CIK | Why |
|---|---|---|
| AAPL | 320193 | Clean baseline, 5 geographic segments |
| MSFT | 789019 | Segments, clean balance sheet |
| NVDA | 1045810 | Revenue more than doubled → genuine YoY anomaly |
| TSLA | 1318605 | Noncontrolling interests → A = L + E ambiguity |
| JPM | 19617 | Bank, no plain "Revenue" line → genuine low confidence |

Backups if one breaks: AMZN, KO.
