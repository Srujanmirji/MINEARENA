import { useEffect, useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { api, type Config, type RunStatus } from '../../api';
import { TICKERS, errorText } from './format';
import { Empty, ErrorBox, Loading, StatCard } from './states';
import { useApi } from './useApi';
import { CompanySearch } from './CompanySearch';

const RUN_STYLE: Record<RunStatus, { label: string; cls: string }> = {
  running: { label: 'Running', cls: 'bg-blue-100 text-blue-800' },
  paused: { label: 'Paused for review', cls: 'bg-amber-100 text-amber-900' },
  done: { label: 'Done', cls: 'bg-emerald-100 text-emerald-800' },
  error: { label: 'Error', cls: 'bg-red-100 text-red-800' },
};

interface Props { onReview: () => void; onConfigChange: (c: Config) => void; config: Config | null }

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
      <header>
        <h1 className="text-3xl font-bold text-gray-900">Filing runs</h1>
        <p className="text-sm text-gray-600 mt-1">One run per company: fetch the latest 10-K, extract, score, validate, then auto-approve or pause for a human.</p>
      </header>

      <section aria-labelledby="start-heading" className="bg-white rounded-2xl border border-gray-200 p-5">
        <h2 id="start-heading" className="text-sm font-bold text-gray-900 mb-3">Start a run</h2>
        <div className="flex flex-wrap gap-2">
          {TICKERS.map((t) => (
            <button key={t} type="button" disabled={starting !== null} onClick={() => start(t)}
              className="inline-flex items-center gap-2 min-h-11 px-4 rounded-full bg-black text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black">
              <Play className="w-3.5 h-3.5" /> {starting === t ? 'Starting…' : t}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-2">Demo companies (cached, work offline). A company that already has a run reopens it instead of starting over.</p>
        <CompanySearch disabled={starting !== null} onStart={(t) => start(t)} />
        {startError && <div role="alert" className="mt-3 text-sm text-red-800">{startError}</div>}
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Runs" value={String(list.length)} />
        <StatCard label="Auto-approved values" value={String(sum('n_auto'))} tone="text-emerald-700" />
        <StatCard label="Waiting for review" value={String(sum('n_pending'))} tone="text-amber-700" />
        <StatCard label="Reviewed by a human" value={String(sum('n_reviewed'))} />
      </div>

      {runs.isLoading && !runs.data && <Loading label="Loading runs…" />}
      {runs.error && !runs.data && <ErrorBox message={runs.error} onRetry={runs.reload} />}
      {runs.data && list.length === 0 && <Empty title="No runs yet">Start one of the five companies above.</Empty>}
      {list.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[40rem]">
            <thead className="bg-gray-50 text-xs text-gray-600 font-semibold border-b border-gray-200">
              <tr>
                <th scope="col" className="py-3 px-4">Run</th>
                <th scope="col" className="py-3 px-4">Company</th>
                <th scope="col" className="py-3 px-4">Values</th>
                <th scope="col" className="py-3 px-4">State</th>
                <th scope="col" className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map((r) => (
                <tr key={r.thread_id}>
                  <td className="py-3 px-4 font-mono text-xs">{r.thread_id}</td>
                  <td className="py-3 px-4 font-semibold text-gray-900">{r.ticker}</td>
                  <td className="py-3 px-4 text-gray-700 tabular-nums">{r.n_values} · {r.n_auto} auto · {r.n_reviewed} reviewed · {r.n_pending} waiting</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${RUN_STYLE[r.status].cls}`}>{RUN_STYLE[r.status].label}</span>
                    {r.error && <div className="text-xs text-red-700 mt-1 max-w-xs">{r.error}</div>}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {r.status === 'paused' && (
                      <button type="button" onClick={onReview} className="min-h-11 px-3 text-blue-700 font-semibold text-xs hover:underline">Review →</button>
                    )}
                    {r.status === 'error' && (
                      <button type="button" onClick={() => start(r.ticker, true)} className="inline-flex items-center gap-1 min-h-11 px-3 text-xs font-semibold text-gray-800 hover:underline">
                        <RefreshCw className="w-3.5 h-3.5" /> Re-run
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
      setMsg('Saved. Applies to new runs.');
    } catch (e: unknown) {
      setMsg(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="settings-heading" className="bg-white rounded-2xl border border-gray-200 p-5">
      <h2 id="settings-heading" className="text-sm font-bold text-gray-900">Thresholds</h2>
      <p className="text-xs text-gray-600 mt-0.5 mb-4">Apply to new runs only. A failed validation check always goes to a human, whatever the threshold.</p>
      <div className="grid sm:grid-cols-2 gap-5">
        <label className="block text-sm">
          <span className="flex justify-between font-semibold text-gray-800"><span>Auto-approve at confidence ≥</span><span className="tabular-nums">{t.toFixed(2)}</span></span>
          <input type="range" min={0.5} max={1} step={0.01} value={t} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full mt-2 accent-black" />
        </label>
        <label className="block text-sm">
          <span className="flex justify-between font-semibold text-gray-800"><span>Flag year-on-year change above</span><span className="tabular-nums">{Math.round(y * 100)}%</span></span>
          <input type="range" min={0.1} max={1} step={0.05} value={y} onChange={(e) => setYoy(Number(e.target.value))} className="w-full mt-2 accent-black" />
        </label>
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button type="button" disabled={saving} onClick={save}
          className="min-h-11 px-5 rounded-full bg-black text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black">
          {saving ? 'Saving…' : 'Save thresholds'}
        </button>
        {msg && <span role="status" className="text-sm text-gray-700">{msg}</span>}
      </div>
    </section>
  );
}
