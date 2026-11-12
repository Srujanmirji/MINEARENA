# Srujan — P4: Scoring, Validation, Ground Truth, Audit Log + Pitch (Team Lead)

**GitHub:** `Srujanmirji` · **Folders you own:** `scoring/`, `verify/`, `audit/`, `docs/`, `data/mock_values.json`
**Read first:** `docs/PRD.md` (all, especially FR-3/4/5/9/10/11 and §10), `docs/ARCHITECTURE.md` §5–8, `docs/DATA_MODEL.md` §2–4

## Your mission
Decide **which values a human must see**, **prove how good the system is**, and **make every decision tamper-evident**. You own judging criteria 2 (confidence), 3 (auto vs escalate), 4 (escalation precision), 7 (auditability) and the numbers behind 1 (accuracy). You present the pitch and run the team's checkpoints.

**Heaviest load on the team.** Protect your time: Sai handles the organisers, the slides and the demo clicks. Bonus B-1 has moved to Zeeshan, so you have no bonus work. If you fall behind, cut the segment check (show N/A).

## You depend on
| From | What | When | Until then |
|---|---|---|---|
| Zeeshan | `core/models.py`, `core/config.py` (WEIGHTS, SYNONYMS), `core/db.py` | 1:45 PM / 3 PM | — |
| Mayur | Real `ExtractedValue`s for AAPL | 8 PM | Your own `data/mock_values.json` |
| Mayur | Cached Company Facts JSON (`edgar.client.get_company_facts`) | 3 PM | — |

## Others depend on you
| Who | What | By |
|---|---|---|
| Sai, Zeeshan | `data/mock_values.json` (~20 rows, DATA_MODEL §2) | **1:45 PM** |
| Zeeshan | `audit.log`: `init_tables`, `append`, `list_rows`, `verify_chain` | **4 PM** |
| Zeeshan | `score_values`, `validate_filing`, `route` | **7 PM** |
| Zeeshan, Sai | `verify_values`, `build_report` (shape = `/report` in `docs/API.md`) | **2 AM** |
| Team | Integration checkpoints run on time | All night |

---

## Timeline

### 1:15–1:45 PM — Contract + mock data
- [ ] Walk the team through `core/models.py` for 5 minutes; everyone agrees; Zeeshan merges
- [ ] `data/mock_values.json`: 20 rows with the mix in DATA_MODEL §2 (8 clean, 4 low label, 3 A = L + E breaks, 2 big YoY, 1 derived, 2 null). Push by 1:45 so Sai can start the UI

