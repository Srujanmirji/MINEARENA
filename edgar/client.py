"""SEC EDGAR client.

Fetches CIK, latest 10-K metadata, primary 10-K HTML document, and Company Facts.
All network calls route through edgar.cache.cached_get.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from edgar.cache import cached_get, get_network_call_count, reset_network_call_count

TICKERS: list[str] = ["AAPL", "MSFT", "NVDA", "WMT", "TSLA"]


def get_cik(ticker: str) -> str:
    """Return the 10-digit zero-padded CIK for a given stock ticker."""
    t_clean = ticker.strip().upper()
    url = "https://www.sec.gov/files/company_tickers.json"
    data = json.loads(cached_get(url).decode("utf-8"))
    for item in data.values():
        if item.get("ticker", "").upper() == t_clean:
            return str(item["cik_str"]).zfill(10)
    raise ValueError(f"Ticker {ticker} not found in SEC company tickers")


def get_latest_10k(cik: str) -> dict:
    """Return metadata for the most recent 10-K filing.

    Returns dict with keys: accession, fiscal_year, period_end, filing_date, primary_document
    """
    cik_pad = str(cik).zfill(10)
    url = f"https://data.sec.gov/submissions/CIK{cik_pad}.json"
    data = json.loads(cached_get(url).decode("utf-8"))
    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])

    idx = None
    for i, form in enumerate(forms):
        if form == "10-K":
            idx = i
            break

    if idx is None:
        raise ValueError(f"No 10-K filing found for CIK {cik}")

    accession = recent["accessionNumber"][idx]
    period_end = recent["reportDate"][idx]
    filing_date = recent["filingDate"][idx]
    primary_document = recent["primaryDocument"][idx]

    fiscal_year = None
    if "fiscalYear" in recent and recent["fiscalYear"][idx]:
        try:
            fiscal_year = int(recent["fiscalYear"][idx])
        except (ValueError, TypeError):
            pass
    if fiscal_year is None and period_end:
        try:
            fiscal_year = int(period_end.split("-")[0])
        except (ValueError, TypeError):
            pass

    return {
        "cik": cik_pad,
        "accession": accession,
        "fiscal_year": fiscal_year,
        "period_end": period_end,
        "filing_date": filing_date,
        "primary_document": primary_document,
        "company": data.get("name", ""),
    }


def get_primary_doc(cik: str, accession: str, primary_document: str) -> str:
    """Fetch raw HTML for the primary 10-K document via Archives URL (cached)."""
    cik_int = int(cik)
    accn_no_dashes = accession.replace("-", "")
    url = f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{accn_no_dashes}/{primary_document}"
    content = cached_get(url)
    return content.decode("utf-8", errors="replace")


def get_company_facts(cik: str) -> dict:
    """Fetch XBRL Company Facts JSON (cached). ONLY verify/ may call this."""
    cik_pad = str(cik).zfill(10)
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik_pad}.json"
    content = cached_get(url)
    return json.loads(content.decode("utf-8"))


def cache_company(ticker: str) -> dict:
    """Fetch and cache 10-K document and company facts for a ticker."""
    cik = get_cik(ticker)
    info = get_latest_10k(cik)
    # Cache primary document
    _ = get_primary_doc(cik, info["accession"], info["primary_document"])
    # Cache Company Facts
    _ = get_company_facts(cik)
    return {
        "ticker": ticker,
        "cik": cik,
        **info,
    }


def main():
    parser = argparse.ArgumentParser(description="SEC EDGAR client")
    parser.add_argument("--all", action="store_true", help="Cache 10-Ks and Company Facts for all 5 tickers")
    parser.add_argument("--ticker", type=str, help="Specific ticker to cache")
    args = parser.parse_args()

    tickers_to_fetch = TICKERS if args.all or not args.ticker else [args.ticker.upper()]

    results = []
    for t in tickers_to_fetch:
        res = cache_company(t)
        results.append(res)

    print(f"\n{'TICKER':<8} {'ACCESSION':<24} {'PERIOD_END':<12} {'PRIMARY_DOCUMENT'}")
    print("-" * 75)
    for r in results:
        print(f"{r['ticker']:<8} {r['accession']:<24} {r['period_end']:<12} {r['primary_document']}")
    print(f"\n[edgar.client] Finished processing {len(results)} companies. Network calls in this run: {get_network_call_count()}")


if __name__ == "__main__":
    main()
