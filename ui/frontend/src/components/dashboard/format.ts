import type { Check, ExtractedValue, Metric, ValueStatus } from '../../api';

export const METRIC_LABEL: Record<Metric, string> = {
  revenue: 'Revenue',
  operating_income: 'Operating income',
  net_income: 'Net income',
  eps_diluted: 'Diluted EPS',
  total_assets: 'Total assets',
  total_liabilities: 'Total liabilities',
  equity: "Shareholders' equity",
  operating_cash_flow: 'Operating cash flow',
  cash: 'Cash and equivalents',
};

export const TICKERS = ['AAPL', 'MSFT', 'NVDA', 'WMT', 'TSLA'] as const;

/** Number as printed in the filing's table (e.g. 391,035 when "in millions"; EPS with cents). */
export function tableNumber(v: Pick<ExtractedValue, 'metric'>, n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return v.metric === 'eps_diluted'
    ? n.toFixed(2)
    : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function unitText(v: Pick<ExtractedValue, 'metric' | 'scale'>): string {
  if (v.metric === 'eps_diluted') return 'USD per share';
  if (v.scale === 1_000_000) return 'USD millions';
  if (v.scale === 1_000) return 'USD thousands';
  return 'USD';
}

export function failedChecks(v: Pick<ExtractedValue, 'validation'>): Check[] {
  return (v.validation ?? []).filter((c) => c.status === 'failed');
}

export const STATUS_STYLE: Record<ValueStatus, { label: string; cls: string }> = {
  extracted: { label: 'Extracted', cls: 'bg-gray-100 text-gray-700' },
  auto_approved: { label: 'Auto-approved', cls: 'bg-emerald-100 text-emerald-800' },
  escalated: { label: 'Waiting for review', cls: 'bg-amber-100 text-amber-900' },
  approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-800' },
  corrected: { label: 'Corrected', cls: 'bg-blue-100 text-blue-800' },
  rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-800' },
};

export const CHECK_STYLE: Record<Check['status'], { label: string; cls: string }> = {
  passed: { label: 'Pass', cls: 'bg-emerald-100 text-emerald-800' },
  failed: { label: 'Fail', cls: 'bg-red-100 text-red-800' },
  na: { label: 'N/A', cls: 'bg-gray-100 text-gray-600' },
};

export function shortHash(h: string): string {
  return h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h;
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong';
}
