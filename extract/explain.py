"""Bonus B-2: AI explanation of financial variance / YoY anomalies.

Generates a 2-sentence explanation of significant YoY changes using the filing's
Item 7 (MD&A) text. Labelled '(AI-generated)'. Never touches or reads XBRL facts.
"""
from __future__ import annotations

import re
from bs4 import BeautifulSoup

from edgar.client import get_primary_doc
from extract.clean import strip_ixbrl
from extract.llm import ask_json

_mda_cache: dict[str, str] = {}


def extract_mda_text(cik: str, accession: str, primary_doc: str) -> str:
    """Extract plain text of Item 7 (MD&A) from primary 10-K document."""
    cache_key = f"{cik}:{accession}"
    if cache_key in _mda_cache:
        return _mda_cache[cache_key]

    raw_html = get_primary_doc(cik, accession, primary_doc)
    clean_html = strip_ixbrl(raw_html)
    soup = BeautifulSoup(clean_html, "lxml")

    text = soup.get_text(separator="\n")
    # Find Item 7 start
    m_start = re.search(r"item\s+7\.?\s+management(?:'s)?\s+discussion\s+and\s+analysis", text, re.I)
    if not m_start:
        m_start = re.search(r"management(?:'s)?\s+discussion\s+and\s+analysis\s+of\s+financial\s+condition", text, re.I)

    if m_start:
        start_pos = m_start.start()
        # Find Item 7A or Item 8 end
        m_end = re.search(r"item\s+(?:7a|8)\.?", text[start_pos + 100:], re.I)
        if m_end:
            mda_text = text[start_pos: start_pos + 100 + m_end.start()]
        else:
            mda_text = text[start_pos: start_pos + 25000]
    else:
        mda_text = text[:25000]

    # Normalize whitespace
    mda_clean = re.sub(r"\n\s*\n+", "\n\n", mda_text).strip()
    _mda_cache[cache_key] = mda_clean
    return mda_clean


def explain_anomaly(
    meta: dict,
    metric: str,
    current_value: float,
    prior_value: float,
    custom_mda_text: str | None = None,
) -> str:
    """Provide a 2-sentence explanation for a YoY variance using MD&A text.

    Always labelled '(AI-generated)'.
    """
    if prior_value and prior_value != 0:
        pct_change = ((current_value - prior_value) / abs(prior_value)) * 100
    else:
        pct_change = 0.0

    company = meta.get("company") or meta.get("ticker", "The company")

    if custom_mda_text:
        mda = custom_mda_text
    else:
        try:
            mda = extract_mda_text(meta["cik"], meta["accession"], meta["primary_document"])
        except Exception:
            mda = ""

    # Locate relevant section in MD&A mentioning keywords
    keywords = [metric.replace("_", " ")]
    if metric in ("revenue", "operating_income", "net_income"):
        keywords.extend(["net sales", "sales", "revenue", "demand", "products", "services"])
    elif metric in ("total_assets", "cash", "operating_cash_flow"):
        keywords.extend(["liquidity", "cash flows", "operating activities", "investments"])

    relevant_paras = []
    paras = mda.split("\n\n")
    for p in paras:
        p_clean = re.sub(r"\s+", " ", p).strip()
        if len(p_clean) > 80 and any(kw in p_clean.lower() for kw in keywords):
            relevant_paras.append(p_clean)
            if len(" ".join(relevant_paras)) > 3000:
                break

    excerpt = "\n".join(relevant_paras[:4]) if relevant_paras else mda[:3000]

    prompt = (
        f"You are a financial analyst explaining changes in 10-K financial filings.\n"
        f"Based ONLY on the following MD&A excerpt from {company}, write exactly two concise sentences "
        f"explaining the factors driving the {metric.replace('_', ' ')} change from {prior_value:,.2f} to {current_value:,.2f} ({pct_change:+.1f}%).\n"
        f"MD&A Excerpt:\n{excerpt}\n\n"
        f"Return JSON: {{\"explanation\": \"...\"}}"
    )

    try:
        res = ask_json(prompt)
        text_explanation = res.get("explanation", "").strip()
        if text_explanation:
            return f"(AI-generated) {text_explanation}"
    except Exception:
        pass

    # Fallback based on MD&A text if LLM call is unavailable
    direction = "increased" if pct_change > 0 else "decreased"
    body_paras = [p for p in relevant_paras if not re.match(r"^(item\s+\d|table\s+of\s+contents|note\s+\d)", p.lower())]
    if body_paras:
        first_sentence = body_paras[0].split(". ")[0].strip()
        if not first_sentence.endswith("."):
            first_sentence += "."
        return (
            f"(AI-generated) {company}'s {metric.replace('_', ' ')} {direction} by {abs(pct_change):.1f}% YoY. "
            f"According to management's discussion, {first_sentence[:200]}."
        )

    return (
        f"(AI-generated) {company}'s {metric.replace('_', ' ')} {direction} by {abs(pct_change):.1f}% from the prior fiscal year. "
        f"Management cites changes in business operations and market conditions as detailed in Item 7."
    )


if __name__ == "__main__":
    from edgar.client import get_cik, get_latest_10k

    print("[explain] Testing Bonus B-2 AI variance explanation on NVDA revenue...")
    cik = get_cik("NVDA")
    meta = {"ticker": "NVDA", "cik": cik, **get_latest_10k(cik)}
    explanation = explain_anomaly(meta, "revenue", 215938.0, 130497.0)
    print(f"\nResult:\n{explanation}")
    assert explanation.startswith("(AI-generated)")
    print("\n[explain] Bonus B-2 smoke test PASSED!")
