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

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "groq").lower()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
# gemini-2.5-flash and llama-3.3-70b-versatile were retired; both replacements tested in JSON mode.
GROQ_MODEL = "openai/gpt-oss-120b"
GEMINI_MODEL = "gemini-3.8-flash"


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
        model=GEMINI_MODEL,
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
        model=GROQ_MODEL,
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

    # Configured provider first; the other one is the backup when a call FAILS, not only when a key is missing.
    keys = {"groq": GROQ_API_KEY, "gemini": GEMINI_API_KEY}
    calls = {"groq": _call_groq, "gemini": _call_gemini}
    order = [p for p in (LLM_PROVIDER, *(k for k in keys if k != LLM_PROVIDER)) if keys.get(p)]
    if not order:
        raise RuntimeError("No LLM API keys configured (GEMINI_API_KEY or GROQ_API_KEY required)")

    errors: list[str] = []
    for provider in order:
        for attempt in range(2):  # retry once (CLAUDE.md rule 8)
            try:
                data = json.loads(_clean_json_text(calls[provider](prompt)))
                cache_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
                return data
            except Exception as e:
                errors.append(f"{provider} attempt {attempt + 1}: {str(e)[:120]}")
        print(f"[llm] {provider} failed twice, trying next provider")

    raise RuntimeError("LLM call failed: " + " | ".join(errors))


if __name__ == "__main__":
    test_prompt = 'Return JSON: {"status": "ok", "test": 123}'
    try:
        res = ask_json(test_prompt)
        print("[llm] Smoke test result:", res)
    except Exception as exc:
        print(f"[llm] Smoke test note (expected if no API key set): {exc}")

