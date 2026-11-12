/**
 * Typed client for the AuditLoop FastAPI backend (docs/API.md, api/main.py).
 *
 * The UI talks to the API only (CLAUDE.md rule 9). In dev, Vite proxies `/api/*` to
 * http://localhost:8000 (vite.config.ts), so the browser needs no CORS. Override with
 * VITE_API_BASE, e.g. VITE_API_BASE=http://localhost:8000 when the API allows CORS.
 */

const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '/api';

export type Metric =
  | 'revenue' | 'operating_income' | 'net_income' | 'eps_diluted'
  | 'total_assets' | 'total_liabilities' | 'equity' | 'operating_cash_flow' | 'cash'
  | 'gross_profit' | 'capex' | 'long_term_debt' | 'free_cash_flow';

export type ValueStatus = 'extracted' | 'auto_approved' | 'escalated' | 'approved' | 'corrected' | 'rejected';
export type RunStatus = 'running' | 'paused' | 'done' | 'error';
export type Action = 'approve' | 'correct' | 'reject';

export interface Check {
  check: string;                       // "A = L + E", "Segment sum", "Year-on-year", "Scale sanity", "Sign"
  severity: 'hard' | 'soft';
  status: 'passed' | 'failed' | 'na';
  detail: string;
}

/** One extracted value (core/models.py ExtractedValue). Amounts are as shown in the table; × scale = dollars. */
export interface ExtractedValue {
  id: string;                          // "<accession>:<metric>"
  thread_id?: string;
  ticker: string;
  company?: string | null;
  accession: string;
  fiscal_year?: number;
  metric: Metric;
  value: number | null;
  unit: string;                        // "USD" or "USD/shares"
  scale: number;                       // 1_000_000 when "in millions"
  period_start: string | null;
  period_end: string;
  prior_value: number | null;
  extractor: string;                   // "parser" | "llm"
  alt_value: number | null;            // the other extractor's answer
  source_page: string;
  table_index: number | null;
  row_label: string;
  source_snippet: string;
  confidence: number;
  signals: Partial<Record<'agreement' | 'label' | 'period_unit', number>>;
  validation: Check[];
  status: ValueStatus;
  escalation_reason: string | null;
  final_value: number | null;
  is_derived: boolean;
  history?: Record<string, number>;
}

export interface Health { ok: boolean; db: boolean; llm_provider: string; paused_runs: number }
export interface StartRunResult { thread_id: string; status: RunStatus; created: boolean }
export interface SegmentItem { segment: string; value: number }
export interface RunSummary {
  thread_id: string; ticker: string; status: RunStatus;
  accession?: string | null; period_end?: string | null;
  steps_done?: string[]; next?: string[];
  segments?: SegmentItem[];
  n_values: number; n_pending: number; n_auto: number; n_reviewed: number; error: string | null;
}
export interface RunDetail {
  thread_id: string; status: RunStatus; next: string[]; steps_done: string[];
  interrupt: { value: ExtractedValue; reason: string | null } | null;
  error: string | null;
}
export interface PendingItem { thread_id: string; is_current: boolean; value: ExtractedValue; reason: string | null }
export interface DecisionIn { value_id: string; action: Action; new_value?: number; reviewer?: string; note?: string }
export interface DecisionResult { status: RunStatus; next_value_id: string | null; duplicate: boolean }
export interface ValidationRow {
  ticker: string; thread_id: string; metric: Metric;
  check: string; severity: 'hard' | 'soft'; status: 'passed' | 'failed' | 'na'; detail: string;
}
export interface Config { threshold: number; yoy_threshold: number; equation_tolerance?: number; applies_to: string }
export interface AuditRow {
  seq: number; ts: string; decision_id: string; thread_id: string; value_id: string; metric: Metric;
  original_value: number | null; corrected_value: number | null;
  decision: 'approved' | 'corrected' | 'rejected' | 'auto_approved';
  reviewer: string; reason: string | null; prev_hash: string; hash: string;
}
export interface ChainCheck { ok: boolean; rows: number; broken_at_seq: number | null }
export interface SourceEvidence { heading: string; scale_text: string; html: string; row_found: boolean; source_url: string }

export interface Accuracy { verifiable: number; correct: number; accuracy: number | null }
export interface ReportRow {
  value_id: string; thread_id: string; ticker: string; metric: Metric; status: ValueStatus;
  confidence: number; escalation_reason: string | null;
  orig_value: number | null; our_value: number | null; xbrl_tag: string | null; xbrl_value: number | null;
  abs_error: number | null; match: boolean | null; orig_match: boolean | null; yoy_anomaly: boolean;
}
/** verify/report.py build_report(). Every number is recomputed from app.db. */
export interface Report {
  thread_id: string | null;
  overall: Accuracy & { pre_review_accuracy: number | null; no_ground_truth: number };
  by_metric: Record<string, Accuracy>;
  by_company: Record<string, Accuracy>;
  decisions: { auto_approved: number; escalated: number; reviewed: number; pending: number };
  escalation_precision: number | null;
  auto_approval_error_rate: number | null;
  calibration: { band: string; n: number; accuracy: number | null }[];
  rows: ReportRow[];
}

