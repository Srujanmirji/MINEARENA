# Team Rules — AuditLoop

Four people vibe coding in parallel will collide unless we follow these rules. They are short on purpose.

## 1. Folder ownership

| Folder | Owner | Others may |
|---|---|---|
| `core/models.py` | Everyone | Change only after posting in the group chat |
| `core/db.py`, `core/config.py` | Zeeshan | Ask Zeeshan |
| `agent/`, `api/` | Zeeshan | Read only |
| `edgar/`, `extract/` | Mayur | Read only |
| `scoring/`, `verify/`, `audit/`, `data/mock_values.json` | Srujan | Read only |
| `docs/` | Srujan | Anyone can fix typos |
| `ui/` | Sai | Read only |
| `tasks/<Name>.md` | That person | Tick your own boxes only |

**Only edit your own folders.** If you need something changed in someone else's module, message them, or write a small adapter in your own folder.

## 2. Git

```bash
git pull --rebase origin main      # before you start any change
git add <your folders only>
git commit -m "mayur: locator finds statements by name"
git push origin main
```

- Commit and push **at least every hour**.
- Prefix commit messages with your name.
- Commit to `main` directly; with folder ownership, branches add more risk than they remove at a hackathon.
- **Never commit `.env`.** `.gitignore` must contain:
  ```
  .env
  .venv/
  __pycache__/
  data/*.db
  data/*.db-*
  ```
- `cache/` **is** committed (it's our offline insurance). Commit it at the 3 AM checkpoint and again before judging.

## 3. Integration checkpoints

15 minutes each. Everyone stops, pulls, and runs the end-to-end path. If a checkpoint fails, everyone helps fix it before going back to their own work.

| Time | Must work | Lead |
|---|---|---|
| **1:45 PM** | `core/models.py` + `data/mock_values.json` merged; everyone imports them | Zeeshan |
| **4:00 PM** | Mock data → graph pauses → resume via API (Zeeshan's 5 tests) | Zeeshan |
| **8:00 PM** | Real AAPL: extract → score → validate → pause on a real escalation | Mayur |
| **11:00 PM** | UI drives approve, correct and reject; rows appear in the audit log | Sai |
| **3:00 AM** | All 5 companies + accuracy report vs XBRL | Srujan |
| **7:00 AM** | **Feature freeze**: bug fixes and rehearsal only | Srujan |

**Hard rule:** if pause/resume is not working by **6 PM**, everyone swarms on it. It carries 2 of the 8 judging criteria.

## 4. Sleep shifts

| Time | Asleep | Awake |
|---|---|---|
| 2:30–5:00 AM | Mayur, Sai | Zeeshan, Srujan |
| 5:00–7:00 AM | Zeeshan (till 7:30), Srujan | Mayur, Sai |

Nobody pitches on zero sleep.

## 5. Definition of done (for any task)

- [ ] Works on real data (or mock data if the task says so)
- [ ] Function signature matches `docs/ARCHITECTURE.md` §8
- [ ] Runs from a clean `git pull` on someone else's laptop
- [ ] Pushed to `main`
- [ ] Ticked in your `tasks/<Name>.md`

## 6. Using AI coding tools

Read [`CLAUDE.md`](CLAUDE.md). Paste the "starter prompt" from your task file into your AI tool at the start of each session. Never let the AI tool edit files outside your folders. Check `git diff` before every commit.
