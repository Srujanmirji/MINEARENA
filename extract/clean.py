"""Clean 10-K HTML by stripping inline XBRL (ix:) tags.

Keeps visible text and numbers; strips ix: tags, ix:header, and display:none elements.
"""
from __future__ import annotations

import re
import warnings
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)


def strip_ixbrl(html: str) -> str:
    """Strip inline XBRL tags and hidden elements from 10-K HTML.

    - unwrap every tag whose name starts with ix: (keep the text inside)
    - delete ix:header entirely and any element with display:none (hidden XBRL facts)
    """
    soup = BeautifulSoup(html, "lxml")

    # 1. Delete ix:header entirely
    for tag in soup.find_all(re.compile(r"^(ix:)?header$", re.I)):
        if tag.name.lower().startswith("ix:") or tag.name.lower() == "ix:header":
            tag.decompose()

    # Also search by tag name directly
    for tag in soup.find_all("ix:header"):
        tag.decompose()

    # 2. Delete any element with display:none (hidden XBRL facts)
    for tag in list(soup.find_all(True)):
        style = tag.get("style", "")
        if style and "display:none" in style.replace(" ", "").lower():
            tag.decompose()

    # 3. Unwrap every tag whose name starts with ix: (keep the text inside)
    for tag in list(soup.find_all(re.compile(r"^ix:", re.I))):
        tag.unwrap()

    return str(soup)


if __name__ == "__main__":
    from edgar.client import get_cik, get_latest_10k, get_primary_doc

    print("[clean] Loading AAPL 10-K from cache...")
    cik = get_cik("AAPL")
    meta = get_latest_10k(cik)
    raw_html = get_primary_doc(cik, meta["accession"], meta["primary_document"])
    print(f"[clean] Raw HTML length: {len(raw_html)} characters")

    cleaned = strip_ixbrl(raw_html)
    print(f"[clean] Cleaned HTML length: {len(cleaned)} characters")
    assert "<ix:" not in cleaned.lower()
    print("[clean] No <ix: tags found in cleaned HTML! Smoke test PASSED.")
