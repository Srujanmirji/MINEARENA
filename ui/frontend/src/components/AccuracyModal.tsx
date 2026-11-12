import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, ShieldCheck, ArrowRight, TrendingUp, BarChart3, Database } from 'lucide-react';
import { LogoIcon } from './LogoIcon';
import { api, pct, type Report, type ReportRow } from '../api';

interface AccuracyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDashboard?: () => void;
}

const METRIC_LABEL: Record<string, string> = {
  revenue: 'Revenue', operating_income: 'Operating Income', net_income: 'Net Income',
  eps_diluted: 'Diluted EPS', total_assets: 'Total Assets', total_liabilities: 'Total Liabilities',
  equity: "Shareholders' Equity", operating_cash_flow: 'Operating Cash Flow', cash: 'Cash',
};

/** Dollars -> "$391,035 M"; EPS stays per share. */
function money(row: ReportRow, dollars: number | null): string {
  if (dollars === null) return '—';
  if (row.metric === 'eps_diluted') return `$${dollars.toFixed(2)}`;
  return `$${Math.round(dollars / 1e6).toLocaleString('en-US')} M`;
}

const STATUS_CHIP = {
  match: { text: 'VERIFIED', cls: 'bg-emerald-100 text-emerald-800' },
  mismatch: { text: 'MISMATCH', cls: 'bg-red-100 text-red-800' },
  none: { text: 'NO GROUND TRUTH', cls: 'bg-black/5 text-black/60' },
};

