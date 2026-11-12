import { useState } from 'react';
import { api, type PendingItem } from '../../api';
import { errorText } from './format';

/** Shown only when a value failed the year-on-year check: management's own explanation (MD&A), summarised by AI. */
export function ExplainChange({ item }: { item: PendingItem }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const yoyFailed = item.value.validation.some((c) => c.check === 'Year-on-year' && c.status === 'failed');
  if (!yoyFailed) return null;

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      setText((await api.explain(item.thread_id, item.value.id)).explanation);
    } catch (e: unknown) {
      setError(errorText(e));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section aria-labelledby="explain-heading" className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs">
      <h2 id="explain-heading" className="text-base font-bold text-gray-900">Why did it change?</h2>
      <p className="text-xs text-gray-600 mt-0.5">From the filing’s Item 7 (MD&amp;A), summarised by AI. A hint for the reviewer, not evidence.</p>
      {text ? (
        <p aria-live="polite" className="mt-3 text-sm text-gray-800 leading-relaxed">{text}</p>
      ) : (
        <button type="button" onClick={load} disabled={isLoading}
          className="mt-3 min-h-11 px-4 rounded-full border border-gray-300 bg-white text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-black">
          {isLoading ? 'Reading the MD&A…' : 'Explain the change'}
        </button>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>}
    </section>
  );
}