### 1:45–3:30 PM — Audit log  ⟵ **deliver to Zeeshan by 4 PM**
- [ ] `audit/log.py`
  - `init_tables(conn)`: `audit_log` DDL + both triggers from DATA_MODEL §3
  - `append(entry) -> dict` (`entry["decision_id"] = f"{thread_id}:{value_id}"`, set by Zeeshan's code): `prev_hash` = last row's hash or `"GENESIS"`; `hash = sha256(prev_hash + json.dumps(row_without_seq_and_hash, sort_keys=True, default=str))`; `INSERT`; on `UNIQUE` failure for `decision_id`, return the existing row (idempotent)
  - `list_rows(limit=200)`: newest first
  - `verify_chain() -> {"ok", "rows", "broken_at_seq"}`: recompute in `seq` order
- [ ] Smoke test (`python -m audit.log`): append 3 → verify OK; same `decision_id` twice → still 3 rows; `UPDATE audit_log SET decision='approved' WHERE seq=1;` in `sqlite3 data/app.db` → error

### 3:30–7:00 PM — Confidence, validation, routing  ⟵ **deliver to Zeeshan by 7 PM**
Same order as the PS workflow: Step 3 confidence → Step 4 validation → Step 5 decision.
- [ ] `scoring/confidence.py`: `score_values(values, period_end) -> values`. **C = 0.45·A + 0.30·L + 0.25·P**
  | Part | How |
  |---|---|
  | `agreement` (A) | 1 if `alt_value` within 1 unit of `value`; 0.5 if one of them is None; 0 if they disagree |
  | `label` (L) | `max(rapidfuzz.fuzz.ratio(row_label.lower(), s) for s in SYNONYMS[metric]) / 100`. **Not** `token_set_ratio`: it scores long wrong labels as 100 |
  | `period_unit` (P) | 1 if `period_end ==` the filing's period end **and** scale detected; 0.5 if one; 0 if neither |
  `confidence = round(Σ WEIGHTS[k] × signals[k], 3)`; `is_derived` → `min(C, 0.75)`; `value is None` → 0
- [ ] `scoring/validation.py`: `validate_filing(values, segments, cfg) -> values`. Each result: `{"check","severity":"hard"|"soft","status":"passed"|"failed"|"na","detail"}`
  - **A = L + E (hard):** tolerance 0.5% of assets; if it fails and the equity label lacks "noncontrolling", note "equity may exclude NCI"; attach to assets, liabilities, equity
  - **Segment sum (hard):** only if `segments` is non-empty, else `na`; attach to revenue
  - **YoY (soft):** change > 40% → `"+114% vs prior"`
  - **Scale sanity (hard):** 500 ≤ value/prior ≤ 2000 (or the reverse) → `"possible scale error"`
  - **Sign (hard):** revenue, total assets, total liabilities must be > 0
- [ ] `scoring/router.py`: `route(values, threshold) -> (values, pending_ids)`
  - auto-approve iff value present **and** confidence ≥ threshold (per-metric override from `config` if set) **and** no failed check of **any** severity (PS: pause whenever a validation check fails, even if the threshold slider is lowered) **and** label match ≥ 0.80 (`LABEL_FLOOR`: L weighs only 0.30, so a wrong row with L≈0.53 would still score C≈0.86)
  - else `status="escalated"`, `escalation_reason` = failed checks + weakest signal, e.g. `"A=L+E off by 2.1%; label match 0.71"`
  - `pending_ids` ordered: failed checks first, then lowest confidence
- [ ] `python -m scoring.router` on mock data prints: metric · confidence · status · reason

> Ask your AI tool to write these. The table above *is* the spec; paste it in.

### 7:00–8:00 PM — Real AAPL  ⟵ **checkpoint 8 PM (Mayur leads)**
- [ ] Run your functions on Mayur's real AAPL output; check the 3 score parts look sane. AAPL must pass every validation (its real values balance: 308,030 + 56,950 = 364,980)

### 8:00–11:00 PM — Ground truth
- [ ] `verify/xbrl.py`: `verify_values(values, facts, accession) -> rows` (DATA_MODEL §4)
  - tag list per metric; first tag with a matching fact wins
  - match on `accn == accession`, `form == "10-K"`, `fp == "FY"` and `end == period_end`; duration metrics also need `start` ≈ one year before `end`
  - compare in base units (`final_value × scale`); correct if |our − xbrl| ≤ **one unit of the table's scale** (`scale`; 0.01 for EPS)
  - also compute `orig_match` from the pre-review `value` (needed for escalation precision)
  - write `verification` rows (`INSERT OR REPLACE`; re-verification is allowed)
- [ ] **11 PM checkpoint is Sai's.** Attend, but don't drive it

### 11:00 PM–2:00 AM — Report  ⟵ **deliver to Zeeshan + Sai by 2 AM**
- [ ] `verify/report.py`: `build_report(thread_id=None) -> dict`, exactly the `/report` shape in `docs/API.md`
  - accuracy (final) + pre-review accuracy; by metric; by company; no-ground-truth count
  - auto-approved / escalated / reviewed / pending
  - **escalation precision** = escalated with `orig_match == 0` **or** a failed YoY ÷ all escalated
  - **auto-approval error rate** = auto-approved with `match == 0` ÷ all auto-approved
  - calibration bands `<0.6`, `0.6–0.85`, `>0.85`

### 2:00–3:00 AM — All 5  ⟵ **checkpoint 3 AM (you lead)**
- [ ] Full report for all 5; send the mismatch list to Mayur
- [ ] **3 AM call:** if the report isn't ready, cut all bonus features

### 2:40–3:00 AM — Reliability proof (you run it, no code)
- [ ] Copy `data/` aside, delete `data/app.db` + `data/checkpoints.db`, run all 5 companies end to end (auto-approve everything that pauses, using a script or the UI)
- [ ] Do it a **second time** from clean. Record: crashes (target 0), identical extracted values both runs (target yes), wrong auto-approvals (target 0)
- [ ] Put the line on Sai's results slide: "5 companies, 2 full runs, 0 crashes, identical results, 0 wrong auto-approvals". Use the **real** numbers, whatever they are
- [ ] Restore the demo `data/` afterwards

### 3:00–5:00 AM — Honest tuning + pitch numbers
- [ ] Auto-approval error rate > 0? Find out why; fix the signal or raise the threshold
- [ ] **Pick one threshold and keep it.** Re-tuning on the same 45 values is overfitting, and judges may ask
- [ ] Put the real numbers into `docs/DEMO.md` and give Sai 3 bullets for the results slide (accuracy, escalation precision, calibration)
- [ ] Problem-slide statistics: keep only ones with a source you've opened yourself. Zeeshan's draft had "1 in 3" and "1 in 4" for the same stat; cut anything you can't cite

### 5:00–7:00 AM — Sleep

### 7:00 AM — **Feature freeze** (you announce it)
- [ ] Set up the demo state (`docs/DEMO.md` checklist); make sure `cache/` is committed
- [ ] Rehearse twice with a timer: you present, Sai drives, Zeeshan does the kill-and-restart
- [ ] No bonus work for you. B-1 moved to Zeeshan. Use any spare time to rehearse

---

## Calls you make as lead
| When | Call |
|---|---|
| 6 PM | Pause/resume not green? Everyone swarms on it |
| Any checkpoint fails | No new features until it passes |
| 3 AM | Report not ready? Cut all bonus features |
| 7 AM | Freeze: no new features, period |

## Rules you must not break
- `scoring/` never reads XBRL. Only `verify/` does, and only after reviews.
- Scoring functions are pure (values in → values out), testable on mock data.
- Report numbers must be recomputable from `app.db`. No hand-typed numbers in slides.
- Never UPDATE or DELETE `audit_log`.

## Starter prompt for your AI tool
```
I'm Srujan, P4 on the AuditLoop repo. Read CLAUDE.md, docs/PRD.md (FR-3/4/5/9/10/11, §10), docs/ARCHITECTURE.md §5-8, docs/DATA_MODEL.md §2-4 and tasks/Srujan.md.
I own scoring/, verify/, audit/, docs/ and data/mock_values.json. Only edit those.
Task now: <paste the current timeline block>.
Scoring functions must be pure and work on ExtractedValue lists. XBRL Company Facts may only be used inside verify/.
audit_log is append-only: triggers block UPDATE/DELETE, rows are SHA-256 hash-chained, append() is idempotent on decision_id.
Show me the plan first, then the code, then a command to test it on data/mock_values.json.
```
