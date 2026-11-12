import { useState } from 'react';
import { api, type ExtractedValue } from '../../api';
import { CHECK_STYLE, METRIC_LABEL, STATUS_STYLE, TICKERS, tableNumber, unitText } from './format';
import { Empty, ErrorBox, Loading } from './states';
import { useApi } from './useApi';

/** PS 3.7: extracted metrics, confidence scores and validation results, per company. */
export function ValuesTab() {
  const values = useApi(() => api.values());
  const [ticker, setTicker] = useState<string>('');

  if (values.isLoading && !values.data) return <Loading label="Loading extracted values…" />;
  if (values.error && !values.data) return <ErrorBox message={values.error} onRetry={values.reload} />;
  const all = values.data ?? [];
  const tickers = TICKERS.filter((t) => all.some((v) => v.ticker === t));
  const shown = ticker || tickers[0] || '';
  const rows = all.filter((v) => v.ticker === shown);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-gray-900">Extracted values</h1>
        <p className="text-sm text-gray-600 mt-1">Every metric with its period, unit, source row, confidence and validation results.</p>
      </header>
      {all.length === 0 && <Empty title="No values yet">Start a run on the Runs tab.</Empty>}
      {tickers.length > 0 && (
        <div role="group" aria-label="Company" className="flex flex-wrap gap-2">
          {tickers.map((t) => (
            <button key={t} type="button" aria-pressed={t === shown} onClick={() => setTicker(t)}
              className={`min-h-11 px-4 rounded-full text-sm font-semibold border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black ${t === shown ? 'bg-black text-white border-black' : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'}`}>
              {t}
            </button>
          ))}
        </div>
      )}
      {rows.length > 0 && <FilingSummary rows={rows} />}
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
  const status = STATUS_STYLE[v.status];
  const final = v.final_value ?? v.value;
  return (
    <tr>
      <th scope="row" className="py-3 px-4 font-semibold text-gray-900">{METRIC_LABEL[v.metric]}</th>
      <td className="py-3 px-4 text-right tabular-nums">
        <div className="font-semibold">{tableNumber(v, final)}</div>
        <div className="text-xs text-gray-600">{unitText(v)}</div>
        {v.status === 'corrected' && <div className="text-xs text-blue-700">was {tableNumber(v, v.value)}</div>}
      </td>
      <td className="py-3 px-4 text-xs text-gray-700">{v.period_start ? `${v.period_start} → ` : 'as of '}{v.period_end}</td>
      <td className="py-3 px-4 text-xs text-gray-700 max-w-[14rem]">{v.row_label || '—'}{v.is_derived && <span className="ml-1 text-amber-800">(derived)</span>}</td>
      <td className="py-3 px-4 text-right tabular-nums font-semibold">{v.confidence.toFixed(2)}</td>
      <td className="py-3 px-4">
        <ul className="space-y-1">
          {v.validation.map((c) => (
            <li key={c.check} className="text-xs flex items-start gap-1.5" title={c.detail}>
              <span className={`px-1.5 rounded font-semibold shrink-0 ${CHECK_STYLE[c.status].cls}`}>{CHECK_STYLE[c.status].label}</span>
              <span className="text-gray-700">{c.check}</span>
            </li>
          ))}
        </ul>
      </td>
      <td className="py-3 px-4">
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap ${status.cls}`}>{status.label}</span>
        {v.escalation_reason && v.status !== 'auto_approved' && <div className="text-xs text-gray-600 mt-1 max-w-[16rem]">{v.escalation_reason}</div>}
      </td>
    </tr>
  );
}
