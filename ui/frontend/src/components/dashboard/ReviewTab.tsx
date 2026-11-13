import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { api, ApiError, type Action, type ExtractedValue, type Metric, type PendingItem } from '../../api';
import { CHECK_STYLE, METRIC_LABEL, STATUS_STYLE, errorText, tableNumber, unitText } from './format';
import { Empty, ErrorBox, Loading } from './states';
import { SourceEvidence } from './SourceEvidence';
import { ExplainChange } from './ExplainChange';
import { useApi } from './useApi';

interface Props {
  threshold: number;
  onDecided: (message: string) => void;
  onOpenRuns: () => void;
}

const REVIEWER_KEY = 'auditloop.reviewer';
/** Same as scoring/router.py LABEL_FLOOR: below this a signal is worth a reviewer's attention. */
const WEAK_SIGNAL = 0.8;

function readReviewer(): string {
  try { return localStorage.getItem(REVIEWER_KEY) || ''; } catch { return ''; }
}

export function ReviewTab({ threshold, onDecided, onOpenRuns }: Props) {
  const queue = useApi(api.pending);   // refreshed after each decision and by the Refresh button, not polled
  const current = useMemo(() => (queue.data ?? []).filter((p) => p.is_current), [queue.data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const item = current.find((p) => p.value.id === selectedId) ?? current[0];

  if (queue.isLoading && !queue.data) return <Loading label="Loading the review queue…" />;
  if (queue.error && !queue.data) return <ErrorBox message={queue.error} onRetry={queue.reload} />;
  if (!item) {
    return (
      <Empty title="Nothing waiting for review">
        Every escalated value has a decision. Start a company run to extract a new filing.{' '}
        <button type="button" onClick={onOpenRuns} className="text-blue-700 underline font-medium">Go to runs</button>
      </Empty>
    );
  }

  const runQueue = (queue.data ?? []).filter((p) => p.thread_id === item.thread_id);
  const queuedInRun = runQueue.length;
  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm mb-2">
        <div className="text-gray-600 font-medium">
          Review queue <span className="text-gray-400">/</span> {item.value.ticker} · {METRIC_LABEL[item.value.metric]}
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={queue.reload} disabled={queue.isLoading}
          className="inline-flex items-center gap-1.5 min-h-10 px-4 rounded-full border border-gray-200 bg-white text-xs font-semibold text-gray-800 hover:bg-gray-50 hover:scale-105 active:scale-95 transition-all duration-200 shadow-2xs disabled:opacity-50 cursor-pointer">
          <RefreshCw className={`w-3.5 h-3.5 ${queue.isLoading ? 'animate-spin text-amber-500' : 'text-gray-500'}`} /> {queue.isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
        {current.length > 1 && (
          <label className="flex items-center gap-2 text-gray-600">
            <span>Paused run</span>
            <select
              value={item.value.id}
              onChange={(e) => setSelectedId(e.target.value)}
              className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900"
            >
              {current.map((p) => (
                <option key={p.value.id} value={p.value.id}>{p.value.ticker} · {METRIC_LABEL[p.value.metric]}</option>
              ))}
            </select>
          </label>
        )}
        </div>
      </div>

      <h1 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
        {METRIC_LABEL[item.value.metric]} · {item.value.company || item.value.ticker}
      </h1>
      <p className="text-sm text-gray-600 mt-1 mb-6">
        10-K {item.value.accession} · period ending {item.value.period_end} · {queuedInRun} waiting in this run
      </p>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-2.5">
        <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <h2 className="text-sm font-bold text-amber-950">Why this was paused</h2>
          <p className="text-sm text-amber-900 mt-0.5 leading-relaxed">{item.reason || 'Escalated for review.'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          <SourceEvidence threadId={item.thread_id} value={item.value} />
          <FilingContextColumn key={item.value.ticker} item={item} runQueue={runQueue} threshold={threshold} />
        </div>
        <div className="lg:col-span-5 space-y-6">
          <ValueCard item={item} threshold={threshold} />
          <ExplainChange key={`explain-${item.value.id}`} item={item} />
          <DecisionForm key={item.value.id} item={item} onDone={(msg) => { onDecided(msg); queue.reload(); }} />
        </div>
      </div>
    </div>
  );
}

function ValueCard({ item, threshold }: { item: PendingItem; threshold: number }) {
  const v = item.value;
  const parser = v.extractor === 'parser' ? v.value : v.alt_value;
  const llm = v.extractor === 'llm' ? v.value : v.alt_value;
  const signals: [string, number | undefined][] = [
    ['Agreement', v.signals.agreement], ['Label', v.signals.label], ['Period / unit', v.signals.period_unit],
  ];
  const yoyPct = v.value !== null && v.prior_value
    ? ((v.value - v.prior_value) / Math.abs(v.prior_value)) * 100
    : null;
  const yoyFailed = v.validation.some((c) => c.check === 'Year-on-year' && c.status === 'failed');
  const cleanLabel = (v.row_label || '—').replace(/\s*\(derived\)\s*$/i, '');
  const histEntries = Object.entries(v.history ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const maxHist = Math.max(...histEntries.map(([, val]) => Math.abs(val)), 1);

  return (
    <section aria-labelledby="value-heading" className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs">
      <h2 id="value-heading" className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Extracted value</h2>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-4xl font-extrabold text-gray-900 tracking-tight tabular-nums">{tableNumber(v, v.value)}</span>
        <span className="text-sm font-semibold text-gray-600">{unitText(v)}</span>
      </div>
      <dl className="grid grid-cols-2 gap-3 mt-3 text-xs border-b border-gray-100 pb-4">
        <div><dt className="text-gray-500">Period</dt><dd className="font-semibold text-gray-800 mt-0.5">{v.period_start ? `${v.period_start} → ` : 'As of '}{v.period_end}</dd></div>
        <div><dt className="text-gray-500">Row label</dt><dd className="font-semibold text-gray-800 mt-0.5">{cleanLabel}{v.is_derived ? ' (derived)' : ''}</dd></div>
        {v.prior_value !== null && (
          <div className="col-span-2">
            <dt className="text-gray-500">Prior year</dt>
            <dd className="font-semibold text-gray-800 mt-0.5 tabular-nums">
              {tableNumber(v, v.prior_value)} {unitText(v)}
              {yoyPct !== null && (
                <span className={`ml-1.5 font-bold ${yoyFailed ? 'text-amber-700' : 'text-gray-600'}`}>
                  ({yoyPct >= 0 ? '+' : ''}{yoyPct.toFixed(1)}% YoY)
                </span>
              )}
            </dd>
          </div>
        )}
      </dl>

      {histEntries.length >= 2 && (
        <div className="mt-3 border-b border-gray-100 pb-3">
          <div className="text-xs font-semibold text-gray-600 mb-2">Multi-period trend (10-K statement columns)</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            {histEntries.map(([yr, val]) => (
              <div key={yr} className="bg-gray-50 border border-gray-100 rounded-lg p-2">
                <div className="text-gray-500 font-medium">FY {yr}</div>
                <div className="font-bold text-gray-900 tabular-nums mt-0.5">{tableNumber(v, val)}</div>
                <div className="h-1.5 bg-gray-200 rounded-full mt-1.5 overflow-hidden">
                  <div className="h-full bg-gray-800 rounded-full" style={{ width: `${Math.max(12, (Math.abs(val) / maxHist) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
          <span className="text-gray-900 font-bold">Confidence {v.confidence.toFixed(2)}</span>
          <span className="text-gray-600">auto-approve needs ≥ {threshold.toFixed(2)}</span>
        </div>
        <div className="relative h-2.5 w-full bg-gray-100 rounded-full overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={v.confidence} aria-label="Confidence">
          <div className={`h-full rounded-full ${v.confidence >= threshold ? 'bg-emerald-600' : 'bg-amber-500'}`} style={{ width: `${v.confidence * 100}%` }} />
          <div className="absolute top-0 bottom-0 w-0.5 bg-black" style={{ left: `${threshold * 100}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs mt-3">
          {signals.map(([name, s]) => (
            <div key={name} className="bg-gray-50 border border-gray-100 rounded-lg p-2">
              <div className="text-gray-600">{name}</div>
              <div className={`font-bold mt-0.5 tabular-nums ${s !== undefined && s < WEAK_SIGNAL ? 'text-amber-700' : 'text-gray-900'}`}>{s === undefined ? '—' : s.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="border-2 border-blue-600 bg-blue-50/40 rounded-xl p-3">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>Table parser</span>
            {v.extractor === 'parser' && <span className="text-[10px] font-bold text-blue-700 uppercase">Chosen</span>}
          </div>
          <div className="text-base font-bold text-gray-900 mt-0.5 tabular-nums">{parser === null ? 'no answer' : tableNumber(v, parser)}</div>
        </div>
        <div className="border-2 border-dashed border-amber-500 bg-amber-50/40 rounded-xl p-3">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>LLM</span>
            {v.extractor === 'llm' && <span className="text-[10px] font-bold text-amber-800 uppercase">Chosen</span>}
          </div>
          <div className="text-base font-bold text-gray-900 mt-0.5 tabular-nums">{llm === null ? 'no answer' : tableNumber(v, llm)}</div>
        </div>
      </div>

      <ul className="mt-4 pt-3 border-t border-gray-100 space-y-1.5 text-xs">
        {v.validation.map((c) => (
          <li key={c.check} className="flex items-start gap-2">
            <span className={`px-1.5 py-0.5 rounded font-semibold shrink-0 ${CHECK_STYLE[c.status].cls}`}>{CHECK_STYLE[c.status].label}</span>
            <span className="text-gray-700"><span className="font-semibold">{c.check}</span> · {c.detail}{c.status === 'failed' ? ` (${c.severity})` : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DecisionForm({ item, onDone }: { item: PendingItem; onDone: (message: string) => void }) {
  const v = item.value;
  const [newValue, setNewValue] = useState('');
  const [note, setNote] = useState('');
  const [reviewer, setReviewer] = useState(readReviewer);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try { if (reviewer.trim()) localStorage.setItem(REVIEWER_KEY, reviewer.trim()); } catch { /* storage blocked */ }
  }, [reviewer]);

  const parsedNew = Number(newValue.replace(/,/g, ''));
  const canCorrect = newValue.trim() !== '' && Number.isFinite(parsedNew) && note.trim() !== '';
  const canReject = note.trim() !== '';

  async function submit(action: Action) {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      const res = await api.decide(item.thread_id, {
        value_id: v.id,
        action,
        reviewer: reviewer.trim() || 'reviewer',
        ...(action === 'correct' ? { new_value: parsedNew } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      const verb = { approve: 'Approved', correct: 'Corrected', reject: 'Rejected' }[action];
      onDone(res.duplicate
        ? `Already decided earlier: nothing was written twice.`
        : `${verb} ${v.ticker} ${METRIC_LABEL[v.metric]}. Recorded in the audit log; run ${res.status === 'done' ? 'finished' : 'resumed'}.`);
    } catch (e: unknown) {
      setError(e instanceof ApiError && e.status === 409
        ? 'This item is no longer the one paused (someone else decided it). The queue will refresh.'
        : errorText(e));
      setBusy(null);
    }
  }

  const inputCls = 'w-full px-3 min-h-11 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-black';
  return (
    <section aria-labelledby="decision-heading" className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs">
      <h2 id="decision-heading" className="text-base font-bold text-gray-900">Your decision</h2>
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="block text-xs font-semibold text-gray-700 mb-1.5">Corrected value, as in the table ({unitText(v)}). Only for Correct</span>
          <input inputMode="decimal" value={newValue} onChange={(e) => setNewValue(e.target.value)} className={`${inputCls} font-semibold tabular-nums`} placeholder={tableNumber(v, v.value)} />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-700 mb-1.5">Reason (required for Correct and Reject)</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} py-2.5 leading-relaxed`} placeholder="What you checked in the filing" />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {[
            ...(item.reason?.includes('NCI') ? ['Gap is noncontrolling interest; value matches filing'] : []),
            ...(v.is_derived
              ? [
                  v.metric === 'free_cash_flow'
                    ? 'Derived free cash flow (Operating cash flow − CapEx) verified in cash flow statement'
                    : 'Derived liabilities (Assets − Total Equity) verified in balance sheet',
                ]
              : []),
            ...(item.reason?.includes('vs prior') ? ['Genuine YoY change verified in Item 8 & MD&A'] : []),
            'Verified against 10-K Item 8 statement row',
          ].map((preset) => (
            <button key={preset} type="button" onClick={() => setNote(preset)}
              className="text-xs px-2.5 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium">
              + {preset}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="block text-xs font-semibold text-gray-700 mb-1.5">Reviewer</span>
          <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} className={inputCls} placeholder="Your name" autoComplete="name" />
        </label>
      </div>

      {error && <div role="alert" className="mt-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

      <div className="grid grid-cols-3 gap-3 mt-5">
        <button type="button" disabled={busy !== null} onClick={() => submit('approve')}
          className="min-h-12 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white text-sm font-bold rounded-xl shadow-[0_4px_14px_rgba(5,150,105,0.35)] hover:shadow-[0_6px_20px_rgba(5,150,105,0.5)] hover:scale-[1.02] active:scale-95 transition-all duration-200 cursor-pointer disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
          {busy === 'approve' ? 'Saving…' : 'Approve'}
        </button>
        <button type="button" disabled={busy !== null || !canCorrect} onClick={() => submit('correct')}
          aria-describedby="decision-hint"
          className="min-h-12 bg-white hover:bg-blue-50/80 text-blue-700 border-2 border-blue-600 text-sm font-bold rounded-xl shadow-xs hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all duration-200 cursor-pointer disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
          {busy === 'correct' ? 'Saving…' : 'Correct'}
        </button>
        <button type="button" disabled={busy !== null || !canReject} onClick={() => submit('reject')}
          aria-describedby="decision-hint"
          className="min-h-12 bg-white hover:bg-red-50/80 text-red-700 border-2 border-red-500 text-sm font-bold rounded-xl shadow-xs hover:shadow-md hover:scale-[1.02] active:scale-95 transition-all duration-200 cursor-pointer disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">
          {busy === 'reject' ? 'Saving…' : 'Reject'}
        </button>
      </div>
      {/* Visible (not hover-only) reason why Correct / Reject are disabled. */}
      <p id="decision-hint" className="text-xs text-gray-600 mt-2">
        {!canReject ? 'Correct and Reject need a reason; Correct also needs the corrected value.'
          : !canCorrect ? 'Correct also needs the corrected value.' : ' '}
      </p>
      <p className="text-xs text-gray-600 mt-3 flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
        Saved to the audit log before the workflow continues.
      </p>
    </section>
  );
}

const ORDER: Metric[] = [
  'revenue', 'gross_profit', 'operating_income', 'net_income', 'eps_diluted',
  'total_assets', 'total_liabilities', 'equity', 'long_term_debt',
  'operating_cash_flow', 'capex', 'free_cash_flow', 'cash',
];

function FilingContextColumn({ item, runQueue, threshold }: { item: PendingItem; runQueue: PendingItem[]; threshold: number }) {
  const v = item.value;
  const filingValues = useApi(() => api.values({ ticker: v.ticker }));
  const runs = useApi(api.listRuns);
  const runSegments = (runs.data ?? []).find((r) => r.thread_id === item.thread_id)?.segments ?? [];
  const all = useMemo(() => {
    const rows = (filingValues.data ?? []).filter((r) => r.accession === v.accession);
    return rows.sort((a, b) => ORDER.indexOf(a.metric) - ORDER.indexOf(b.metric));
  }, [filingValues.data, v.accession]);

  const byMetric = useMemo(() => {
    const m: Partial<Record<ExtractedValue['metric'], ExtractedValue>> = {};
    for (const r of all) m[r.metric] = r;
    return m;
  }, [all]);

  const assets = byMetric.total_assets;
  const liab = byMetric.total_liabilities;
  const eq = byMetric.equity;
  const aTab = assets?.value ?? null;
  const lTab = liab?.value ?? null;
  const eTab = eq?.value ?? null;
  const leSum = lTab !== null && eTab !== null ? lTab + eTab : null;
  const eqGap = aTab !== null && leSum !== null ? aTab - leSum : null;
  const eqGapPct = eqGap !== null && aTab ? (Math.abs(eqGap) / Math.abs(aTab)) * 100 : null;

  return (
    <div className="space-y-6">
      {/* 1. Live Balance Sheet Equation Card (A = L + E) */}
      {aTab !== null && lTab !== null && eTab !== null && leSum !== null && eqGap !== null && (
        <section aria-labelledby="bs-eq-heading" className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="bs-eq-heading" className="text-sm font-bold text-gray-900">Balance sheet equation check (A = L + E)</h2>
              <p className="text-xs text-gray-600 mt-0.5">Live cross-check across {v.ticker}’s balance sheet in {unitText(assets ?? v)}.</p>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${eqGapPct !== null && eqGapPct <= 0.5 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-900 border border-amber-300'}`}>
              {Math.abs(eqGap) < 0.5
                ? 'Exact match (gap 0)'
                : `Gap: ${eqGap > 0 ? '+' : ''}${Math.round(eqGap).toLocaleString('en-US')} (${eqGapPct?.toFixed(2)}%)`}
            </span>
          </div>

          <div className="grid sm:grid-cols-4 gap-2.5 text-xs">
            {[
              { key: 'total_assets', label: 'Total Assets (A)', val: aTab, sub: assets?.row_label },
              { key: 'total_liabilities', label: 'Total Liabilities (L)', val: lTab, sub: liab?.is_derived ? `${liab.row_label} (derived)` : liab?.row_label },
              { key: 'equity', label: "Shareholders' Equity (E)", val: eTab, sub: eq?.row_label },
              { key: 'le_sum', label: 'Computed L + E', val: leSum, sub: Math.abs(eqGap) < 0.5 ? 'Matches Assets' : `Diff vs A: ${Math.round(eqGap).toLocaleString('en-US')}` },
            ].map((box) => {
              const isActive = box.key === v.metric;
              return (
                <div key={box.key} className={`rounded-xl p-3 border ${isActive ? 'border-amber-500 bg-amber-50/50 ring-1 ring-amber-400' : 'border-gray-200 bg-gray-50/70'}`}>
                  <div className="text-gray-500 font-medium">{box.label}</div>
                  <div className="text-base font-extrabold text-gray-900 tabular-nums mt-0.5">
                    {Math.round(box.val).toLocaleString('en-US')}
                  </div>
                  <div className="text-[11px] text-gray-500 truncate mt-0.5" title={box.sub}>{box.sub || '—'}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Segment Revenue Breakdown when extracted for this filing */}
      {runSegments.length > 0 && (() => {
        const segSum = runSegments.reduce((s, x) => s + Number(x.value || 0), 0);
        const revVal = byMetric.revenue?.value ?? null;
        return (
          <section aria-labelledby="rev-seg-heading" className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="rev-seg-heading" className="text-sm font-bold text-gray-900">
                Segment Revenue Breakdown ({runSegments.length} segments)
              </h2>
              <span className="text-xs font-mono text-gray-600 tabular-nums">
                Sum {segSum.toLocaleString('en-US')}{revVal !== null ? ` vs Revenue ${revVal.toLocaleString('en-US')}` : ''}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              {runSegments.map((s) => (
                <div key={s.segment} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200/80">
                  <span className="font-medium text-gray-800 truncate">{s.segment}</span>
                  <span className="font-bold text-gray-900 tabular-nums shrink-0">
                    {s.value.toLocaleString('en-US')} {segSum ? `(${((s.value / segSum) * 100).toFixed(0)}%)` : ''}
                  </span>
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      {/* 2. Filing Metric Snapshot (Cross-Statement Context) */}
      {all.length > 0 && (
        <section aria-labelledby="snapshot-heading" className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="snapshot-heading" className="text-sm font-bold text-gray-900">{v.ticker} 10-K · All {all.length} extracted metrics</h2>
              <p className="text-xs text-gray-600 mt-0.5">Cross-statement context from the same filing ({v.accession} · FY ending {v.period_end}).</p>
            </div>
            <span className="text-xs text-gray-500 font-medium">
              {all.filter((r) => r.status === 'auto_approved').length} auto · {all.filter((r) => r.status === 'escalated').length} waiting · {all.filter((r) => r.status === 'approved' || r.status === 'corrected' || r.status === 'rejected').length} decided
            </span>
          </div>

          <div className="grid sm:grid-cols-2 gap-2.5 text-xs">
            {all.map((m) => {
              const isCurrent = m.id === v.id;
              const yoy = m.value !== null && m.prior_value
                ? ((m.value - m.prior_value) / Math.abs(m.prior_value)) * 100
                : null;
              const st = STATUS_STYLE[m.status];
              return (
                <div
                  key={m.id}
                  className={`rounded-xl p-3 border flex items-start justify-between gap-2 ${
                    isCurrent ? 'border-amber-500 bg-amber-50/60 ring-1 ring-amber-400' : 'border-gray-200 bg-gray-50/50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-gray-900 truncate">{METRIC_LABEL[m.metric]}</span>
                      {isCurrent && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900 text-white font-bold uppercase">Reviewing</span>}
                    </div>
                    <div className="text-sm font-extrabold text-gray-900 tabular-nums mt-0.5">
                      {tableNumber(m, m.value)} <span className="text-[11px] font-normal text-gray-500">{unitText(m)}</span>
                    </div>
                    <div className="text-[11px] text-gray-500 mt-0.5 tabular-nums">
                      Conf {m.confidence.toFixed(2)}{m.confidence < threshold ? ' (low)' : ''}
                      {yoy !== null ? ` · YoY ${yoy >= 0 ? '+' : ''}${yoy.toFixed(0)}%` : ''}
                    </div>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${st.cls}`}>
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. Run Escalation Queue Tracker */}
      <section aria-labelledby="run-queue-heading" className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="run-queue-heading" className="text-sm font-bold text-gray-900">
            Escalation queue for {item.thread_id} ({runQueue.length} waiting)
          </h2>
          <span className="text-xs font-mono text-gray-500">LangGraph interrupt()</span>
        </div>
        <ul className="divide-y divide-gray-100 text-xs">
          {runQueue.map((q, idx) => (
            <li key={q.value.id} className="py-2.5 flex items-start justify-between gap-3">
              <div>
                <div className="font-bold text-gray-900">
                  {idx + 1}. {METRIC_LABEL[q.value.metric]} ({tableNumber(q.value, q.value.value)} {unitText(q.value)})
                </div>
                <div className="text-gray-600 mt-0.5">{q.reason || 'Escalated for human review'}</div>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full font-semibold shrink-0 ${
                q.is_current ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-gray-100 text-gray-600'
              }`}>
                {q.is_current ? 'Paused now' : 'Queued next'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 4. Source Metadata & Audit Provenance Strip */}
      <section aria-labelledby="provenance-heading" className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
        <h2 id="provenance-heading" className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
          Source Metadata &amp; Audit Provenance
        </h2>
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <dt className="text-gray-500">Workflow thread</dt>
            <dd className="font-mono font-semibold text-gray-900 mt-0.5">{item.thread_id}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Statement section</dt>
            <dd className="font-mono font-semibold text-gray-900 mt-0.5 truncate" title={v.source_page}>{v.source_page || '10-K Item 8'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">10-K Accession</dt>
            <dd className="font-mono font-semibold text-gray-900 mt-0.5">{v.accession}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Statement table</dt>
            <dd className="font-mono font-semibold text-gray-900 mt-0.5">
              Table #{v.table_index ?? '—'} · {v.extractor}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Statement scale</dt>
            <dd className="font-mono font-semibold text-gray-900 mt-0.5">×{(v.scale || 1).toLocaleString('en-US')} ({v.unit})</dd>
          </div>
          <div>
            <dt className="text-gray-500">Value ID</dt>
            <dd className="font-mono font-semibold text-gray-900 mt-0.5 truncate" title={v.id}>{v.id}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
