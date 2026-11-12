import { useState } from 'react';
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

/** PS 3.8: append-only, SHA-256 hash-chained audit log (audit/log.py). */
export function AuditTab() {
  const rows = useApi(() => api.audit(200));
  const [check, setCheck] = useState<ChainCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  async function verify() {
    setChecking(true);
    setCheckError(null);
    try { setCheck(await api.verifyAudit()); } catch (e: unknown) { setCheckError(errorText(e)); } finally { setChecking(false); }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Audit log</h1>
          <p className="text-sm text-gray-600 mt-1">Every decision, human and automatic. Append-only: the database refuses UPDATE and DELETE.</p>
        </div>
        <button type="button" onClick={verify} disabled={checking}
          className="inline-flex items-center gap-2 min-h-11 px-4 rounded-full bg-black text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black">
          <ShieldCheck className="w-4 h-4" /> {checking ? 'Verifying…' : 'Verify chain'}
        </button>
      </header>

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

      {rows.isLoading && !rows.data && <Loading label="Loading the audit log…" />}
      {rows.error && !rows.data && <ErrorBox message={rows.error} onRetry={rows.reload} />}
      {rows.data && rows.data.length === 0 && <Empty title="No decisions yet">Auto-approvals and reviewer decisions appear here as runs progress.</Empty>}
      {rows.data && rows.data.length > 0 && (
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
              {rows.data.map((r) => (
                <tr key={r.seq}>
                  <td className="py-3 px-4 font-bold tabular-nums">{r.seq}</td>
                  <td className="py-3 px-4 text-gray-700 whitespace-nowrap">{new Date(r.ts).toLocaleString()}</td>
                  <td className="py-3 px-4 font-medium text-gray-900">{r.thread_id.split('-')[0]} · {METRIC_LABEL[r.metric] ?? r.metric}</td>
                  <td className="py-3 px-4 tabular-nums">
                    {r.original_value?.toLocaleString('en-US') ?? '—'}
                    {r.corrected_value !== null && <> → <strong>{r.corrected_value.toLocaleString('en-US')}</strong></>}
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
