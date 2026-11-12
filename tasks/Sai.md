# Sai — P3: Scoring, Validation + Ground Truth

**GitHub:** `SaiSudhee2723` · **Folders you own:** `scoring/`, `verify/`, `data/mock_values.json`
**Read first:** `docs/PRD.md` FR-3, FR-4, FR-5, FR-9, FR-10 and §10, `docs/ARCHITECTURE.md` §5–6 + §8, `docs/DATA_MODEL.md` §4

## Your mission
Decide **which values a human must see**, and **prove how good the system is**. You own judging criteria 2 (confidence), 3 (auto vs escalate), 4 (escalation precision) and the numbers behind 1 (accuracy).

## You depend on
| From | What | When | Until then |
|---|---|---|---|
| Zeeshan | `core/models.py`, `core/config.py` (WEIGHTS, SYNONYMS) | 1:45 PM | — |
| Mayur | Real `ExtractedValue`s for AAPL | 8 PM | Your own `data/mock_values.json` |
| Mayur | Cached Company Facts JSON (`edgar.client.get_company_facts`) | 3 PM | — |

## Others depend on you
| Who | What | By |
|---|---|---|
| Everyone | `data/mock_values.json` (~20 rows, see DATA_MODEL §2) | **1:45 PM** |
| Zeeshan | `score_values`, `validate_filing`, `route` | 7 PM |
| Zeeshan, Srujan | `verify_values`, `build_report` (shape in `docs/API.md` → `/report`) | **2 AM** |

---

## Timeline

### 1:15–1:45 PM — Mock data
- [ ] `data/mock_values.json` with the mix in DATA_MODEL §2 (clean, low label, A = L + E break, big YoY, derived, null)
- [ ] Push. Srujan builds the UI on this, so make it realistic

### 1:45–4:00 PM — Confidence
- [ ] `scoring/confidence.py`: `score_values(values, period_end) -> values`
  | Signal | How |
  |---|---|
  | `verbatim` | Format `value` with and without commas; 1 if found in `source_snippet`, else 0. `is_derived` → 0 |
  | `label` | `max(rapidfuzz.fuzz.token_set_ratio(row_label, s) for s in SYNONYMS[metric]) / 100` |
  | `scale` | 1 if `scale` was read from the header (Mayur sets `scale` > 1, or the metric is EPS), else 0.5 |
  | `period` | 1 if `period_end == filing period_end`, else 0 |
  | `agreement` | 1 if `alt_value == value`, 0.5 if `alt_value is None`, else 0 |
- [ ] `confidence = round(sum(WEIGHTS[k] * signals[k]), 3)`; `value is None` → confidence 0

### 4:00–7:00 PM — Validation + routing  ⟵ **your checkpoint 7 PM**
- [ ] `scoring/validation.py`: `validate_filing(values, segments, yoy_threshold) -> values`
  - **A = L + E:** tolerance 0.5% of assets. If it fails and the equity row label lacks "noncontrolling", note "may exclude NCI". Attach `{"check":"A=L+E","status":"failed","detail":"off by 2.1%"}` to assets, liabilities and equity
  - **Segment sum:** only if `segments` is non-empty; attach to revenue; else `status: "na"`
  - **YoY:** for each value with `prior_value`, change > threshold → `{"check":"yoy","status":"failed","detail":"+114% vs prior"}`
- [ ] `scoring/router.py`: `route(values, threshold) -> (values, pending_ids)`
  - auto-approve iff `value is not None` and `confidence >= threshold` (per-metric override from `config` if present) and no `failed` check
  - else `status="escalated"`, `escalation_reason` = failed checks + the weakest signal, e.g. `"A=L+E off by 2.1%; label match 0.71"`
  - `pending_ids` ordered: failed checks first, then lowest confidence
- [ ] `python -m scoring.router` on mock data prints a table: metric · confidence · status · reason

### 7:00–8:00 PM — Real AAPL  ⟵ **checkpoint 8 PM**
- [ ] Run your functions on Mayur's real AAPL output; check the signals look sane

### 8:00–11:00 PM — Ground truth
- [ ] `verify/xbrl.py`: `verify_values(values, facts, accession) -> rows` (DATA_MODEL §4)
  - tag list per metric, first tag with a matching fact wins
  - match: `accn == accession` and `end == period_end`; duration metrics also need `start` ≈ one year before
  - compare in base units: `our = final_value * scale`; correct if `|our − xbrl| / |xbrl| <= 0.001`
  - also compute `orig_match` using the pre-review `value` (needed for escalation precision)
  - write `verification` rows (`INSERT OR REPLACE`; verification can be redone)

### 11:00 PM–2:00 AM — Report  ⟵ **deliver to Zeeshan + Srujan by 2 AM**
- [ ] `verify/report.py`: `build_report(thread_id=None) -> dict` with exactly the shape in `docs/API.md` `/report`
  - accuracy (final), pre-review accuracy, by metric, by company, no ground truth count
  - auto-approved vs escalated vs reviewed vs pending
  - **escalation precision** = escalated where `orig_match == 0` **or** a YoY check failed ÷ all escalated
  - **auto-approval error rate** = auto-approved with `match == 0` ÷ all auto-approved
  - calibration bands `<0.6`, `0.6–0.85`, `>0.85`

### 2:00–3:00 AM — All 5  ⟵ **checkpoint 3 AM**
- [ ] Full report for all 5 companies; send the mismatch list to Mayur

### 3:00–5:00 AM — Honest tuning
- [ ] If auto-approval error rate > 0: find out why, and raise the threshold or fix the signal
- [ ] **Pick one threshold and keep it.** Re-tuning on the same 40 values until everything looks perfect is overfitting, and judges may ask
- [ ] Write 3 bullets for the pitch: accuracy, escalation precision, calibration. Give them to Srujan

### 5:00–7:30 AM — Sleep

### 7:30 AM onward — Freeze
- [ ] Bonus B-1 adaptive thresholds **only** if everything is green (PRD §7)
- [ ] Be ready for the judge question "how is confidence computed?" (`docs/DEMO.md`)

---

## Rules you must not break
- `scoring/` never reads XBRL. Only `verify/` does, and only after reviews.
- All scoring functions are pure (input values → output values), so they're testable with mock data.
- Report numbers must be recomputable from `app.db`. No hand-entered numbers.

## Starter prompt for your AI tool
```
I'm Sai, P3 on the AuditLoop repo. Read CLAUDE.md, docs/PRD.md (FR-3/4/5/9/10, §10), docs/ARCHITECTURE.md §5-8 and docs/DATA_MODEL.md.
I own scoring/, verify/ and data/mock_values.json. Only edit those.
Task now: <paste the current timeline block>.
Scoring functions must be pure and work on ExtractedValue lists. XBRL Company Facts may only be used inside verify/.
Show me the plan first, then the code, then a command to test it on data/mock_values.json.
```
