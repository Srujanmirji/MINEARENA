"""Bonus B-3: Step-scoped MCP (Model Context Protocol) server & tool router (PS-01 Page 3, PRD B-3).

Exposes SEC EDGAR filing retrieval (`get_filing`, `get_statement_tables`) and XBRL ground-truth
lookup (`get_xbrl_fact`) as MCP tools with strict per-step access control:
- Extraction nodes (`fetch_filing`, `locate_statements`, `extract`) can ONLY call `get_filing`
  and `get_statement_tables`.
- ONLY `verify_vs_xbrl` is granted `get_xbrl_fact` (CLAUDE.md rule 3: never touch XBRL before review).

Supports both in-process step-checked calls (`call_tool(step, name, arguments)`) and standard
MCP JSON-RPC 2.0 over stdio (`python -m agent.mcp_tools --stdio`).
"""
from __future__ import annotations

import json
import sys
from typing import Any

TOOLS: list[dict[str, Any]] = [
    {
        "name": "get_filing",
        "description": "Fetch latest Form 10-K metadata (CIK, accession, fiscal_year, period_end, primary_document) from SEC EDGAR.",
        "allowed_steps": ["fetch_filing", "locate_statements", "extract"],
        "inputSchema": {
            "type": "object",
            "properties": {"ticker": {"type": "string", "description": "Stock ticker symbol, e.g. AAPL"},
                           "year": {"type": "integer", "description": "Fiscal year; omit for the latest"}},
            "required": ["ticker"],
        },
    },
    {
        "name": "get_statement_tables",
        "description": "Fetch primary 10-K HTML with inline-XBRL (ix:*) stripped and locate primary financial statement tables.",
        "allowed_steps": ["locate_statements", "extract"],
        "inputSchema": {
            "type": "object",
            "properties": {"ticker": {"type": "string", "description": "Stock ticker symbol, e.g. AAPL"}},
            "required": ["ticker"],
        },
    },
    {
        "name": "get_xbrl_fact",
        "description": "Query SEC EDGAR XBRL Company Facts ground truth for a metric. Strictly restricted to the verify_vs_xbrl step after human review.",
        "allowed_steps": ["verify_vs_xbrl"],
        "inputSchema": {
            "type": "object",
            "properties": {
                "cik": {"type": "string"},
                "metric": {"type": "string"},
                "unit": {"type": "string", "default": "USD"},
                "accession": {"type": "string"},
                "period_end": {"type": "string"},
            },
            "required": ["cik", "metric", "accession", "period_end"],
        },
    },
]

STEP_PERMISSIONS: dict[str, set[str]] = {
    "fetch_filing": {"get_filing"},
    "locate_statements": {"get_filing", "get_statement_tables"},
    "extract": {"get_filing", "get_statement_tables"},
    "verify_vs_xbrl": {"get_xbrl_fact"},
}


def list_tools(step: str | None = None) -> list[dict[str, Any]]:
    """Return MCP tool definitions. If `step` is given, return only tools permitted in that graph node."""
    if step is None:
        return TOOLS
    allowed = STEP_PERMISSIONS.get(step, set())
    return [t for t in TOOLS if t["name"] in allowed]


