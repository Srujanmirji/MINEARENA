import { useState } from 'react';
import { Download } from 'lucide-react';
import { api, pct, type Accuracy, type ReportRow } from '../../api';
import { METRIC_LABEL, STATUS_STYLE } from './format';
import { Empty, ErrorBox, Loading, StatCard } from './states';
import { useApi } from './useApi';

function fmtBase(metric: string, val: number | null): string {
  if (val === null || val === undefined) return '—';
  if (metric === 'eps_diluted') return `$${val.toFixed(2)}`;
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 0 })}M`;
  return `$${val.toLocaleString('en-US')}`;
}

/** GET /report: graded against SEC XBRL after review. Every number is recomputed from app.db. */
export function AccuracyTab() {
  const rep = useApi(() => api.report());
  const [tickerFilter, setTickerFilter] = useState<string>('');
  if (rep.isLoading && !rep.data) return <Loading label="Building the accuracy report…" />;
  if (rep.error && !rep.data) return <ErrorBox message={rep.error} onRetry={rep.reload} />;
  const r = rep.data;
  if (!r) return null;
  const o = r.overall;
  const wrongAuto = r.rows.filter((x) => x.status === 'auto_approved' && x.match === false).length;
  const lift = o.accuracy !== null && o.pre_review_accuracy !== null ? o.accuracy - o.pre_review_accuracy : null;
  const escalatedRows = r.rows.filter((x) => x.status !== 'auto_approved');
  const reasonBuckets = [
    { label: 'Accounting check failed (e.g., A = L + E)', rows: [] as ReportRow[] },
    { label: 'Year-on-year swing anomaly', rows: [] as ReportRow[] },
    { label: 'Derived formula (capped ≤ 0.75)', rows: [] as ReportRow[] },
    { label: 'Confidence / label / missing value', rows: [] as ReportRow[] },
  ];
  for (const row of escalatedRows) {
    const why = (row.escalation_reason ?? '').toLowerCase();
    if (why.includes('a = l + e') || why.includes('equation') || why.includes('check') || why.includes('segment') || why.includes('failed')) {
      reasonBuckets[0].rows.push(row);
    } else if (row.yoy_anomaly || why.includes('year-on-year') || why.includes('yoy')) {
      reasonBuckets[1].rows.push(row);
    } else if (why.includes('derived')) {
      reasonBuckets[2].rows.push(row);
    } else {
      reasonBuckets[3].rows.push(row);
    }
  }
  const activeBuckets = reasonBuckets.filter((b) => b.rows.length > 0);
  const tickers = Array.from(new Set(r.rows.map((x) => x.ticker)));
  const shownRows = tickerFilter ? r.rows.filter((x) => x.ticker === tickerFilter) : r.rows;

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
            <StatCard
              label="Before review"
              value={pct(o.pre_review_accuracy)}
              sub={lift !== null && lift > 0 ? `+${(lift * 100).toFixed(1)}% accuracy lift after human review` : 'Values as first extracted'}
            />
            <StatCard label="Escalation precision" value={pct(r.escalation_precision)} sub={`Of ${r.decisions.escalated} escalated: wrong or a YoY anomaly`} />
            <StatCard label="Wrong auto-approvals" value={String(wrongAuto)} sub={`of ${r.decisions.auto_approved} auto-approved (${pct(r.auto_approval_error_rate)})`} tone={wrongAuto ? 'text-red-700' : 'text-emerald-700'} />
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-4 text-sm">
            <div className="font-semibold text-gray-900">Automated vs. Human Routing Summary (PS 3.8)</div>
            <div className="flex flex-wrap gap-6 tabular-nums">
              <span><strong className="text-emerald-700">{r.decisions.auto_approved}</strong> auto-approved</span>
              <span><strong className="text-amber-800">{r.decisions.escalated}</strong> escalated to human</span>
              <span><strong className="text-gray-900">{r.decisions.reviewed}</strong> reviewed</span>
              <span><strong className="text-gray-600">{r.decisions.pending}</strong> pending</span>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <Bars title="By metric" data={Object.entries(r.by_metric).map(([k, a]) => [METRIC_LABEL[k as keyof typeof METRIC_LABEL] ?? k, a])} />
            <Bars title="By company" data={Object.entries(r.by_company)} />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <section aria-labelledby="cal-heading" className="bg-white p-6 rounded-2xl border border-gray-200">
              <h2 id="cal-heading" className="text-base font-bold text-gray-900">Calibration</h2>
              <p className="text-xs text-gray-600 mt-0.5 mb-4">Is the confidence score honest? Accuracy of the value as extracted, by confidence band.</p>
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-600 text-left">
                  <tr>
                    <th scope="col" className="py-2">Confidence</th>
                    <th scope="col" className="py-2 text-right">Values</th>
                    <th scope="col" className="py-2 text-right">Accuracy</th>
                    <th scope="col" className="py-2 pl-4 w-36">Bar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 tabular-nums">
                  {r.calibration.map((b) => {
                    const ratio = b.accuracy ?? 0;
                    const barColor = ratio >= 0.9 ? 'bg-emerald-600' : ratio >= 0.7 ? 'bg-amber-500' : 'bg-red-500';
                    return (
                      <tr key={b.band}>
                        <td className="py-2.5 font-semibold">{b.band}</td>
                        <td className="py-2.5 text-right">{b.n}</td>
                        <td className="py-2.5 text-right font-semibold">{pct(b.accuracy)}</td>
                        <td className="py-2.5 pl-4">
                          <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${ratio * 100}%` }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <section aria-labelledby="esc-heading" className="bg-white p-6 rounded-2xl border border-gray-200">
              <h2 id="esc-heading" className="text-base font-bold text-gray-900">Why Values Escalated</h2>
              <p className="text-xs text-gray-600 mt-0.5 mb-4">Root causes across all {escalatedRows.length} escalated metrics in completed runs.</p>
              {activeBuckets.length === 0 ? (
                <p className="text-xs text-gray-500">All values auto-approved with zero escalations.</p>
              ) : (
                <ul className="space-y-3">
                  {activeBuckets.map((b) => {
                    const share = escalatedRows.length ? b.rows.length / escalatedRows.length : 0;
                    const corrected = b.rows.filter((row) => row.status === 'corrected').length;
                    return (
                      <li key={b.label}>
                        <div className="flex justify-between text-xs font-semibold mb-1 gap-2">
                          <span className="text-gray-800">{b.label}</span>
                          <span className="tabular-nums shrink-0 text-gray-700">
                            {b.rows.length} {b.rows.length === 1 ? 'item' : 'items'}
                            {corrected > 0 ? ` · ${corrected} corrected` : ''}
                          </span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-600 rounded-full" style={{ width: `${share * 100}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <section aria-labelledby="xbrl-heading" className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="xbrl-heading" className="text-base font-bold text-gray-900">SEC XBRL Company Facts comparison</h2>
                <p className="text-xs text-gray-600 mt-0.5">Every extracted value compared against its official US-GAAP XBRL tag for the same 10-K accession and period end.</p>
              </div>
              {tickers.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setTickerFilter('')}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border ${tickerFilter === '' ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
                    All ({r.rows.length})
                  </button>
                  {tickers.map((t) => (
                    <button key={t} type="button" onClick={() => setTickerFilter(t)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border ${tickerFilter === t ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[56rem]">
                <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                  <tr>
                    <th scope="col" className="py-3 px-4">Company · Metric</th>
                    <th scope="col" className="py-3 px-4">Decision</th>
                    <th scope="col" className="py-3 px-4 text-right">Confidence</th>
                    <th scope="col" className="py-3 px-4 text-right">Our final value</th>
                    <th scope="col" className="py-3 px-4">SEC XBRL US-GAAP tag</th>
                    <th scope="col" className="py-3 px-4 text-right">XBRL ground truth</th>
                    <th scope="col" className="py-3 px-4">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 tabular-nums">
                  {shownRows.map((row: ReportRow) => {
                    const st = STATUS_STYLE[row.status];
                    return (
                      <tr key={row.value_id}>
                        <td className="py-2.5 px-4 font-semibold text-gray-900">{row.ticker} · {METRIC_LABEL[row.metric] ?? row.metric}</td>
                        <td className="py-2.5 px-4"><span className={`px-2 py-0.5 rounded-full font-semibold ${st.cls}`}>{st.label}</span></td>
                        <td className="py-2.5 px-4 text-right font-medium">{row.confidence.toFixed(2)}</td>
                        <td className="py-2.5 px-4 text-right font-semibold text-gray-900">{fmtBase(row.metric, row.our_value)}</td>
                        <td className="py-2.5 px-4 font-mono text-gray-600">{row.xbrl_tag ? `us-gaap:${row.xbrl_tag}` : '— (not tagged in XBRL)'}</td>
                        <td className="py-2.5 px-4 text-right font-semibold text-gray-900">{fmtBase(row.metric, row.xbrl_value)}</td>
                        <td className="py-2.5 px-4">
                          {row.match === true && <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">Match</span>}
                          {row.match === false && <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-semibold">Mismatch</span>}
                          {row.match === null && <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-semibold">No GT</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