/** Non-2xx response. `status` 409 = not the paused item / run not paused; 422 = invalid body. */
export class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(`API ${status}: ${detail}`);
  }
}

function query(params: Record<string, string | number | undefined>): string {
  const q = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return q.length ? '?' + new URLSearchParams(q.map(([k, v]) => [k, String(v)])).toString() : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
    });
  } catch {
    throw new ApiError(0, 'Backend unreachable. Is the API running on port 8000?');
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail ?? body);
    } catch { /* non-JSON error body: keep statusText */ }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });
const put = <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) });

export interface McpTool { name: string; description: string; allowed_steps: string[] }
export interface McpToolsInfo { server: string; protocol_version: string; tools: McpTool[]; step_permissions: Record<string, string[]> }
export interface McpCallResult { ok: boolean; step: string; tool: string; result: Record<string, unknown> | null; error: string | null }

export interface Company { ticker: string; name: string; cik: string }

export const api = {
  health: () => request<Health>('/health'),
  mcpTools: () => request<McpToolsInfo>('/mcp/tools'),
  mcpCall: (step: string, name: string, arguments_: Record<string, unknown>) =>
    post<McpCallResult>('/mcp/call', { step, name, arguments: arguments_ }),

  /** Search SEC's ticker list by ticker or name (any US company that files a 10-K). */
  searchCompanies: (q: string) => request<Company[]>('/companies' + query({ q, limit: 8 })),

  /** Starts a run in the background, or returns the existing one (created: false) unless force. */
  /** year: audit that fiscal year's 10-K instead of the latest. */
  startRun: (ticker: string, force = false, year?: number) => post<StartRunResult>('/runs', { ticker, force, ...(year ? { year } : {}) }),
  listRuns: () => request<RunSummary[]>('/runs'),
  getRun: (threadId: string) => request<RunDetail>(`/runs/${encodeURIComponent(threadId)}`),

  /** Review queue: the current paused item of every paused run, then the items queued behind it. */
  pending: () => request<PendingItem[]>('/pending'),
  /** 409 if value_id is not the paused item; 422 if correct has no new_value or correct/reject has no note. */
  decide: (threadId: string, body: DecisionIn) =>
    post<DecisionResult>(`/runs/${encodeURIComponent(threadId)}/decision`, body),
  source: (threadId: string, valueId: string) =>
    request<SourceEvidence>(`/runs/${encodeURIComponent(threadId)}/source/${encodeURIComponent(valueId)}`),

  /** AI-generated explanation of a year-on-year change, from the filing's MD&A. */
  explain: (threadId: string, valueId: string) =>
    request<{ explanation: string; source: string }>(`/runs/${encodeURIComponent(threadId)}/explain/${encodeURIComponent(valueId)}`),

  values: (filter: { ticker?: string; thread_id?: string } = {}) => request<ExtractedValue[]>('/values' + query(filter)),
  validations: (ticker?: string) => request<ValidationRow[]>('/validations' + query({ ticker })),

  getConfig: () => request<Config>('/config'),
  /** Applies to new runs only. */
  putConfig: (changes: Partial<Pick<Config, 'threshold' | 'yoy_threshold' | 'equation_tolerance'>>) => put<Config>('/config', changes),

  /** Reviewer sign-off on a finished run (one hash-chained audit row; a second call returns the first). */
  getSignoff: (threadId: string) => request<{ signoff: AuditRow | null }>(`/runs/${encodeURIComponent(threadId)}/signoff`),
  signOff: (threadId: string, reviewer: string, note?: string) =>
    post<{ signoff: AuditRow }>(`/runs/${encodeURIComponent(threadId)}/signoff`, { reviewer, note }),
  /** Plain-English AI summary of one filing's audit (labelled AI-generated). */
  summary: (threadId: string) => request<{ summary: string }>(`/runs/${encodeURIComponent(threadId)}/summary`),
  /** Printable audit report (open in a new tab; the browser saves it as PDF). */
  auditReportUrl: (threadId: string) => `${BASE}/runs/${encodeURIComponent(threadId)}/audit-report`,

  audit: (limit = 200) => request<AuditRow[]>('/audit' + query({ limit })),
  verifyAudit: () => request<ChainCheck>('/audit/verify'),

  report: (threadId?: string) => request<Report>('/report' + query({ thread_id: threadId })),
  /** Link target for the "Download CSV" button. */
  reportCsvUrl: (threadId?: string) => `${BASE}/report.csv${query({ thread_id: threadId })}`,
};

/** Value in dollars for display: table value × scale; EPS stays per share. */
export function toDollars(v: Pick<ExtractedValue, 'value' | 'scale'>, which: number | null = v.value): number | null {
  return which === null ? null : which * (v.scale || 1);
}

export function pct(x: number | null | undefined, digits = 1): string {
  return x === null || x === undefined ? 'N/A' : `${(x * 100).toFixed(digits)}%`;
}
