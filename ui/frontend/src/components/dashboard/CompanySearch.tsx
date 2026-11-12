import { useEffect, useState } from 'react';
import { Play, Search } from 'lucide-react';
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
    <div className="mt-5">
      <label htmlFor="company-search" className="block text-sm font-semibold text-gray-900">Audit any US public company</label>
      <div className="relative mt-2 max-w-xl">
        <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          id="company-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Company name or ticker, e.g. Coca-Cola or KO"
          autoComplete="off"
          aria-describedby="company-search-help"
          className="w-full min-h-11 pl-9 pr-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-black"
        />
      </div>
      <p id="company-search-help" className="text-xs text-gray-600 mt-1.5">
        Searches SEC EDGAR’s company list. A new company is fetched live from SEC, so it needs internet; expect more values sent to review than for the five demo companies.
      </p>

      <div aria-live="polite" className="mt-2 max-w-xl">
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        {!error && term && !isSearching && hits.length === 0 && (
          <p className="text-sm text-gray-600">No SEC filer matches “{term}”.</p>
        )}
        {hits.length > 0 && (
          <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white">
            {hits.map((c) => (
              <li key={c.cik} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span className="text-sm min-w-0">
                  <span className="font-semibold text-gray-900">{c.ticker}</span>
                  <span className="text-gray-600"> · {c.name}</span>
                </span>
                <button type="button" disabled={disabled} onClick={() => { onStart(c.ticker); setQ(''); }}
                  aria-label={`Start audit of ${c.ticker}, ${c.name}`}
                  className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-full bg-black text-white text-xs font-semibold shrink-0 hover:bg-gray-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black">
                  <Play className="w-3 h-3" /> Audit
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
