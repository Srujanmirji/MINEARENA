import type { ExtractedValue } from '../../api';
import { tableNumber } from './format';

/** Same weights and cap as core/config.py (C = 0.45 A + 0.30 L + 0.25 P; derived values capped at 0.75). */
const PARTS = [
  { key: 'agreement', name: 'Readers agree', weight: 0.45 },
  { key: 'label', name: 'Row label', weight: 0.30 },
  { key: 'period_unit', name: 'Period / unit', weight: 0.25 },
] as const;
const DERIVED_CAP = 0.75;
const WEAK = 0.8;

type Part = (typeof PARTS)[number]['key'];

function reason(part: Part, v: ExtractedValue, s: number): string {
  const n = (x: number | null) => tableNumber(v, x);
  if (part === 'agreement') {
    const parser = v.extractor === 'parser' ? v.value : v.alt_value;
    const llm = v.extractor === 'llm' ? v.value : v.alt_value;
    if (v.value === null) return 'Neither reader found this row.';
    if (s >= 1) return `The table parser and the LLM both read ${n(v.value)}.`;
    if (s <= 0) return `They disagree: the parser read ${n(parser)}, the LLM read ${n(llm)}.`;
    return `Only the ${v.extractor === 'llm' ? 'LLM' : 'table parser'} found it (${n(v.value)}), so there is no second reading to confirm it.`;
  }
  if (part === 'label') {
    const label = (v.row_label || '').replace(/\s*\(derived\)\s*$/i, '');
    if (!label) return 'No row label was found.';
    if (s >= 1) return `"${label}" is an exact match for a known name of this metric.`;
    if (s >= WEAK) return `"${label}" is a ${Math.round(s * 100)}% text match for a known name (close, not exact).`;
    return `"${label}" is only a ${Math.round(s * 100)}% match: it may be the wrong row, so a human checks.`;
  }
  const scaleOk = v.unit === 'USD/shares' || v.scale > 1;
  const scaleText = v.unit === 'USD/shares' ? 'per-share value' : `scale ×${v.scale.toLocaleString('en-US')} found`;
  if (s >= 1) return `Column is the filing's year (ending ${v.period_end}) and ${scaleText}.`;
  if (s <= 0) return 'Wrong year column and no table scale found.';
  return scaleOk
    ? `Scale found, but the column's period (${v.period_end}) isn't the filing's year end.`
    : `Right year (ending ${v.period_end}), but no "in millions/thousands" note was found.`;
}

/** Explains a confidence score: each part's score, weight, points and the reason behind it. */
export function ConfidenceWhy({ v, threshold }: { v: ExtractedValue; threshold: number }) {
  const rows = PARTS.map((p) => {
    const s = v.signals[p.key] ?? 0;
    return { ...p, s, points: s * p.weight, why: reason(p.key, v, s) };
  });
  const raw = rows.reduce((sum, r) => sum + r.points, 0);
  const capped = v.is_derived && raw > DERIVED_CAP;
  const passes = v.confidence >= threshold;

  return (
    <div className="text-xs" aria-label="Why this confidence score">
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.key} className="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-gray-900">{r.name}</span>
              <span className="tabular-nums text-gray-700">
                <span className={`font-bold ${r.s < WEAK ? 'text-amber-800' : 'text-gray-900'}`}>{r.s.toFixed(2)}</span>
                {' × '}{r.weight.toFixed(2)} = <span className="font-bold text-gray-900">{r.points.toFixed(2)}</span>
              </span>
            </div>
            <p className="text-gray-700 mt-1 leading-snug">{r.why}</p>
          </li>
        ))}
      </ul>

      <div className="mt-2.5 space-y-1 text-gray-800 leading-snug">
        <p className="tabular-nums">
          <span className="font-semibold">Total:</span> {rows.map((r) => r.points.toFixed(2)).join(' + ')} = <span className="font-bold">{raw.toFixed(2)}</span>
        </p>
        {v.value === null && <p><span className="font-semibold">Set to 0.00:</span> no value was extracted.</p>}
        {capped && (
          <p><span className="font-semibold">Capped at {DERIVED_CAP.toFixed(2)}:</span> this value is calculated, not read from the filing, so a human always checks it.</p>
        )}
        <p className={passes ? 'text-emerald-800' : 'text-amber-800'}>
          <span className="font-semibold">Final {v.confidence.toFixed(2)}</span>{' '}
          {passes
            ? `≥ ${threshold.toFixed(2)}: high enough to auto-approve, if every check passes.`
            : `< ${threshold.toFixed(2)}: too low to auto-approve, so it goes to a human.`}
        </p>
      </div>
    </div>
  );
}
