import { useRef } from 'react';
import { ExternalLink } from 'lucide-react';
import { api, type ExtractedValue } from '../../api';
import { tableNumber } from './format';
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
    // allow-same-origin (no allow-scripts) lets the parent read the DOM; the frame itself still can't run JS.
    frame.current?.contentDocument?.querySelector('tr.hl')?.scrollIntoView({ block: 'center' });
  }

  return (
    <section aria-labelledby="source-heading" className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="source-heading" className="text-base font-bold text-gray-900">Source evidence</h2>
          <p className="text-xs text-gray-600 mt-0.5">
            {src.data ? `${src.data.heading || 'Statement table'}${src.data.scale_text ? ` · ${src.data.scale_text}` : ''}` : value.source_page}
          </p>
        </div>
        {src.data?.source_url && (
          <a href={src.data.source_url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 min-h-11 px-3 text-xs font-semibold text-blue-700 hover:underline shrink-0">
            Open filing on SEC <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
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
    </section>
  );
}
