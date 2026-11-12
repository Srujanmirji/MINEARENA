"""Disk cache for SEC EDGAR requests.

Keyed by sha256(url) under cache/sec/.
Enforces SEC rate limits (>=0.15s between network calls) and User-Agent from .env.
"""
from __future__ import annotations

import hashlib
import os
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

CACHE_DIR = ROOT / "cache" / "sec"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

SEC_USER_AGENT = os.getenv("SEC_USER_AGENT", "AuditLoop Team contact@example.com").strip('"\'')

_last_call_time: float = 0.0
_network_calls: int = 0


def get_network_call_count() -> int:
    return _network_calls


def reset_network_call_count() -> None:
    global _network_calls
    _network_calls = 0


def cached_get(url: str) -> bytes:
    """Fetch URL contents with disk caching, rate limiting, and retries.

    Cache key is sha256(url) stored in cache/sec/.
    Rate limit: 0.15s minimum between network requests (< 10 req/s per SEC rule).
    Retries once on 429 (rate limited) or 5xx (server error).
    """
    global _last_call_time, _network_calls

    key = hashlib.sha256(url.encode("utf-8")).hexdigest()
    cache_path = CACHE_DIR / key

    if cache_path.exists():
        return cache_path.read_bytes()

    headers = {
        "User-Agent": SEC_USER_AGENT,
        "Accept-Encoding": "gzip, deflate",
        "Host": httpx.URL(url).host,
    }

    def _do_request() -> httpx.Response:
        global _last_call_time, _network_calls
        now = time.time()
        elapsed = now - _last_call_time
        if elapsed < 0.15:
            time.sleep(0.15 - elapsed)
        _last_call_time = time.time()
        _network_calls += 1
        with httpx.Client(headers=headers, timeout=30.0, follow_redirects=True) as client:
            return client.get(url)

    resp = _do_request()

    # Retry once on 429 or 5xx
    if resp.status_code == 429 or resp.status_code >= 500:
        time.sleep(1.0)
        resp = _do_request()

    resp.raise_for_status()

    cache_path.write_bytes(resp.content)
    return resp.content


if __name__ == "__main__":
    test_url = "https://www.sec.gov/files/company_tickers.json"
    print(f"[cache] User-Agent: {SEC_USER_AGENT}")
    print(f"[cache] Testing cached_get on {test_url}")
    t0 = time.time()
    c1 = cached_get(test_url)
    calls1 = get_network_call_count()
    print(f"[cache] First fetch: {len(c1)} bytes, network calls: {calls1}, time: {time.time()-t0:.2f}s")

    t1 = time.time()
    c2 = cached_get(test_url)
    calls2 = get_network_call_count()
    print(f"[cache] Second fetch: {len(c2)} bytes, network calls: {calls2}, time: {time.time()-t1:.4f}s")
    assert c1 == c2
    assert calls1 == calls2
    print("[cache] Cache smoke test PASSED (zero network calls on 2nd fetch)")
