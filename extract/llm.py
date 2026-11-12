"""LLM client for extraction.

Provides ask_json(prompt) -> dict with disk cache in cache/llm/<sha256(prompt)>.json.
Supports gemini (via google-genai) and groq.
Retries once on parse error.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

CACHE_DIR = ROOT / "cache" / "llm"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini").lower()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")


def _clean_json_text(text: str) -> str:
    """Strip markdown code fence if present."""
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        return match.group(1).strip()
    return text


def _call_gemini(prompt: str) -> str:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=GEMINI_API_KEY)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.0,
        ),
    )
    return response.text or ""


def _call_groq(prompt: str) -> str:
    from groq import Groq

    client = Groq(api_key=GROQ_API_KEY)
    chat_completion = client.chat.completions.create(
        messages=[
            {"role": "user", "content": prompt}
        ],
        model="llama-3.3-70b-versatile",
        response_format={"type": "json_object"},
        temperature=0.0,
    )
    return chat_completion.choices[0].message.content or ""


def ask_json(prompt: str) -> dict:
    """Send prompt to LLM in JSON mode with disk caching and retry."""
    prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    cache_path = CACHE_DIR / f"{prompt_hash}.json"

    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))

    # Select provider
    provider = LLM_PROVIDER
    if provider == "gemini" and not GEMINI_API_KEY:
        if GROQ_API_KEY:
            provider = "groq"
        else:
            raise RuntimeError("No LLM API keys configured (GEMINI_API_KEY or GROQ_API_KEY required)")
    elif provider == "groq" and not GROQ_API_KEY:
        if GEMINI_API_KEY:
            provider = "gemini"
        else:
            raise RuntimeError("No LLM API keys configured (GEMINI_API_KEY or GROQ_API_KEY required)")

    last_err: Exception | None = None
    for attempt in range(2):
        try:
            if provider == "gemini":
                raw = _call_gemini(prompt)
            else:
                raw = _call_groq(prompt)

            cleaned = _clean_json_text(raw)
            data = json.loads(cleaned)
            cache_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
            return data
        except Exception as e:
            last_err = e
            if attempt == 1:
                raise RuntimeError(f"LLM call failed after 2 attempts: {last_err}") from last_err

    raise RuntimeError(f"LLM call failed: {last_err}")


if __name__ == "__main__":
    test_prompt = 'Return JSON: {"status": "ok", "test": 123}'
    try:
        res = ask_json(test_prompt)
        print("[llm] Smoke test result:", res)
    except Exception as exc:
        print(f"[llm] Smoke test note (expected if no API key set): {exc}")

