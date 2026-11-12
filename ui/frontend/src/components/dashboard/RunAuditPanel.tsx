import { useState } from 'react';
import { CheckCircle2, FileText } from 'lucide-react';
import { api } from '../../api';
import { METRIC_LABEL, errorText, shortHash } from './format';
import { ErrorBox } from './states';
import { useApi } from './useApi';

/** The end of an audit, per run: the printable report, the reviewer's sign-off, and every decision's history. */
export function RunAuditPanel({ threadId, isDecided }: { threadId: string; isDecided: boolean }) {
  const signoff = useApi(() => api.getSignoff(threadId));
  const trail = useApi(() => api.audit(5000));
  const [reviewer, setReviewer] = useState(() => { try { return localStorage.getItem('auditloop.reviewer') || ''; } catch { return ''; } });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signed = signoff.data?.signoff;
  const rows = (trail.data ?? []).filter((r) => r.thread_id === threadId && r.value_id !== 'signoff').sort((a, b) => a.seq - b.seq);

  async function submit() {
    setBusy(true);
    setError(null);
    try { await api.signOff(threadId, reviewer.trim(), note.trim() || undefined); signoff.reload(); trail.reload(); }
    catch (e: unknown) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  const inputCls = 'min-h-11 px-3 rounded-lg border border-gray-300 bg-white text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-black';
  return (
    <section aria-labelledby="audit-panel-heading" className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="audit-panel-heading" className="text-base font-bold text-gray-900">Audit of run {threadId}</h2>
        <a href={api.auditReportUrl(threadId)} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 min-h-11 px-4 rounded-full border border-gray-300 text-sm font-semibold hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-black">
          <FileText className="w-4 h-4" /> Audit report (print / PDF)
        </a>
      </div>

      {signed ? (
        <p role="status" className="flex items-center gap-2 text-sm bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-950">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          Signed off by <b>{signed.reviewer}</b> on {new Date(signed.ts).toLocaleString()}: {signed.reason}
        </p>
      ) : isDecided ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-gray-700">Reviewer
            <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} className={`${inputCls} block mt-1 w-48`} autoComplete="name" />
          </label>
          <label className="text-xs font-semibold text-gray-700 flex-1 min-w-[14rem]">Sign-off note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} block mt-1 w-full`} placeholder="e.g. all values agree with the filing" />
          </label>
          <button type="button" onClick={submit} disabled={busy || !reviewer.trim()}
            className="min-h-11 px-5 rounded-full bg-black text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black">
            {busy ? 'Signing…' : 'Sign off this run'}
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-600">Sign-off opens once every value in this run has a decision.</p>
      )}
      {error && <ErrorBox message={error} />}

      <details>
        <summary className="cursor-pointer text-sm font-semibold text-gray-800 min-h-11 flex items-center">Decision history ({rows.length})</summary>
        <ol className="mt-2 space-y-1.5 text-xs text-gray-700">
          {rows.map((r) => (
            <li key={r.seq} className="flex flex-wrap gap-x-2">
              <span className="font-bold tabular-nums">#{r.seq}</span>
              <span>{new Date(r.ts).toLocaleString()}</span>
              <span className="font-semibold">{METRIC_LABEL[r.metric] ?? r.metric}</span>
              <span>{r.decision.replace('_', ' ')} by {r.reviewer}</span>
              {r.corrected_value !== null && <span>{r.original_value?.toLocaleString('en-US')} → {r.corrected_value.toLocaleString('en-US')}</span>}
              {r.reason && <span className="text-gray-600">“{r.reason}”</span>}
              <span className="font-mono text-gray-500">{shortHash(r.hash)}</span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
