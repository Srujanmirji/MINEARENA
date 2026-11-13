"""Revenue by segment from a 10-K segment table (PS 3.4 segment validation).

Three table shapes, all read from the current-year column (the first number in each row):
- flat:   one row per segment, closed by the table's own "Total revenue(s)/net sales" row
          (NVDA geography, TSLA "... segment revenue" rows). Accepted only if the rows sum to that
          printed total, so nested sub-rows (NVDA Data Center = Compute + Networking) are rejected.
- blocks:  a segment name row with no numbers, then its own revenue row (MSFT, WMT).
- columns: segment names as column headers ending in "Total" (NVDA); first Revenue row,
           accepted only if the parts sum to that row's own Total.
The check in scoring/validation.py then compares the segment sum to the *extracted* revenue,
so picking a table by its own printed total never makes that check pass by construction.
"""
from __future__ import annotations

import re

from bs4 import BeautifulSoup

from extract.table_parser import _clean_num

TOTAL_ROW = re.compile(r"^total (net )?(revenues?|net sales|sales)$")
BLOCK_REVENUE = (re.compile(r"^total (net )?revenues?$"), re.compile(r"^(net )?(revenues?|net sales|sales)$"))
FOOTNOTE = re.compile(r"\s*\(\d\)\s*:?$|:$")
SELF_TOTAL_TOLERANCE = 0.005
MIN_VALUE = 100  # segments carry real revenue; smaller numbers are footnotes, years or percentages


def _rows(table_html: str) -> list[tuple[str, float | None]]:
    """(label, first number) per row. A row with no number is a heading."""
    out = []
    for tr in BeautifulSoup(table_html, "lxml").find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
        cells = [c for c in cells if c and c not in ("$", "%", ")")]
        if not cells:
            continue
        label = FOOTNOTE.sub("", re.sub(r"\s+", " ", cells[0])).strip()
        nums = [n for n in (_clean_num(c) for c in cells[1:]) if n is not None and abs(n) >= MIN_VALUE]
        if re.search(r"\b(19|20)\d\d\b", label) or "in millions" in label.lower():
            continue  # column-header row
        out.append((label, nums[0] if nums else None))
    return out


def _flat(rows: list[tuple[str, float | None]]) -> list[dict]:
    run: list[tuple[str, float]] = []
    for label, value in rows:
        if value is None:
            run = []
        elif TOTAL_ROW.match(label.lower()):
            named = [r for r in run if "segment revenue" in r[0].lower()]
            picked = named if len(named) >= 2 else [r for r in run if not r[0].lower().startswith("total")]
            if len(picked) >= 2 and value and abs(sum(v for _, v in picked) - value) <= SELF_TOTAL_TOLERANCE * value:
                return [{"segment": lbl, "value": v} for lbl, v in picked]
            run = []
        else:
            run.append((label, value))
    return []


def _blocks(rows: list[tuple[str, float | None]]) -> list[dict]:
    found: dict[str, float] = {}
    heading, rank = None, len(BLOCK_REVENUE)
    for label, value in rows:
        if value is None:
            heading, rank = label, len(BLOCK_REVENUE)
            continue
        if heading is None or heading.lower().startswith(("total", "consolidated", "corporate")):
            continue
        for i, pat in enumerate(BLOCK_REVENUE):
            if i < rank and pat.match(label.lower()):   # "Total revenues" beats "Net sales" within a block
                found[heading], rank = value, i
                break
    # Equal values = several breakdowns of the same total (geography, end market), not segments.
    ok = len(found) >= 2 and len(set(found.values())) == len(found)
    return [{"segment": k, "value": v} for k, v in found.items()] if ok else []


def _columns(table_html: str) -> list[dict]:
    """Segments as columns ending in "Total" (NVDA), read from the first Revenue row (current year)."""
    names: list[str] = []
    for tr in BeautifulSoup(table_html, "lxml").find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
        cells = [c for c in cells if c and c not in ("$", "%", ")")]
        if not cells:
            continue
        if not names:
            if len(cells) >= 3 and cells[-1].lower() == "total":
                names = cells[:-1]
            continue
        nums = [n for n in (_clean_num(c) for c in cells[1:]) if n is not None]
        if any(p.match(cells[0].lower()) for p in BLOCK_REVENUE) and len(nums) == len(names) + 1:
            *parts, total = nums
            if total and abs(sum(parts) - total) <= SELF_TOTAL_TOLERANCE * total:
                return [{"segment": n, "value": v} for n, v in zip(names, parts)]
            return []
    return []


def parse_segments(table_html: str) -> list[dict]:
    """[{"segment", "value"}] in the table's own scale, or [] if the table isn't revenue by segment."""
    rows = _rows(table_html)
    # blocks before flat: inside a block, "Net sales + other income = Total revenues" looks flat
    return _columns(table_html) or _blocks(rows) or _flat(rows)


if __name__ == "__main__":
    def table(*rows: tuple[str, ...]) -> str:
        return "<table>" + "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows) + "</table>"

    nvda_geo = table(("Revenue by geography: (In millions)",), ("United States", "$", "149,617", "77,482"),
                     ("Taiwan (2)", "42,345", "23,600"), ("Other", "23,976", "29,415"),
                     ("Total revenue", "$", "215,938", "130,497"))
    assert [s["value"] for s in parse_segments(nvda_geo)] == [149617, 42345, 23976]

    nested = table(("Revenue by end market",), ("Data Center", "193,737"), ("Compute", "162,361"),
                   ("Networking", "31,376"), ("Gaming", "22,201"), ("Total revenue", "215,938"))
    assert parse_segments(nested) == [], "nested sub-rows must not sum past the printed total"

    tsla = table(("Automotive sales", "65,821"), ("Total automotive revenues", "69,526"), ("Services and other", "12,530"),
                 ("Total automotive & services and other segment revenue", "82,056"),
                 ("Energy generation and storage segment revenue", "12,771"), ("Total revenues", "$", "94,827"))
    assert [s["value"] for s in parse_segments(tsla)] == [82056, 12771]

    wmt = table(("(Amounts in millions)", "2026", "2025"), ("Walmart U.S.",), ("Net sales", "$", "482,975"),
                ("Membership and other income", "2,624"), ("Total revenues", "485,599"), ("Operating income", "25,158"),
                ("Walmart International",), ("Net sales", "130,423"), ("Total revenues", "131,988"),
                ("Corporate and support",), ("Operating income", "(2,000)"))
    assert parse_segments(wmt) == [{"segment": "Walmart U.S.", "value": 485599}, {"segment": "Walmart International", "value": 131988}]

    nvda_cols = table(("Compute & Networking", "Graphics", "Total"), ("(In millions)",), ("Year Ended Jan 25, 2026",),
                      ("Revenue", "$", "193,479", "$", "22,459", "$", "215,938"), ("Operating income", "130,141", "9,156", "139,297"),
                      ("Year Ended Jan 26, 2025",), ("Revenue", "116,193", "14,304", "130,497"))
    assert parse_segments(nvda_cols) == [{"segment": "Compute & Networking", "value": 193479}, {"segment": "Graphics", "value": 22459}]

    assert parse_segments(table(("Operating expenses", "31,100"), ("Operating income", "83,879"))) == []
    print("[segments] smoke test OK")
