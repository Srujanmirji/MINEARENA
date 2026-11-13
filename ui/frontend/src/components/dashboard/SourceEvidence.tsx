import { useRef } from 'react';
import { ExternalLink } from 'lucide-react';
import { api, type ExtractedValue } from '../../api';
import { METRIC_LABEL, tableNumber, unitText } from './format';
import { ErrorBox, Loading } from './states';
import { useApi } from './useApi';

/**
 * The statement table from the filed 10-K, with the extracted row highlighted (class "hl" set by the API).
 * Rendered in a sandboxed iframe with NO script permission: the filing HTML can never run code here.
 */
const FRAME_CSS = `
  body { margin: 0; font: 13px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; }
  table { border-collapse: collapse; width: 100%; min-width: 40rem; }
  td:first-child { min-width: 16rem; }
  td, th { padding: 4px 8px; border-bottom: 1px solid #F3F4F6; vertical-align: bottom; }
  tr.hl td, tr.hl th { background: #EFF6FF; font-weight: 700; }
  tr.hl td:first-child { box-shadow: inset 3px 0 0 #2563EB; }
`;

export function SourceEvidence({ threadId, value }: { threadId: string; value: ExtractedValue }) {
  const src = useApi(() => api.source(threadId, value.id));
  const frame = useRef<HTMLIFrameElement>(null);

  function scrollToRow() {
    // Scroll inside the iframe window so the outer page does not jump.
    const doc = frame.current?.contentDocument;
    const win = frame.current?.contentWindow;
    const row = doc?.querySelector('tr.hl') as HTMLElement | null;
    if (row && win && frame.current) {
      win.scrollTo({ top: Math.max(0, row.offsetTop - frame.current.clientHeight / 2 + row.offsetHeight / 2), behavior: 'smooth' });
    }
  }

  return (
    <section aria-labelledby="source-heading" className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="source-heading" className="text-base font-bold text-gray-900">Source evidence</h2>
          <p className="text-xs text-gray-600 mt-0.5">
            {src.data
              ? `10-K Item 8, audited financial statements · ${src.data.heading || 'Statement table'}${src.data.scale_text ? ` · ${src.data.scale_text}` : ''}`
              : value.source_page}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {src.data?.row_found && (
            <button type="button" onClick={scrollToRow}
              className="inline-flex items-center min-h-9 px-2.5 rounded-lg border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              Jump to row ↓
            </button>
          )}
          {src.data?.source_url && (
            <a href={src.data.source_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 min-h-11 px-3 text-xs font-semibold text-blue-700 hover:underline shrink-0">
              Open filing on SEC <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      <div className="mt-4">
        {src.isLoading && !src.data && <Loading label="Loading the filing table…" />}
        {src.error && !src.data && (
          value.is_derived
            ? <p className="text-sm text-gray-700">This value is derived, not read from one row: {value.source_snippet}</p>
            : <ErrorBox message={src.error} onRetry={src.reload} />
        )}
        {src.data && (
          <>
            <iframe
              ref={frame}
              title={`Source table for ${value.ticker} ${value.metric}`}
              sandbox="allow-same-origin"
              srcDoc={`<!doctype html><style>${FRAME_CSS}</style>${src.data.html}`}
              onLoad={scrollToRow}
              className="w-full h-96 border border-gray-200 rounded-lg"
            />
            {!src.data.row_found && (
              <p className="text-xs text-amber-800 mt-2">The extracted row couldn&apos;t be matched in this table; check the snippet below.</p>
            )}
          </>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-600 space-y-1">
        <div><span className="font-semibold text-gray-800">Row read:</span> {value.row_label || '—'} → {tableNumber(value, value.value)}</div>
        {value.source_snippet && <div className="font-mono break-words">{value.source_snippet}</div>}
      </div>

      <RowBarGraph value={value} />
    </section>
  );
}

function RowBarGraph({ value }: { value: ExtractedValue }) {
  const cfg = useApi(api.getConfig);
  const yoyLimit = cfg.data?.yoy_threshold ?? 0.4;
  const yoyLimitPct = Math.round(yoyLimit * 100);
  const cur = value.final_value ?? value.value;
  const prior = value.prior_value;
  if (cur === null || prior === null || prior === 0) return null;

  const curYr = Number(value.period_end?.slice(0, 4)) || 2026;
  const bars: { year: string; val: number; isCurrent?: boolean }[] = [];

  // Include 3rd (FY-2) column if present in history or source_snippet ("Label | cur | prior | older")
  const histEntries = value.history ? Object.entries(value.history).sort(([a], [b]) => a.localeCompare(b)) : [];
  if (histEntries.length >= 3) {
    bars.push({ year: `FY ${histEntries[0][0]}`, val: histEntries[0][1] });
  } else if (value.source_snippet) {
    const nums = value.source_snippet
      .split('|')
      .slice(1)
      .map((s) => {
        const clean = s.trim();
        const neg = clean.startsWith('(') && clean.endsWith(')');
        const n = Number(clean.replace(/[$,()\s]/g, ''));
        return Number.isFinite(n) ? (neg ? -n : n) : NaN;
      })
      .filter((n) => Number.isFinite(n));
    if (nums.length >= 3 && Math.abs(nums[0] - cur) < 1 && Math.abs(nums[1] - prior) < 1) {
      bars.push({ year: `FY ${curYr - 2}`, val: nums[2] });
    }
  }

  bars.push({ year: `FY ${curYr - 1} (Prior)`, val: prior });
  bars.push({ year: `FY ${curYr} (Current)`, val: cur, isCurrent: true });

  const yoyChange = ((cur - prior) / Math.abs(prior)) * 100;
  const yoyCheck = value.validation.find((c) => c.check === 'Year-on-year');
  const isFlagged = yoyCheck ? yoyCheck.status === 'failed' : Math.abs(yoyChange) > yoyLimitPct;
  const gateVal = prior >= 0 ? prior * (1 + yoyLimit) : prior * (1 - yoyLimit);
  const maxVal = Math.max(...bars.map((b) => Math.abs(b.val)), Math.abs(gateVal), 1) * 1.12;
  const gateBottomPct = Math.min(95, Math.max(8, (Math.abs(gateVal) / maxVal) * 100));

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/70 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div>
          <span className="font-bold text-gray-900">
            Extracted Row Bar Graph: {METRIC_LABEL[value.metric]}
          </span>
          <span className="ml-1.5 text-gray-500">({unitText(value)})</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-0.5 rounded-full font-mono font-bold ${
              isFlagged ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            YoY: {yoyChange >= 0 ? `+${yoyChange.toFixed(1)}%` : `${yoyChange.toFixed(1)}%`}
          </span>
          <span className="text-[11px] text-gray-600">
            {isFlagged ? `Exceeds ±${yoyLimitPct}% anomaly gate` : `Within ±${yoyLimitPct}% normal range`}
          </span>
        </div>
      </div>

      {/* Vertical Bar Area with Dashed YoY Threshold Line */}
      <div className="relative h-36 bg-white rounded-lg border border-gray-200 px-6 pt-6 pb-2 flex items-end justify-around gap-6">
        {/* Dashed YoY Threshold Line */}
        <div
          className="absolute left-3 right-3 border-t-2 border-dashed border-amber-500/80 pointer-events-none flex justify-end"
          style={{ bottom: `${gateBottomPct}%` }}
        >
          <span className=" -mt-4 bg-amber-50 border border-amber-300 text-amber-900 font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded">
            +{yoyLimitPct}% YoY gate: {tableNumber(value, Math.round(gateVal))}
          </span>
        </div>

        {bars.map((b) => {
          const hPct = Math.max(8, (Math.abs(b.val) / maxVal) * 100);
          const barColor = b.isCurrent
            ? isFlagged
              ? 'bg-amber-500'
              : 'bg-blue-600'
            : 'bg-gray-300';
          return (
            <div key={b.year} className="relative z-10 flex-1 max-w-[9rem] h-full flex flex-col items-center justify-end">
              <div className="font-mono text-xs font-bold text-gray-900 mb-1 tabular-nums">
                {tableNumber(value, b.val)}
              </div>
              <div
                className={`w-full rounded-t-md ${barColor} transition-all shadow-2xs`}
                style={{ height: `${hPct}%` }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-around gap-6 px-6 text-[11px] font-semibold text-gray-700">
        {bars.map((b) => (
          <div key={b.year} className="flex-1 max-w-[9rem] text-center">
            {b.year}
          </div>
        ))}
      </div>
    </div>
  );
}
