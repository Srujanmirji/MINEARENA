import { useState } from 'react';
import { api, type ExtractedValue, type Metric, type SegmentItem } from '../../api';
import { CHECK_STYLE, METRIC_LABEL, STATUS_STYLE, TICKERS, errorText, tableNumber, unitText } from './format';
import { Empty, ErrorBox, Loading } from './states';
import { useApi } from './useApi';
import { RunAuditPanel } from './RunAuditPanel';
import { SourceEvidence } from './SourceEvidence';

const ALL_METRICS: Metric[] = [
  'revenue', 'gross_profit', 'operating_income', 'net_income', 'eps_diluted',
  'total_assets', 'total_liabilities', 'equity', 'long_term_debt',
  'operating_cash_flow', 'capex', 'free_cash_flow', 'cash',
];

/** PS 3.7: extracted metrics, confidence scores and validation results, per company. */
export function ValuesTab() {
  const values = useApi(() => api.values());
  const runs = useApi(api.listRuns);
  const [ticker, setTicker] = useState<string>('');
  const [viewMode, setViewMode] = useState<'company' | 'matrix'>('company');

  if (values.isLoading && !values.data) return <Loading label="Loading extracted values…" />;
  if (values.error && !values.data) return <ErrorBox message={values.error} onRetry={values.reload} />;
  const all = values.data ?? [];
  // Demo companies first, then any company audited from the search box.
  const seen = [...new Set(all.map((v) => v.ticker))];
  const tickers = [...TICKERS.filter((t) => seen.includes(t)), ...seen.filter((t) => !(TICKERS as readonly string[]).includes(t)).sort()];
  const shown = ticker || tickers[0] || '';
  const rows = all.filter((v) => v.ticker === shown);
  const activeThreadId = rows[0]?.thread_id;
  const runMeta = (runs.data ?? []).find((r) => r.thread_id === activeThreadId);
  const segments = runMeta?.segments ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Extracted values</h1>
          <p className="text-sm text-gray-600 mt-1">Every metric with its period, unit, source row, confidence and validation results.</p>
        </div>
        {tickers.length >= 2 && (
          <div className="inline-flex rounded-full border border-gray-300 bg-white p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('company')}
              className={`px-3.5 py-1.5 rounded-full transition-colors cursor-pointer ${viewMode === 'company' ? 'bg-black text-white' : 'text-gray-700 hover:text-black'}`}
            >
              Company breakdown
            </button>
            <button
              type="button"
              onClick={() => setViewMode('matrix')}
              className={`px-3.5 py-1.5 rounded-full transition-colors cursor-pointer ${viewMode === 'matrix' ? 'bg-black text-white' : 'text-gray-700 hover:text-black'}`}
            >
              Compare all ({tickers.length})
            </button>
          </div>
        )}
      </header>

      {all.length === 0 && <Empty title="No values yet">Start a run on the Runs tab.</Empty>}

      {viewMode === 'matrix' && tickers.length >= 2 && (
        <PeerMatrix tickers={tickers} all={all} />
      )}

      {viewMode === 'company' && (
        <>
          {tickers.length > 0 && (
            <div role="group" aria-label="Company" className="flex flex-wrap gap-2">
              {tickers.map((t) => (
                <button key={t} type="button" aria-pressed={t === shown} onClick={() => setTicker(t)}
                  className={`min-h-11 px-4 rounded-full text-sm font-semibold border cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black ${t === shown ? 'bg-black text-white border-black' : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'}`}>
                  {t}
                </button>
              ))}
            </div>
          )}
          {rows.length > 0 && <FilingSummary rows={rows} />}
          {rows.length > 0 && <FinancialRatios rows={rows} />}
          {rows.length > 0 && <MultiPeriodVariance ticker={shown} rows={rows} />}
          {segments.length > 0 && <SegmentBreakdown ticker={shown} revenue={rows.find((r) => r.metric === 'revenue')} segments={segments} />}
          {rows.length > 0 && rows[0].thread_id && (
            <RunAuditPanel key={rows[0].thread_id} threadId={rows[0].thread_id}
              isDecided={rows.every((v) => v.status !== 'escalated' && v.status !== 'extracted')} />
          )}
          {rows.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[56rem]">
                <thead className="bg-gray-50 text-xs text-gray-600 font-semibold border-b border-gray-200">
                  <tr>
                    <th scope="col" className="py-3 px-4">Metric</th>
                    <th scope="col" className="py-3 px-4 text-right">Value</th>
                    <th scope="col" className="py-3 px-4">Period</th>
                    <th scope="col" className="py-3 px-4">Source row</th>
                    <th scope="col" className="py-3 px-4 text-right">Confidence</th>
                    <th scope="col" className="py-3 px-4">Checks</th>
                    <th scope="col" className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 align-top">
                  {rows.map((v) => <ValueRow key={v.id} v={v} />)}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FinancialRatios({ rows }: { rows: ExtractedValue[] }) {
  const by: Partial<Record<Metric, number | null>> = {};
  for (const r of rows) by[r.metric] = r.final_value ?? r.value;
  const rev = by.revenue;
  const gp = by.gross_profit;
  const opInc = by.operating_income;
  const ni = by.net_income;
  const assets = by.total_assets;
  const liab = by.total_liabilities;
  const eq = by.equity;
  const ocf = by.operating_cash_flow;

  const ratios = [
    { label: 'Gross margin', val: rev && gp ? `${((gp / rev) * 100).toFixed(1)}%` : null, sub: 'Gross profit / Revenue' },
    { label: 'Operating margin', val: rev && opInc ? `${((opInc / rev) * 100).toFixed(1)}%` : null, sub: 'Operating income / Revenue' },
    { label: 'Net margin', val: rev && ni ? `${((ni / rev) * 100).toFixed(1)}%` : null, sub: 'Net income / Revenue' },
    { label: 'Return on equity', val: eq && ni ? `${((ni / eq) * 100).toFixed(1)}%` : null, sub: 'Net income / Equity' },
    { label: 'Liabilities / Assets', val: assets && liab ? `${((liab / assets) * 100).toFixed(1)}%` : null, sub: 'Financial leverage' },
    { label: 'Cash conversion', val: ni && ocf ? `${(ocf / ni).toFixed(2)}×` : null, sub: 'OCF / Net income' },
  ].filter((x) => x.val !== null);

  if (!ratios.length) return null;

  return (
    <section aria-labelledby="ratios-heading" className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="ratios-heading" className="text-sm font-bold text-gray-900">Computed Financial Ratios</h2>
        <span className="text-xs text-gray-500">Derived live from verified 10-K metrics</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
        {ratios.map((r) => (
          <div key={r.label} className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
            <div className="text-gray-500 font-medium">{r.label}</div>
            <div className="text-lg font-extrabold text-gray-900 tabular-nums mt-0.5">{r.val}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">{r.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MultiPeriodVariance({ ticker, rows }: { ticker: string; rows: ExtractedValue[] }) {
  const [explanations, setExplanations] = useState<Record<string, { text?: string; source?: string; loading?: boolean; error?: string }>>({});

  // Collect all reporting years present in v.history across rows (sorted oldest -> newest)
  const yearsSet = new Set<string>();
  for (const r of rows) {
    if (r.history) {
      for (const y of Object.keys(r.history)) yearsSet.add(y);
    }
  }
  const years = [...yearsSet].sort();

  const comparable = rows.filter((r) => {
    const cur = r.final_value ?? r.value;
    return cur !== null && (r.prior_value !== null || (r.history && Object.keys(r.history).length >= 2));
  });
  if (comparable.length === 0) return null;

  const anomalyCount = comparable.filter((r) =>
    r.validation.some((c) => c.check === 'Year-on-year' && c.status === 'failed'),
  ).length;

  async function explain(v: ExtractedValue) {
    if (!v.thread_id) return;
    setExplanations((prev) => ({ ...prev, [v.id]: { loading: true } }));
    try {
      const res = await api.explain(v.thread_id, v.id);
      setExplanations((prev) => ({ ...prev, [v.id]: { text: res.explanation, source: res.source } }));
    } catch (e: unknown) {
      setExplanations((prev) => ({ ...prev, [v.id]: { error: errorText(e) } }));
    }
  }

  return (
    <section aria-labelledby="variance-heading" className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="variance-heading" className="text-sm font-bold text-gray-900">
              {ticker} Multi-Period Financial Variance Analysis
            </h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-semibold">
              PS-01 ★ Multi-Period &amp; AI MD&amp;A
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            Compares metrics across reporting periods ({years.length >= 2 ? years.join(' → ') : 'Prior FY → Current FY'}), flags unusual YoY swings, and generates AI explanations from Item 7 (MD&amp;A).
          </p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${anomalyCount > 0 ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          {anomalyCount > 0 ? `${anomalyCount} unusual YoY variation${anomalyCount > 1 ? 's' : ''} flagged` : 'All YoY variations within threshold'}
        </span>
      </div>

      { /* Visual Multi-Year Grouped Bar Chart for Key Income & Cash Flow Metrics */ }
      {(() => {
        const chartMetrics: Metric[] = ['revenue', 'gross_profit', 'operating_income', 'net_income', 'operating_cash_flow', 'free_cash_flow'];
        const chartRows = comparable.filter((r) => chartMetrics.includes(r.metric));
        if (chartRows.length === 0) return null;
        return (
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-gray-800">Multi-Period Trend Graph ({years.length >= 2 ? years.map((y) => `FY${y.slice(-2)}`).join(' → ') : 'Prior → Current'})</span>
              <div className="flex items-center gap-3 text-[11px] text-gray-600">
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-xs bg-gray-300 inline-block" /> Older FY</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-xs bg-gray-900 inline-block" /> Latest FY</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" /> YoY Anomaly</span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {chartRows.map((v) => {
                const cur = v.final_value ?? v.value ?? 0;
                const prior = v.prior_value ?? 0;
                const series =
                  years.length >= 2
                    ? years.map((y, idx) => ({
                        label: `FY${y.slice(-2)}`,
                        val: idx === years.length - 1 ? cur : (v.history?.[y] ?? 0),
                      }))
                    : [
                        { label: 'Prior', val: prior },
                        { label: 'Curr', val: cur },
                      ];
                const maxVal = Math.max(...series.map((s) => Math.abs(s.val)), 1);
                const yoyPct = prior !== 0 ? ((cur - prior) / Math.abs(prior)) * 100 : null;
                const yoyFailed = v.validation.some((c) => c.check === 'Year-on-year' && c.status === 'failed');
                return (
                  <div key={v.id} className={`rounded-lg border p-2.5 bg-white flex flex-col justify-between ${yoyFailed ? 'border-amber-300' : 'border-gray-200'}`}>
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[11px] font-bold text-gray-900 leading-tight">{METRIC_LABEL[v.metric]}</span>
                      {yoyPct !== null && (
                        <span className={`text-[10px] font-mono font-bold px-1 rounded ${yoyFailed ? 'bg-amber-100 text-amber-900' : 'bg-gray-100 text-gray-700'}`}>
                          {yoyPct >= 0 ? `+${yoyPct.toFixed(0)}%` : `${yoyPct.toFixed(0)}%`}
                        </span>
                      )}
                    </div>
                    <div className="h-20 flex items-end gap-1.5 pt-3 mt-1 border-b border-gray-200">
                      {series.map((pt, i) => {
                        const isLast = i === series.length - 1;
                        const hPct = Math.max(8, Math.round((Math.abs(pt.val) / maxVal) * 100));
                        const barCls = isLast
                          ? yoyFailed
                            ? 'bg-amber-500'
                            : 'bg-gray-900'
                          : i === series.length - 2
                            ? 'bg-gray-400'
                            : 'bg-gray-300';
                        return (
                          <div key={pt.label} className="flex-1 flex flex-col items-center justify-end h-full" title={`${pt.label}: ${tableNumber(v, pt.val)}`}>
                            <div className="text-[9px] font-mono text-gray-600 mb-0.5 truncate max-w-full">{tableNumber(v, pt.val)}</div>
                            <div className={`w-full rounded-t ${barCls} transition-all`} style={{ height: `${hPct}%` }} />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[9px] font-mono text-gray-500 pt-1">
                      {series.map((pt) => (
                        <span key={pt.label} className="flex-1 text-center">{pt.label}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs tabular-nums">
          <thead className="bg-gray-50 text-gray-600 font-semibold border-y border-gray-200">
            <tr>
              <th scope="col" className="py-2 px-3">Metric</th>
              {years.length >= 2 ? (
                years.map((y) => (
                  <th scope="col" key={y} className="py-2 px-3 text-right">FY {y}</th>
                ))
              ) : (
                <>
                  <th scope="col" className="py-2 px-3 text-right">Prior FY</th>
                  <th scope="col" className="py-2 px-3 text-right">Current FY</th>
                </>
              )}
              <th scope="col" className="py-2 px-3 text-right">YoY Δ</th>
              <th scope="col" className="py-2 px-3">Variation Status &amp; AI MD&amp;A Explanation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {comparable.map((v) => {
              const cur = v.final_value ?? v.value;
              const prior = v.prior_value;
              const yoyPct = cur !== null && prior !== null && prior !== 0 ? ((cur - prior) / Math.abs(prior)) * 100 : null;
              const yoyFailed = v.validation.some((c) => c.check === 'Year-on-year' && c.status === 'failed');
              const exp = explanations[v.id];
              return (
                <tr key={v.id} className={yoyFailed ? 'bg-amber-50/40' : ''}>
                  <th scope="row" className="py-2.5 px-3 font-semibold text-gray-900">
                    {METRIC_LABEL[v.metric]}
                    <span className="ml-1.5 text-[10px] font-normal text-gray-500">({unitText(v)})</span>
                  </th>
                  {years.length >= 2 ? (
                    years.map((y, idx) => {
                      const hVal = idx === years.length - 1 ? cur : (v.history?.[y] ?? null);
                      return (
                        <td key={y} className={`py-2.5 px-3 text-right ${idx === years.length - 1 ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
                          {hVal !== null && hVal !== undefined ? tableNumber(v, hVal) : '—'}
                        </td>
                      );
                    })
                  ) : (
                    <>
                      <td className="py-2.5 px-3 text-right text-gray-600">{tableNumber(v, prior)}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-gray-900">{tableNumber(v, cur)}</td>
                    </>
                  )}
                  <td className="py-2.5 px-3 text-right font-mono font-bold">
                    {yoyPct !== null ? (
                      <span className={yoyFailed ? 'text-amber-800' : yoyPct >= 0 ? 'text-emerald-700' : 'text-gray-700'}>
                        {yoyPct >= 0 ? `+${yoyPct.toFixed(1)}%` : `${yoyPct.toFixed(1)}%`}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${yoyFailed ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-50 text-emerald-800'}`}>
                        {yoyFailed ? 'Unusual variation' : 'Normal range'}
                      </span>
                      {v.thread_id && prior !== null && !exp?.text && (
                        <button
                          type="button"
                          disabled={exp?.loading}
                          onClick={() => explain(v)}
                          className="px-2.5 py-0.5 rounded-full border border-gray-300 bg-white hover:bg-gray-50 text-[11px] font-semibold text-gray-800 disabled:opacity-50 cursor-pointer"
                        >
                          {exp?.loading ? 'Reading Item 7 MD&A…' : 'AI Explain (MD&A)'}
                        </button>
                      )}
                    </div>
                    {exp?.text && (
                      <div className="mt-1.5 rounded-lg bg-white border border-gray-200 p-2.5 text-xs text-gray-800 leading-relaxed max-w-xl">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-800 mb-0.5">
                          AI-Generated · {exp.source}
                        </div>
                        {exp.text}
                      </div>
                    )}
                    {exp?.error && <div className="mt-1 text-xs text-red-700">{exp.error}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SegmentBreakdown({ ticker, revenue, segments }: { ticker: string; revenue?: ExtractedValue; segments: SegmentItem[] }) {
  const segSum = segments.reduce((s, item) => s + Number(item.value || 0), 0);
  const revVal = revenue ? (revenue.final_value ?? revenue.value) : null;
  const diffPct = revVal ? Math.abs(segSum - revVal) / Math.abs(revVal) * 100 : null;
  const palette = ['bg-gray-900', 'bg-blue-600', 'bg-emerald-600', 'bg-amber-500', 'bg-indigo-600', 'bg-rose-600'];
  return (
    <section aria-labelledby="segments-heading" className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="segments-heading" className="text-sm font-bold text-gray-900">{ticker} Segment Revenue Validation ({segments.length} segments)</h2>
          <p className="text-xs text-gray-600 mt-0.5">
            Sum of reported 10-K segments: <strong className="tabular-nums">{segSum.toLocaleString('en-US')}</strong>
            {revVal !== null && (
              <> vs. Total Revenue <strong className="tabular-nums">{revVal.toLocaleString('en-US')}</strong> {revenue ? unitText(revenue) : ''}</>
            )}
          </p>
        </div>
        {diffPct !== null && (
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${diffPct <= 0.5 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {diffPct <= 0.05 ? 'Exact match (0.0% gap)' : `Variance: ${diffPct.toFixed(2)}%`}
          </span>
        )}
      </div>

      {/* Stacked 100% Segment Distribution Bar */}
      <div className="space-y-1.5">
        <div className="h-3.5 w-full rounded-full overflow-hidden flex bg-gray-100 border border-gray-200">
          {segments.map((seg, i) => {
            const share = segSum ? (seg.value / segSum) * 100 : 0;
            return (
              <div
                key={seg.segment}
                className={`h-full ${palette[i % palette.length]} transition-all`}
                style={{ width: `${share}%` }}
                title={`${seg.segment}: ${seg.value.toLocaleString('en-US')} (${share.toFixed(1)}%)`}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600">
          {segments.map((seg, i) => {
            const share = segSum ? (seg.value / segSum) * 100 : 0;
            return (
              <span key={seg.segment} className="inline-flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${palette[i % palette.length]}`} />
                <strong className="text-gray-800">{seg.segment}</strong>
                <span className="font-mono">{share.toFixed(1)}%</span>
              </span>
            );
          })}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
        {segments.map((seg) => {
          const share = segSum ? (seg.value / segSum) * 100 : 0;
          return (
            <div key={seg.segment} className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-900 truncate" title={seg.segment}>{seg.segment}</span>
                <span className="font-mono font-bold text-gray-800 shrink-0">{share.toFixed(1)}%</span>
              </div>
              <div className="text-sm font-extrabold text-gray-900 tabular-nums mt-1">
                {seg.value.toLocaleString('en-US')} {revenue ? <span className="text-[11px] font-normal text-gray-500">{unitText(revenue)}</span> : ''}
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-gray-900 rounded-full" style={{ width: `${Math.min(100, Math.max(4, share))}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PeerMatrix({ tickers, all }: { tickers: string[]; all: ExtractedValue[] }) {
  const byKey = new Map<string, ExtractedValue>();
  for (const v of all) byKey.set(`${v.ticker}:${v.metric}`, v);
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-sm font-bold text-gray-900">Cross-Company 10-K Comparison Matrix</h2>
        <p className="text-xs text-gray-600 mt-0.5">Values shown in each filing&apos;s native statement scale with confidence score and review status.</p>
      </div>
      <table className="w-full text-left text-xs min-w-[56rem]">
        <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
          <tr>
            <th scope="col" className="py-3 px-4">Metric</th>
            {tickers.map((t) => (
              <th scope="col" key={t} className="py-3 px-4 text-right font-bold text-gray-900">{t}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 tabular-nums">
          {ALL_METRICS.map((m) => (
            <tr key={m} className="hover:bg-gray-50/70">
              <th scope="row" className="py-2.5 px-4 font-semibold text-gray-900">{METRIC_LABEL[m]}</th>
              {tickers.map((t) => {
                const v = byKey.get(`${t}:${m}`);
                if (!v) return <td key={t} className="py-2.5 px-4 text-right text-gray-400">—</td>;
                const final = v.final_value ?? v.value;
                const st = STATUS_STYLE[v.status];
                return (
                  <td key={t} className="py-2.5 px-4 text-right">
                    <div className="font-bold text-gray-900">{tableNumber(v, final)}</div>
                    <div className="text-[11px] text-gray-500 flex items-center justify-end gap-1 mt-0.5">
                      <span>{v.confidence.toFixed(2)}</span>
                      <span className={`px-1.5 rounded-full font-semibold ${st.cls}`}>{st.label}</span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilingSummary({ rows }: { rows: ExtractedValue[] }) {
  // Filing-wide checks (A = L + E, segment sum) sit on several values; show each once.
  const seen = new Map<string, ExtractedValue['validation'][number]>();
  rows.forEach((v) => v.validation.forEach((c) => {
    if (c.check === 'A = L + E' || c.check === 'Segment sum') seen.set(c.check, c);
  }));
  const first = rows[0];
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
      <div><div className="text-xs text-gray-600">10-K accession</div><div className="font-mono font-semibold">{first.accession}</div></div>
      <div><div className="text-xs text-gray-600">Document</div><div className="font-semibold">{first.source_page}</div></div>
      <div><div className="text-xs text-gray-600">Fiscal year end</div><div className="font-semibold">{first.period_end}</div></div>
      {[...seen.values()].map((c) => (
        <div key={c.check}>
          <div className="text-xs text-gray-600">{c.check}</div>
          <div className="flex items-center gap-2 font-semibold">
            <span className={`px-1.5 py-0.5 rounded text-xs ${CHECK_STYLE[c.status].cls}`}>{CHECK_STYLE[c.status].label}</span>
            <span className="text-gray-700 font-normal">{c.detail}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ValueRow({ v }: { v: ExtractedValue }) {
  const [showSource, setShowSource] = useState(false);
  const [explainText, setExplainText] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainErr, setExplainErr] = useState<string | null>(null);

  const status = STATUS_STYLE[v.status];
  const final = v.final_value ?? v.value;
  const yoyPct =
    final !== null && v.prior_value !== null && v.prior_value !== 0
      ? ((final - v.prior_value) / Math.abs(v.prior_value)) * 100
      : null;
  const histEntries = v.history ? Object.entries(v.history).sort(([a], [b]) => a.localeCompare(b)) : [];
  const yoyFailed = v.validation.some((c) => c.check === 'Year-on-year' && c.status === 'failed');

  async function loadExplain() {
    if (!v.thread_id) return;
    setExplaining(true);
    setExplainErr(null);
    try {
      const res = await api.explain(v.thread_id, v.id);
      setExplainText(res.explanation);
    } catch (e: unknown) {
      setExplainErr(errorText(e));
    } finally {
      setExplaining(false);
    }
  }

  return (
    <>
      <tr>
        <th scope="row" className="py-3 px-4 font-semibold text-gray-900">{METRIC_LABEL[v.metric]}</th>
        <td className="py-3 px-4 text-right tabular-nums">
          <div className="font-semibold">{tableNumber(v, final)}</div>
          <div className="text-xs text-gray-600">{unitText(v)}</div>
          {v.prior_value !== null && (
            <div className="text-xs text-gray-500">
              prior {tableNumber(v, v.prior_value)}
              {yoyPct !== null && (
                <span className={`ml-1 font-semibold ${yoyFailed ? 'text-amber-800' : 'text-gray-600'}`}>
                  ({yoyPct >= 0 ? `+${yoyPct.toFixed(1)}%` : `${yoyPct.toFixed(1)}%`})
                </span>
              )}
            </div>
          )}
          {histEntries.length >= 2 && (
            <div className="text-[11px] text-gray-500 mt-0.5">
              {histEntries.map(([yr, val]) => `FY${yr.slice(-2)}: ${tableNumber(v, val)}`).join(' · ')}
            </div>
          )}
          {v.status === 'corrected' && <div className="text-xs text-blue-700">was {tableNumber(v, v.value)}</div>}
        </td>
        <td className="py-3 px-4 text-xs text-gray-700">{v.period_start ? `${v.period_start} → ` : 'as of '}{v.period_end}</td>
        <td className="py-3 px-4 text-xs text-gray-700 max-w-[16rem] space-y-1">
          <div>
            {(v.row_label || '—').replace(/\s*\(derived\)\s*$/i, '')}
            {v.is_derived && <span className="ml-1 text-amber-800 font-semibold">(derived)</span>}
          </div>
          {v.source_snippet && (
            <details className="text-[11px] text-gray-500">
              <summary className="cursor-pointer hover:text-gray-800 font-medium">Raw snippet</summary>
              <div className="mt-1 font-mono bg-gray-50 border border-gray-200 rounded p-1.5 text-gray-700 break-words">
                {v.source_snippet}
              </div>
            </details>
          )}
          {v.thread_id && (v.table_index !== null || v.is_derived) && (
            <button
              type="button"
              onClick={() => setShowSource((s) => !s)}
              className="inline-block text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer"
            >
              {showSource ? 'Hide 10-K table ▲' : 'View 10-K table ▼'}
            </button>
          )}
        </td>
        <td className="py-3 px-4 text-right tabular-nums font-semibold">
          {v.confidence.toFixed(2)}
          <ConfidenceBars v={v} />
        </td>
        <td className="py-3 px-4">
          <ul className="space-y-1">
            {v.validation.map((c) => (
              <li key={c.check} className="text-xs flex items-start gap-1.5" title={c.detail}>
                <span className={`px-1.5 rounded font-semibold shrink-0 ${CHECK_STYLE[c.status].cls}`}>{CHECK_STYLE[c.status].label}</span>
                <span className="text-gray-700">{c.check}</span>
              </li>
            ))}
          </ul>
          {yoyFailed && v.thread_id && !explainText && (
            <button
              type="button"
              disabled={explaining}
              onClick={loadExplain}
              className="mt-1.5 px-2.5 py-0.5 rounded-full border border-amber-300 bg-amber-50 hover:bg-amber-100 text-[11px] font-semibold text-amber-900 disabled:opacity-50 cursor-pointer"
            >
              {explaining ? 'Reading MD&A…' : 'Explain YoY change'}
            </button>
          )}
          {explainText && (
            <div className="mt-1.5 rounded-lg bg-amber-50/70 border border-amber-200 p-2 text-xs text-gray-800 max-w-xs leading-snug">
              <div className="text-[10px] font-bold uppercase text-amber-900 mb-0.5">AI MD&amp;A Summary</div>
              {explainText}
            </div>
          )}
          {explainErr && <div className="mt-1 text-xs text-red-700">{explainErr}</div>}
        </td>
        <td className="py-3 px-4">
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap ${status.cls}`}>{status.label}</span>
          {v.escalation_reason && v.status !== 'auto_approved' && <div className="text-xs text-gray-600 mt-1 max-w-[16rem]">{v.escalation_reason}</div>}
          {v.status === 'auto_approved' && <WhyApproved v={v} />}
        </td>
      </tr>
      {showSource && v.thread_id && (
        <tr className="bg-gray-50/80">
          <td colSpan={7} className="p-4">
            <SourceEvidence threadId={v.thread_id} value={v} />
          </td>
        </tr>
      )}
    </>
  );
}

const SIGNALS: [keyof ExtractedValue['signals'], string, number][] = [
  ['agreement', 'Readers agree', 0.45], ['label', 'Row label', 0.30], ['period_unit', 'Period / unit', 0.25],
];

/** Confidence breakdown: each part's score as a bar, weighted as in C = 0.45 A + 0.30 L + 0.25 P. */
function ConfidenceBars({ v }: { v: ExtractedValue }) {
  return (
    <div className="mt-1.5 space-y-0.5" aria-label="Confidence breakdown">
      {SIGNALS.map(([key, name, weight]) => {
        const s = v.signals[key] ?? 0;
        return (
          <div key={key} className="flex items-center gap-1.5 justify-end text-[11px] font-normal text-gray-500" title={`${name}: ${s.toFixed(2)} × ${weight}`}>
            <span className="sr-only">{name} {s.toFixed(2)}</span>
            <span className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden" aria-hidden>
              <span className={`block h-full rounded-full ${s >= 0.8 ? 'bg-emerald-600' : 'bg-amber-500'}`} style={{ width: `${s * 100}%` }} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** "Why was this auto-approved?": the evidence behind a green value, not just behind flagged ones. */
function WhyApproved({ v }: { v: ExtractedValue }) {
  const passed = v.validation.filter((c) => c.status === 'passed');
  return (
    <details className="mt-1.5 text-xs text-gray-700 max-w-[16rem]">
      <summary className="cursor-pointer font-semibold text-emerald-800">Why auto-approved?</summary>
      <ul className="mt-1 space-y-0.5 list-disc pl-4">
        <li>Confidence {v.confidence.toFixed(2)} ≥ threshold: {SIGNALS.map(([k, n]) => `${n.toLowerCase()} ${(v.signals[k] ?? 0).toFixed(2)}`).join(', ')}</li>
        <li>Both readers{v.alt_value === null ? ' (one answered)' : ''} gave {tableNumber(v, v.value)}</li>
        <li>{passed.length} checks passed, none failed: {passed.map((c) => c.check).join(', ')}</li>
      </ul>
    </details>
  );
}
