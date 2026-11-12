import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { api, ApiError, type Action, type PendingItem } from '../../api';
import { CHECK_STYLE, METRIC_LABEL, errorText, tableNumber, unitText } from './format';
import { Empty, ErrorBox, Loading } from './states';
import { SourceEvidence } from './SourceEvidence';
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

  const queuedInRun = (queue.data ?? []).filter((p) => p.thread_id === item.thread_id).length;
  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm mb-2">
        <div className="text-gray-600 font-medium">
          Review queue <span className="text-gray-400">/</span> {item.value.ticker} · {METRIC_LABEL[item.value.metric]}
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={queue.reload} disabled={queue.isLoading}
          className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className="w-3.5 h-3.5" /> {queue.isLoading ? 'Refreshing…' : 'Refresh'}
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
        <div className="lg:col-span-7">
          <SourceEvidence threadId={item.thread_id} value={item.value} />
        </div>
        <div className="lg:col-span-5 space-y-6">
          <ValueCard item={item} threshold={threshold} />
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
  return (
    <section aria-labelledby="value-heading" className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs">
      <h2 id="value-heading" className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Extracted value</h2>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-4xl font-extrabold text-gray-900 tracking-tight tabular-nums">{tableNumber(v, v.value)}</span>
        <span className="text-sm font-semibold text-gray-600">{unitText(v)}</span>
      </div>
      <dl className="grid grid-cols-2 gap-4 mt-3 text-xs border-b border-gray-100 pb-4">
        <div><dt className="text-gray-500">Period</dt><dd className="font-semibold text-gray-800 mt-0.5">{v.period_start ? `${v.period_start} → ` : 'As of '}{v.period_end}</dd></div>
        <div><dt className="text-gray-500">Row label</dt><dd className="font-semibold text-gray-800 mt-0.5">{v.row_label || '—'}{v.is_derived ? ' (derived)' : ''}</dd></div>
      </dl>

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
          <div className="text-xs text-gray-600">Table parser</div>
          <div className="text-base font-bold text-gray-900 mt-0.5 tabular-nums">{parser === null ? 'no answer' : tableNumber(v, parser)}</div>
        </div>
        <div className="border-2 border-dashed border-amber-500 bg-amber-50/40 rounded-xl p-3">
          <div className="text-xs text-gray-600">LLM</div>
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
        <label className="block">
          <span className="block text-xs font-semibold text-gray-700 mb-1.5">Reviewer</span>
          <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} className={inputCls} placeholder="Your name" autoComplete="name" />
        </label>
      </div>

      {error && <div role="alert" className="mt-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

      <div className="grid grid-cols-3 gap-3 mt-4">
        <button type="button" disabled={busy !== null} onClick={() => submit('approve')}
          className="min-h-11 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-lg disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
          {busy === 'approve' ? 'Saving…' : 'Approve'}
        </button>
        <button type="button" disabled={busy !== null || !canCorrect} onClick={() => submit('correct')}
          aria-describedby="decision-hint"
          className="min-h-11 bg-white hover:bg-blue-50 text-blue-700 border border-blue-500 text-sm font-semibold rounded-lg disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
          {busy === 'correct' ? 'Saving…' : 'Correct'}
        </button>
        <button type="button" disabled={busy !== null || !canReject} onClick={() => submit('reject')}
          aria-describedby="decision-hint"
          className="min-h-11 bg-white hover:bg-red-50 text-red-700 border border-red-400 text-sm font-semibold rounded-lg disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700">
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