def call_tool(step: str, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Execute an MCP tool with strict node-level access control (PRD Bonus B-3)."""
    allowed = STEP_PERMISSIONS.get(step, set())
    if name not in allowed:
        raise PermissionError(
            f"MCP policy violation: tool '{name}' is forbidden in step '{step}' "
            f"(allowed in '{step}': {sorted(allowed) or 'none'})."
        )

    if name == "get_filing":
        from edgar.client import get_cik, get_latest_10k
        ticker = str(arguments["ticker"]).strip().upper()
        cik = get_cik(ticker)
        meta = get_latest_10k(cik, arguments.get("year"))
        return {"ticker": ticker, **meta}

    if name == "get_statement_tables":
        from edgar.client import get_cik, get_latest_10k, get_primary_doc
        from extract.clean import strip_ixbrl
        from extract.locate import locate_statements
        ticker = str(arguments["ticker"]).strip().upper()
        cik = get_cik(ticker)
        meta = get_latest_10k(cik)
        raw_html = get_primary_doc(cik, meta["accession"], meta["primary_document"])
        tables = locate_statements(strip_ixbrl(raw_html))
        return {
            "ticker": ticker,
            "accession": meta["accession"],
            "statements": {k: {"index": v["index"], "heading": v["heading"], "scale": v["scale"]} for k, v in tables.items()},
        }

    if name == "get_xbrl_fact":
        # Rule 3: XBRL Company Facts is ONLY imported and called inside verify_vs_xbrl.
        from edgar.client import get_cik, get_company_facts, get_latest_10k
        from verify.xbrl import find_fact
        cik = str(arguments.get("cik") or get_cik(str(arguments["ticker"]).strip().upper()))
        accession = arguments.get("accession")
        period_end = arguments.get("period_end")
        if not accession or not period_end:
            meta = get_latest_10k(cik)
            accession = accession or meta["accession"]
            period_end = period_end or meta["period_end"]
        facts = get_company_facts(cik)
        unit = arguments.get("unit") or ("USD/shares" if arguments["metric"] == "eps_diluted" else "USD")
        found = find_fact(facts, arguments["metric"], unit, accession, period_end)
        if not found:
            return {"found": False, "xbrl_tag": None, "xbrl_value": None}
        tag, val = found
        return {"found": True, "xbrl_tag": tag, "xbrl_value": val}

    raise ValueError(f"Unknown MCP tool: {name}")


def handle_jsonrpc(req: dict[str, Any]) -> dict[str, Any]:
    """Standard MCP JSON-RPC 2.0 request handler (`initialize`, `tools/list`, `tools/call`)."""
    req_id = req.get("id")
    method = req.get("method", "")
    params = req.get("params") or {}

    try:
        if method == "initialize":
            result = {
                "protocolVersion": "2024-11-05",
                "serverInfo": {"name": "auditloop-sec-mcp", "version": "1.0.0"},
                "capabilities": {"tools": {}},
            }
        elif method == "tools/list":
            step = params.get("step")
            result = {"tools": list_tools(step)}
        elif method == "tools/call":
            step = params.get("step", "fetch_filing")
            out = call_tool(step, params["name"], params.get("arguments") or {})
            result = {"content": [{"type": "text", "text": json.dumps(out)}], "isError": False}
        else:
            return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Method not found: {method}"}}
        return {"jsonrpc": "2.0", "id": req_id, "result": result}
    except PermissionError as e:
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"content": [{"type": "text", "text": str(e)}], "isError": True},
        }
    except Exception as e:
        return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32000, "message": str(e)}}


def serve_stdio() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        resp = handle_jsonrpc(json.loads(line))
        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    if "--stdio" in sys.argv:
        serve_stdio()
        sys.exit(0)

    print("[mcp] Testing MCP server and step-scoped access control...")
    init_res = handle_jsonrpc({"jsonrpc": "2.0", "id": 1, "method": "initialize"})
    assert init_res["result"]["serverInfo"]["name"] == "auditloop-sec-mcp"

    extract_tools = [t["name"] for t in list_tools("extract")]
    verify_tools = [t["name"] for t in list_tools("verify_vs_xbrl")]
    print(f"[mcp] extract step tools: {extract_tools}")
    print(f"[mcp] verify_vs_xbrl step tools: {verify_tools}")
    assert "get_xbrl_fact" not in extract_tools
    assert verify_tools == ["get_xbrl_fact"]

    # 1. Allowed call: get_filing in fetch_filing
    filing = call_tool("fetch_filing", "get_filing", {"ticker": "AAPL"})
    print(f"[mcp] get_filing(AAPL) -> accession={filing['accession']} period_end={filing['period_end']}")
    assert filing["cik"] == "0000320193"

    # 2. Forbidden call: get_xbrl_fact in extract (MUST raise PermissionError)
    try:
        call_tool("extract", "get_xbrl_fact", {
            "cik": filing["cik"], "metric": "revenue",
            "accession": filing["accession"], "period_end": filing["period_end"],
        })
        raise AssertionError("get_xbrl_fact in extract should have been blocked!")
    except PermissionError as e:
        print(f"[mcp] blocked XBRL in extract as expected: {e}")

    # 3. Allowed call: get_xbrl_fact in verify_vs_xbrl
    fact = call_tool("verify_vs_xbrl", "get_xbrl_fact", {
        "cik": filing["cik"], "metric": "revenue",
        "accession": filing["accession"], "period_end": filing["period_end"],
    })
    print(f"[mcp] get_xbrl_fact(AAPL revenue) in verify_vs_xbrl -> {fact}")
    assert fact["found"] is True and fact["xbrl_value"] > 0
    print("[mcp] smoke test PASSED")
