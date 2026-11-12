import { useEffect, useState } from 'react';
import { Play, Search, Loader2 } from 'lucide-react';
import { api, type Company } from '../../api';
import { errorText } from './format';

const DEBOUNCE_MS = 250;

/** "Audit any company": search SEC's ticker list by name or ticker, then start a run for the pick. */
export function CompanySearch({ disabled, onStart }: { disabled: boolean; onStart: (ticker: string) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setHits([]); setError(null); return; }
    let cancelled = false;
    const id = setTimeout(() => {
      setIsSearching(true);
      api.searchCompanies(term)
        .then((h) => { if (!cancelled) { setHits(h); setError(null); } })
        .catch((e: unknown) => { if (!cancelled) setError(errorText(e)); })
        .finally(() => { if (!cancelled) setIsSearching(false); });
    }, DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(id); };
  }, [q]);

  const term = q.trim();
  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      <label htmlFor="company-search" className="block text-sm font-bold text-gray-900">
        Audit any US public company
      </label>
      <div className="relative mt-2 max-w-xl">
        <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          id="company-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Company name or ticker, e.g. Coca-Cola or KO"
          autoComplete="off"
          aria-describedby="company-search-help"
          className="w-full min-h-12 pl-10 pr-10 rounded-xl border border-gray-200/90 bg-gray-50/60 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:border-black/30 focus:ring-4 focus:ring-black/5 transition-all duration-200"
        />
        {isSearching && (
          <Loader2 className="w-4 h-4 text-gray-400 animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
        )}
      </div>
      <p id="company-search-help" className="text-xs text-gray-500 mt-2">
        Searches SEC EDGAR’s company list. Live filings are fetched directly from SEC EDGAR with full invariant verification.
      </p>

      <div aria-live="polite" className="mt-3 max-w-xl">
        {error && <p role="alert" className="text-sm text-red-800 bg-red-50 p-3 rounded-lg border border-red-200">{error}</p>}
        {!error && term && !isSearching && hits.length === 0 && (
          <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg border border-gray-200">No SEC filer matches “{term}”.</p>
        )}
        {hits.length > 0 && (
          <ul className="border border-gray-200/80 rounded-xl divide-y divide-gray-100 bg-white shadow-lg overflow-hidden animate-card-left">
            {hits.map((c) => (
              <li key={c.cik} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-gray-50/80 transition-colors">
                <span className="text-sm min-w-0">
                  <span className="font-bold text-gray-900">{c.ticker}</span>
                  <span className="text-gray-600"> · {c.name}</span>
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => { onStart(c.ticker); setQ(''); }}
                  aria-label={`Start audit of ${c.ticker}, ${c.name}`}
                  className="inline-flex items-center gap-1.5 min-h-9 px-3.5 rounded-full bg-black text-white text-xs font-semibold shrink-0 hover:bg-zinc-800 hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  <Play className="w-3 h-3 text-amber-400" />
                  <span>Audit</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