export const AccuracyModal: React.FC<AccuracyModalProps> = ({
  isOpen,
  onClose,
  onOpenDashboard,
}) => {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hooks run before the isOpen early return (rules of hooks).
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setError(null);
    api.report()
      .then((r) => { if (!cancelled) setReport(r); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load the report'); });
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  // Every number below comes from GET /report (verify/report.py), recomputed from app.db.
  const o = report?.overall;
  const d = report?.decisions;
  const top = report?.calibration.find((b) => b.band === '>0.85');
  const wrongAuto = report?.rows.filter((r) => r.status === 'auto_approved' && r.match === false).length ?? 0;
  const benchmarkStats = [
    { label: 'Ground-Truth Match', value: pct(o?.accuracy), sub: o ? `${o.correct} of ${o.verifiable} values match XBRL` : 'Loading…', icon: ShieldCheck, color: 'text-emerald-700 bg-emerald-50' },
    { label: 'Auto-Approved', value: d ? String(d.auto_approved) : '—', sub: report ? `${wrongAuto} wrong (${pct(report.auto_approval_error_rate)} error rate)` : 'Loading…', icon: CheckCircle2, color: 'text-black bg-black/5' },
    { label: 'Escalated to Human', value: d ? String(d.escalated) : '—', sub: report ? `${pct(report.escalation_precision)} were genuine issues` : 'Loading…', icon: BarChart3, color: 'text-amber-800 bg-amber-50' },
    { label: 'Calibration (C > 0.85)', value: pct(top?.accuracy), sub: top ? `${top.n} high-confidence values` : 'Loading…', icon: TrendingUp, color: 'text-black bg-black/5' },
  ];
  const verificationRows = report?.rows ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-black/5 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-black/5 bg-[#FBFBFB]">
          <div className="flex items-center gap-3">
            <LogoIcon className="w-6 h-6 text-black" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-medium tracking-tight text-black">
                  SEC XBRL Ground-Truth Report
                </h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  {pct(o?.accuracy)} Accuracy
                </span>
              </div>
              <p className="text-xs text-black/50">
                Automated cross-check vs. SEC EDGAR Company Facts API (<code className="font-mono">data.sec.gov</code>)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-black/50 hover:text-black hover:bg-black/5 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-7 overflow-y-auto flex-1 space-y-6">
          {/* 4 Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {benchmarkStats.map((stat, idx) => {
              const Icon = stat.icon;
              return (
                <div key={idx} className="bg-[#F8F8F8] border border-black/5 rounded-2xl p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-black/60 font-medium">{stat.label}</span>
                    <span className={`p-1 rounded-full ${stat.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-black tracking-tight">{stat.value}</div>
                    <div className="text-[11px] text-black/50 mt-0.5">{stat.sub}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Explanation Banner */}
          <div className="bg-[#F5F5F5] border border-black/5 rounded-2xl p-4 flex items-start gap-3 text-xs leading-relaxed text-black/75">
            <Database className="w-4 h-4 text-black shrink-0 mt-0.5" />
            <div>
              <strong className="text-black font-semibold">Graded after review, never used to decide:</strong>{' '}
              Values are extracted from the filed 10-K document (inline-XBRL tags stripped) by a table parser and an LLM. Confidence and accounting checks alone decide what a human reviews. Only after every decision is each final value compared with SEC XBRL Company Facts: correct means within one unit of the table&apos;s scale ($1M for &quot;in millions&quot;, $0.01 for EPS).
            </div>
          </div>

          {/* Sample Ground-Truth Cross-Check Table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-black">Every Extracted Value vs. SEC XBRL</h4>
              <a href={api.reportCsvUrl()} className="text-xs text-black/60 underline hover:text-black">Download CSV</a>
            </div>

            <div className="overflow-x-auto border border-black/5 rounded-2xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-black/5 text-black font-semibold border-b border-black/5">
                    <th className="p-3">Company</th>
                    <th className="p-3">Decision</th>
                    <th className="p-3">Metric</th>
                    <th className="p-3 text-right">Agent Extracted</th>
                    <th className="p-3 text-right">SEC XBRL Ground Truth</th>
                    <th className="p-3 text-center">Confidence</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 bg-white">
                  {error && (
                    <tr><td colSpan={7} className="p-4 text-center text-red-700">{error}</td></tr>
                  )}
                  {!error && !report && (
                    <tr><td colSpan={7} className="p-4 text-center text-black/50">Loading report…</td></tr>
                  )}
                  {report && verificationRows.length === 0 && (
                    <tr><td colSpan={7} className="p-4 text-center text-black/50">No verified runs yet. Run a company and finish its reviews.</td></tr>
                  )}
                  {verificationRows.map((row) => {
                    const chip = row.match === true ? STATUS_CHIP.match : row.match === false ? STATUS_CHIP.mismatch : STATUS_CHIP.none;
                    return (
                      <tr key={row.value_id} className="hover:bg-black/[0.02] transition-colors">
                        <td className="p-3 font-semibold text-black">{row.ticker}</td>
                        <td className="p-3 text-black/60">{row.status.replace('_', ' ')}</td>
                        <td className="p-3 font-medium text-black/80">{METRIC_LABEL[row.metric] ?? row.metric}</td>
                        <td className="p-3 text-right font-mono font-medium text-black">
                          {money(row, row.our_value)}
                        </td>
                        <td className="p-3 text-right font-mono font-medium text-emerald-700">
                          {money(row, row.xbrl_value)}
                        </td>
                        <td className="p-3 text-center font-mono text-[11px]">
                          <span className="px-2 py-0.5 rounded-full bg-black/5 font-semibold text-black/80">
                            {row.confidence.toFixed(2)}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${chip.cls}`}>
                            {chip.text}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-black/5 bg-[#FBFBFB] flex items-center justify-between">
          <span className="text-xs text-black/50">
            Source: SEC EDGAR Company Facts API &bull; us-gaap taxonomy
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-full text-xs font-medium text-black/70 hover:text-black hover:bg-black/5 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenDashboard?.();
              }}
              className="inline-flex items-center gap-2 bg-black text-white text-xs font-medium px-5 py-2 rounded-full hover:bg-gray-800 transition-colors shadow-xs"
            >
              <span>Launch Review Console</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

