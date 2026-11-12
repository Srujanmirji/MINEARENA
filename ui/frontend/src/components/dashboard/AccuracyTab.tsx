import { Download } from 'lucide-react';
import { api, pct, type Accuracy } from '../../api';
import { METRIC_LABEL } from './format';
import { Empty, ErrorBox, Loading, StatCard } from './states';
import { useApi } from './useApi';

/** GET /report: graded against SEC XBRL after review. Every number is recomputed from app.db. */
export function AccuracyTab() {
  const rep = useApi(() => api.report());
  if (rep.isLoading && !rep.data) return <Loading label="Building the accuracy report…" />;
  if (rep.error && !rep.data) return <ErrorBox message={rep.error} onRetry={rep.reload} />;
  const r = rep.data;
  if (!r) return null;
  const o = r.overall;
  const wrongAuto = r.rows.filter((x) => x.status === 'auto_approved' && x.match === false).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Accuracy report</h1>
          <p className="text-sm text-gray-600 mt-1">
            Final values graded against SEC XBRL Company Facts, only after review. Correct = within one unit of the table&apos;s scale.
          </p>
        </div>
        <a href={api.reportCsvUrl()} className="inline-flex items-center gap-2 min-h-11 px-4 rounded-full border border-gray-300 bg-white text-sm font-semibold hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-black">
          <Download className="w-4 h-4" /> Download CSV
        </a>
      </header>

      {o.verifiable === 0 ? (
        <Empty title="Nothing graded yet">A run is graded once all its reviews are done. Finish a run, then come back.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Accuracy (final)" value={pct(o.accuracy)} sub={`${o.correct} of ${o.verifiable} correct · ${o.no_ground_truth} without ground truth`} />
            <StatCard label="Before review" value={pct(o.pre_review_accuracy)} sub="Values as first extracted" />
            <StatCard label="Escalation precision" value={pct(r.escalation_precision)} sub={`Of ${r.decisions.escalated} escalated: wrong or a YoY anomaly`} />
            <StatCard label="Wrong auto-approvals" value={String(wrongAuto)} sub={`of ${r.decisions.auto_approved} auto-approved (${pct(r.auto_approval_error_rate)})`} tone={wrongAuto ? 'text-red-700' : 'text-emerald-700'} />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <Bars title="By metric" data={Object.entries(r.by_metric).map(([k, a]) => [METRIC_LABEL[k as keyof typeof METRIC_LABEL] ?? k, a])} />
            <Bars title="By company" data={Object.entries(r.by_company)} />
          </div>

          <section aria-labelledby="cal-heading" className="bg-white p-6 rounded-2xl border border-gray-200">
            <h2 id="cal-heading" className="text-base font-bold text-gray-900">Calibration</h2>
            <p className="text-xs text-gray-600 mt-0.5 mb-4">Is the confidence score honest? Accuracy of the value as extracted, by confidence band.</p>
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-600 text-left">
                <tr><th scope="col" className="py-2">Confidence</th><th scope="col" className="py-2 text-right">Values</th><th scope="col" className="py-2 text-right">Correct</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100 tabular-nums">
                {r.calibration.map((b) => (
                  <tr key={b.band}><td className="py-2 font-semibold">{b.band}</td><td className="py-2 text-right">{b.n}</td><td className="py-2 text-right">{pct(b.accuracy)}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function Bars({ title, data }: { title: string; data: [string, Accuracy][] }) {
  return (
    <section className="bg-white p-6 rounded-2xl border border-gray-200">
      <h2 className="text-base font-bold text-gray-900 mb-4">{title}</h2>
      <ul className="space-y-3">
        {data.map(([name, a]) => (
          <li key={name}>
            <div className="flex justify-between text-xs font-semibold mb-1">
              <span>{name}</span>
              <span className="tabular-nums">{a.verifiable ? `${pct(a.accuracy)} · ${a.correct}/${a.verifiable}` : 'no ground truth'}</span>
            </div>
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gray-900 rounded-full" style={{ width: `${(a.accuracy ?? 0) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
