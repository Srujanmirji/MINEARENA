import { useEffect, useState } from 'react';
import { Play, RefreshCw, ArrowRight } from 'lucide-react';
import { api, type Config, type RunStatus } from '../../api';
import { TICKERS, errorText } from './format';
import { Empty, ErrorBox, Loading, StatCard } from './states';
import { useApi } from './useApi';
import { CompanySearch } from './CompanySearch';

const RUN_STYLE: Record<RunStatus, { label: string; cls: string }> = {
  running: { label: 'Running', cls: 'bg-blue-100 text-blue-800 border border-blue-200' },
  paused: { label: 'Paused for review', cls: 'bg-amber-100 text-amber-900 border border-amber-300 animate-pulse' },
  done: { label: 'Done', cls: 'bg-emerald-100 text-emerald-800 border border-emerald-300' },
  error: { label: 'Error', cls: 'bg-red-100 text-red-800 border border-red-200' },
};

interface Props {
  onReview: () => void;
  onConfigChange: (c: Config) => void;
  config: Config | null;
}

export function RunsTab({ onReview, onConfigChange, config }: Props) {
  const runs = useApi(api.listRuns);
  const [starting, setStarting] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const anyRunning = (runs.data ?? []).some((r) => r.status === 'running');
  const { reload } = runs;

  // Poll only while a run is in progress: every request opens SQLite connections on the API side.
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(reload, 3000);
    return () => clearInterval(id);
  }, [anyRunning, reload]);

  async function start(ticker: string, force = false) {
    setStarting(ticker);
    setStartError(null);
    try {
      await api.startRun(ticker, force);
      runs.reload();
    } catch (e: unknown) {
      setStartError(`${ticker}: ${errorText(e)}`);
    } finally {
      setStarting(null);
    }
  }

  const list = runs.data ?? [];
  const sum = (k: 'n_auto' | 'n_pending' | 'n_reviewed') => list.reduce((s, r) => s + r[k], 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight">
            Filing runs
          </h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl leading-relaxed">
            One run per company: fetch the latest 10-K, extract, score, validate, then auto-approve or pause for human verification.
          </p>
        </div>

        <button
          type="button"
          onClick={() => runs.reload()}
          disabled={runs.isLoading}
          aria-label="Refresh runs"
          className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white hover:bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-700 shadow-2xs hover:shadow-xs hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${runs.isLoading ? 'animate-spin text-amber-500' : 'text-gray-500'}`} />
          <span>Refresh</span>
        </button>
      </header>

      {/* Start a Run Interactive Control Panel */}
      <section
        aria-labelledby="start-heading"
        className="bg-white/90 backdrop-blur-md rounded-2xl border border-gray-200/80 p-6 md:p-7 shadow-xs hover:shadow-md transition-shadow duration-300 relative overflow-hidden"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
            </svg>
            <h2 id="start-heading" className="text-sm font-bold tracking-tight text-gray-900 uppercase">
              Start an automated run
            </h2>
          </div>
          <span className="text-xs text-gray-500 font-medium hidden sm:inline">
            SEC EDGAR Form 10-K Ingestion
          </span>
        </div>

        {/* Ticker launch buttons with glowing liquid sheen and micro-hover physics */}
        <div className="flex flex-wrap gap-2.5">
          {TICKERS.map((t) => (
            <button
              key={t}
              type="button"
              disabled={starting !== null}
              onClick={() => start(t)}
              className="relative group inline-flex items-center gap-2.5 min-h-11 px-5 rounded-full bg-gradient-to-b from-zinc-800 to-black text-white text-sm font-semibold border border-white/15 shadow-[0_4px_14px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_25px_rgba(0,0,0,0.35),0_0_20px_rgba(245,158,11,0.25)] hover:border-amber-400/50 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all duration-200 disabled:opacity-50 overflow-hidden cursor-pointer"
            >
              {/* Shimmer sweep effect */}
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />

              <span className="p-1 rounded-full bg-white/10 group-hover:bg-amber-400/20 transition-colors">
                <Play className="w-3 h-3 text-white group-hover:text-amber-400 transition-colors" />
              </span>
              <span className="tracking-wide">{starting === t ? 'Starting…' : t}</span>
            </button>
          ))}
        </div>

        <p className="text-xs text-gray-500 mt-3 leading-relaxed">
          Demo companies (cached for instant offline operation). Running an existing company reopens its state ledger instead of re-downloading.
        </p>

        <CompanySearch disabled={starting !== null} onStart={(t) => start(t)} />
        {startError && (
          <div role="alert" className="mt-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl p-3.5">
            {startError}
          </div>
        )}
      </section>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Runs active" value={String(list.length)} />
        <StatCard label="Auto-approved values" value={String(sum('n_auto'))} tone="text-emerald-600" />
        <StatCard label="Waiting for review" value={String(sum('n_pending'))} tone="text-amber-600" />
        <StatCard label="Reviewed by human" value={String(sum('n_reviewed'))} tone="text-blue-600" />
      </div>

      {runs.isLoading && !runs.data && <Loading label="Loading runs…" />}
      {runs.error && !runs.data && <ErrorBox message={runs.error} onRetry={runs.reload} />}
      {runs.data && list.length === 0 && <Empty title="No runs yet">Start one of the five companies above to begin verification.</Empty>}

      {/* Runs Table */}
      {list.length > 0 && (
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[42rem]">
              <thead className="bg-gray-50/80 text-xs text-gray-500 font-bold uppercase tracking-wider border-b border-gray-200">
                <tr>
                  <th scope="col" className="py-3.5 px-5">Run ID</th>
                  <th scope="col" className="py-3.5 px-5">Company</th>
                  <th scope="col" className="py-3.5 px-5">Values Breakdown</th>
                  <th scope="col" className="py-3.5 px-5">State</th>
                  <th scope="col" className="py-3.5 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.map((r) => (
                  <tr key={r.thread_id} className="hover:bg-blue-50/30 transition-colors duration-150 group">
                    <td className="py-4 px-5 font-mono text-xs text-gray-600">{r.thread_id}</td>
                    <td className="py-4 px-5">
                      <span className="font-bold text-gray-900 text-base">{r.ticker}</span>
                    </td>
                    <td className="py-4 px-5 text-gray-700 tabular-nums text-xs sm:text-sm">
                      <span className="font-semibold text-gray-900">{r.n_values}</span> total ·{' '}
                      <span className="text-emerald-700 font-medium">{r.n_auto} auto</span> ·{' '}
                      <span className="text-blue-700 font-medium">{r.n_reviewed} reviewed</span> ·{' '}
                      <span className="text-amber-700 font-medium">{r.n_pending} waiting</span>
                    </td>
                    <td className="py-4 px-5">
                      <span className={`text-xs px-3 py-1 rounded-full font-semibold shadow-2xs ${RUN_STYLE[r.status].cls}`}>
                        {RUN_STYLE[r.status].label}
                      </span>
                      {r.error && <div className="text-xs text-red-700 mt-1 max-w-xs">{r.error}</div>}
                    </td>
                    <td className="py-4 px-5 text-right">
                      {r.status === 'paused' && (
                        <button
                          type="button"
                          onClick={onReview}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-[0_2px_10px_rgba(37,99,235,0.35)] hover:shadow-[0_4px_16px_rgba(37,99,235,0.55)] hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
                        >
                          <span>Review</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {r.status === 'error' && (
                        <button
                          type="button"
                          onClick={() => start(r.ticker, true)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-800 hover:scale-105 active:scale-95 transition-all duration-200 border border-gray-300 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Re-run
                        </button>
                      )}
                      {r.status === 'done' && (
                        <span className="text-xs text-emerald-700 font-semibold px-2 py-1 bg-emerald-50 rounded-full border border-emerald-200">
                          Complete ✓
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Settings / Configuration Panel */}
      <Settings config={config} onSaved={onConfigChange} />
    </div>
  );
}

function Settings({ config, onSaved }: { config: Config | null; onSaved: (c: Config) => void }) {
  const [threshold, setThreshold] = useState<number | null>(null);
  const [yoy, setYoy] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!config) return null;
  const t = threshold ?? config.threshold;
  const y = yoy ?? config.yoy_threshold;

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const c = await api.putConfig({ threshold: t, yoy_threshold: y });
      onSaved(c);
      setMsg('Saved successfully. Applies to all subsequent runs.');
    } catch (e: unknown) {
      setMsg(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="settings-heading"
      className="bg-white/90 backdrop-blur-md rounded-2xl border border-gray-200/80 p-6 md:p-7 shadow-xs hover:shadow-md transition-shadow duration-300"
    >
      <div className="flex items-center justify-between mb-2">
        <h2 id="settings-heading" className="text-base font-bold text-gray-900">
          Verification Thresholds
        </h2>
        <span className="text-xs text-gray-500 font-medium">System Rules</span>
      </div>
      <p className="text-xs text-gray-600 mb-6 leading-relaxed">
        Apply to new runs only. A failed validation invariant check always pauses for human review, regardless of confidence score.
      </p>

      <div className="grid sm:grid-cols-2 gap-6">
        <label className="block bg-gray-50/70 p-4 rounded-xl border border-gray-200/70">
          <span className="flex justify-between font-semibold text-gray-800 text-sm">
            <span>Auto-approve confidence</span>
            <span className="tabular-nums font-mono text-black font-bold">≥ {t.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0.5}
            max={1}
            step={0.01}
            value={t}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full mt-3 accent-black cursor-pointer"
          />
        </label>
        <label className="block bg-gray-50/70 p-4 rounded-xl border border-gray-200/70">
          <span className="flex justify-between font-semibold text-gray-800 text-sm">
            <span>Year-on-year anomaly flag</span>
            <span className="tabular-nums font-mono text-amber-600 font-bold">&gt; {Math.round(y * 100)}%</span>
          </span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={y}
            onChange={(e) => setYoy(Number(e.target.value))}
            className="w-full mt-3 accent-black cursor-pointer"
          />
        </label>
      </div>

      <div className="flex items-center gap-4 mt-6">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="min-h-11 px-7 rounded-full bg-black text-white text-sm font-semibold hover:bg-zinc-800 hover:scale-105 active:scale-95 transition-all duration-200 shadow-md hover:shadow-xl disabled:opacity-50 cursor-pointer"
        >
          {saving ? 'Saving…' : 'Save thresholds'}
        </button>
        {msg && <span role="status" className="text-sm font-semibold text-emerald-700 animate-card-left">{msg}</span>}
      </div>
    </section>
  );
}
