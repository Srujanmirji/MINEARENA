import { useEffect, useRef } from 'react';
import { ArrowRight, CheckCircle2, X } from 'lucide-react';
import { api, type AuditRow } from '../../api';
import { METRIC_LABEL, tableNumber } from './format';
import { useApi } from './useApi';

interface Props {
  /** Re-fetch whenever this changes (the review queue after a decision). */
  refreshOn: unknown;
}

const HUMAN = new Set<AuditRow['decision']>(['approved', 'corrected', 'rejected']);

const DECISION = {
  approved: { label: 'Validated', Icon: CheckCircle2, cls: 'bg-emerald-100 text-emerald-800' },
  corrected: { label: 'Corrected', Icon: ArrowRight, cls: 'bg-blue-100 text-blue-800' },
  rejected: { label: 'Rejected', Icon: X, cls: 'bg-red-100 text-red-800' },
} as const;

function when(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** PS 3.7 "track completed reviews": every human decision, newest first, read from the audit log. */
export function ReviewedList({ refreshOn }: Props) {
  const audit = useApi(() => api.audit(500));
  const isFirst = useRef(true);
  const { reload } = audit;

  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    reload();
  }, [refreshOn, reload]);

  // Sign-off rows close a run; they are not a decision on a value.
  const rows = (audit.data ?? []).filter((r) => HUMAN.has(r.decision) && !r.decision_id.endsWith(':signoff'));

  return (
    <section aria-labelledby="reviewed-heading" className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="reviewed-heading" className="text-sm font-bold text-gray-900">
          Reviewed by a human ({rows.length})
        </h2>
        <span className="text-xs text-gray-500">From the append-only audit log</span>
      </div>

      {audit.error && !audit.data && (
        <p className="text-xs text-red-700">
          Couldn&apos;t load reviewed values: {audit.error}{' '}
          <button type="button" onClick={reload} className="underline font-medium">Retry</button>
        </p>
      )}
      {audit.isLoading && !audit.data && <p className="text-xs text-gray-500">Loading reviewed values…</p>}
      {audit.data && rows.length === 0 && (
        <p className="text-xs text-gray-600">No decisions yet. Values you approve, correct or reject appear here.</p>
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-gray-100 text-xs">
          {rows.map((r) => {
            const d = DECISION[r.decision as keyof typeof DECISION];
            const ticker = r.thread_id.split('-')[0];
            const metric = { metric: r.metric };
            return (
              <li key={r.decision_id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-gray-900">
                    {ticker} · {METRIC_LABEL[r.metric] ?? r.metric}{' '}
                    <span className="font-semibold text-gray-700 tabular-nums">
                      {r.decision === 'corrected'
                        ? `${tableNumber(metric, r.original_value)} → ${tableNumber(metric, r.corrected_value)}`
                        : tableNumber(metric, r.original_value)}
                    </span>
                  </div>
                  <div className="text-gray-600 mt-0.5">
                    {r.reviewer} · {when(r.ts)}{r.reason ? ` · “${r.reason}”` : ''}
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold shrink-0 ${d.cls}`}>
                  <d.Icon className="w-3.5 h-3.5" aria-hidden="true" /> {d.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
