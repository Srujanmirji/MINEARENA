"""LLM extraction prompt templates."""

EXTRACTION_PROMPT = """You are extracting figures from one financial statement table of a US company's 10-K.
Table (rows separated by newlines, cells by " | "):
{table_text}
Metrics to find, with common row labels: {metrics_with_synonyms}
Rules:
- Use ONLY numbers that appear in the table. Never compute, round or guess.
- current_value = the most recent fiscal year column; prior_value = the previous year.
- snippet = the full table row exactly as written, copied character for character.
- If a metric is not in this table, omit it.
Return JSON: {{"items": [{{"metric": "...", "row_label": "...", "current_value": number, "prior_value": number|null,
                         "column_header": "...", "snippet": "..."}}]}}
"""

