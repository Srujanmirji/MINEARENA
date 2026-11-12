import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { api, type AuditRow, type ChainCheck } from '../../api';
import { METRIC_LABEL, errorText, shortHash } from './format';
import { Empty, ErrorBox, Loading } from './states';
import { useApi } from './useApi';

const DECISION_STYLE: Record<AuditRow['decision'], string> = {
  approved: 'bg-emerald-100 text-emerald-800',
  auto_approved: 'bg-gray-100 text-gray-800',
  corrected: 'bg-blue-100 text-blue-800',
  rejected: 'bg-red-100 text-red-800',
};

type DecisionFilter = 'all' | 'human' | 'changed' | 'auto_approved';

/** PS 3.8: append-only, SHA-256 hash-chained audit log (audit/log.py). */
export function AuditTab() {
  const rows = useApi(() => api.audit(200));
  const [check, setCheck] = useState<ChainCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('all');
  const [tickerFilter, setTickerFilter] = useState<string>('');

  async function verify() {
    setChecking(true);
    setCheckError(null);
    try { setCheck(await api.verifyAudit()); } catch (e: unknown) { setCheckError(errorText(e)); } finally { setChecking(false); }
  }

  const all = useMemo(() => rows.data ?? [], [rows.data]);
  const tickers = useMemo(() => Array.from(new Set(all.map((r) => r.thread_id.split('-')[0]))), [all]);
  const humanCount = all.filter((r) => r.decision !== 'auto_approved').length;
  const changedCount = all.filter((r) => r.decision === 'corrected' || r.decision === 'rejected').length;
  const autoCount = all.filter((r) => r.decision === 'auto_approved').length;

  const filtered = all.filter((r) => {
    if (tickerFilter && r.thread_id.split('-')[0] !== tickerFilter) return false;
    if (decisionFilter === 'human') return r.decision !== 'auto_approved';
    if (decisionFilter === 'changed') return r.decision === 'corrected' || r.decision === 'rejected';
    if (decisionFilter === 'auto_approved') return r.decision === 'auto_approved';
    return true;
  });
  const latest = all[0];

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Audit log</h1>
          <p className="text-sm text-gray-600 mt-1">Every decision, human and automatic. Append-only: the database refuses UPDATE and DELETE.</p>
        </div>
        <button type="button" onClick={verify} disabled={checking}
          className="inline-flex items-center gap-2 min-h-11 px-4 rounded-full bg-black text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black">
          <ShieldCheck className="w-4 h-4" /> {checking ? 'Verifying…' : 'Verify chain'}
        </button>
      </header>

      {/* Cryptographic Tamper-Evidence Strip */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 text-gray-800">
          <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>
            <strong>SQLite Immutability Triggers Active:</strong> <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">BEFORE UPDATE / DELETE → ABORT</code>
          </span>
        </div>
        {latest && (
          <div className="font-mono text-gray-600 flex flex-wrap items-center gap-1.5">
            <span className="text-gray-500">Latest SHA-256 link (#{latest.seq}):</span>
            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-800">{shortHash(latest.prev_hash)}</span>
            <span>→</span>
            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-200 font-semibold">{shortHash(latest.hash)}</span>
          </div>
        )}
      </div>

      {checkError && <ErrorBox message={checkError} onRetry={verify} />}
      {check && (check.ok ? (
        <div role="status" className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 text-sm text-emerald-950">
          <CheckCircle2 className="w-5 h-5 text-emerald-700" />
          <span><strong>Chain intact.</strong> All {check.rows} rows recomputed; every hash links to the one before.</span>
        </div>
      ) : (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-sm text-red-950">
          <AlertTriangle className="w-5 h-5 text-red-700" />
          <span><strong>Chain broken at row #{check.broken_at_seq}.</strong> That row, or one before it, was altered.</span>
        </div>
      ))}

      {all.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5 text-xs">
            {[
              { id: 'all' as const, label: `All (${all.length})` },
              { id: 'human' as const, label: `Human decisions (${humanCount})` },
              { id: 'changed' as const, label: `Corrected / Rejected (${changedCount})` },
              { id: 'auto_approved' as const, label: `Auto-approved (${autoCount})` },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setDecisionFilter(f.id)}
                className={`px-3 py-1.5 rounded-full font-semibold border cursor-pointer ${
                  decisionFilter === f.id ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {tickers.length > 1 && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setTickerFilter('')}
                className={`px-3 py-1 rounded-full font-semibold border cursor-pointer ${
                  tickerFilter === '' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                All companies
              </button>
              {tickers.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTickerFilter(t)}
                  className={`px-3 py-1 rounded-full font-semibold border cursor-pointer ${
                    tickerFilter === t ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {rows.isLoading && !rows.data && <Loading label="Loading the audit log…" />}
      {rows.error && !rows.data && <ErrorBox message={rows.error} onRetry={rows.reload} />}
      {rows.data && all.length === 0 && <Empty title="No decisions yet">Auto-approvals and reviewer decisions appear here as runs progress.</Empty>}
      {all.length > 0 && filtered.length === 0 && (
        <Empty title="No matching rows">No audit entries match the selected filter.</Empty>
      )}
      {filtered.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[56rem]">
            <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
              <tr>
                <th scope="col" className="py-3 px-4">#</th>
                <th scope="col" className="py-3 px-4">Time</th>
                <th scope="col" className="py-3 px-4">Value</th>
                <th scope="col" className="py-3 px-4">Original → final</th>
                <th scope="col" className="py-3 px-4">Decision</th>
                <th scope="col" className="py-3 px-4">Reviewer · reason</th>
                <th scope="col" className="py-3 px-4">Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 align-top">
              {filtered.map((r) => (
                <tr key={r.seq} className="hover:bg-gray-50/70">
                  <td className="py-3 px-4 font-bold tabular-nums">{r.seq}</td>
                  <td className="py-3 px-4 text-gray-700 whitespace-nowrap">{new Date(r.ts).toLocaleString()}</td>
                  <td className="py-3 px-4 font-medium text-gray-900">{r.thread_id.split('-')[0]} · {METRIC_LABEL[r.metric] ?? r.metric}</td>
                  <td className="py-3 px-4 tabular-nums">
                    {r.original_value?.toLocaleString('en-US') ?? '—'}
                    {r.corrected_value !== null && <> → <strong className="text-blue-700">{r.corrected_value.toLocaleString('en-US')}</strong></>}
                  </td>
                  <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded font-semibold ${DECISION_STYLE[r.decision]}`}>{r.decision.replace('_', ' ')}</span></td>
                  <td className="py-3 px-4 text-gray-700 max-w-[18rem]">{r.reviewer}{r.reason ? ` · ${r.reason}` : ''}</td>
                  <td className="py-3 px-4 font-mono text-gray-600" title={`hash ${r.hash}\nprev ${r.prev_hash}`}>{shortHash(r.hash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
