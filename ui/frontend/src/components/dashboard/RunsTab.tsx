import { useEffect, useState } from 'react';
import { Play, RefreshCw, ArrowRight } from 'lucide-react';
import { api, type Config, type McpCallResult, type RunStatus } from '../../api';
import { TICKERS, METRIC_LABEL, errorText } from './format';
import { Empty, ErrorBox, Loading, StatCard } from './states';
import { useApi } from './useApi';
import { CompanySearch } from './CompanySearch';

const RUN_STYLE: Record<RunStatus, { label: string; cls: string }> = {
  running: { label: 'Running', cls: 'bg-blue-100 text-blue-800 border border-blue-200' },
  paused: { label: 'Paused for review', cls: 'bg-amber-100 text-amber-900 border border-amber-300 animate-pulse' },
  done: { label: 'Done', cls: 'bg-emerald-100 text-emerald-800 border border-emerald-300' },
  error: { label: 'Error', cls: 'bg-red-100 text-red-800 border border-red-200' },
};

const PIPELINE: [string, string][] = [
  ['fetch_filing', 'Fetch 10-K'],
  ['locate_statements', 'Locate'],
  ['extract', 'Extract'],
  ['score_confidence', 'Score'],
  ['validate', 'Validate'],
  ['route', 'Route'],
  ['auto_approve', 'Auto-approve'],
  ['human_review', 'Human review'],
  ['verify_vs_xbrl', 'Verify XBRL'],
  ['build_report', 'Report'],
];

interface Props {
  onReview: () => void;
  onConfigChange: (c: Config) => void;
  config: Config | null;
}

export function RunsTab({ onReview, onConfigChange, config }: Props) {
  const runs = useApi(api.listRuns);
  const health = useApi(api.health);
  const [starting, setStarting] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [startNotice, setStartNotice] = useState<{ threadId: string; ticker: string; status: RunStatus; created: boolean } | null>(null);
  const anyRunning = (runs.data ?? []).some((r) => r.status === 'running');
  const shouldPoll = anyRunning || Boolean(runs.error);
  const { reload } = runs;
  const { reload: reloadHealth } = health;

  // Poll while a run is active OR when recovering from a backend restart (auto-clears the unreachable banner).
  useEffect(() => {
    if (!shouldPoll) return;
    const id = setInterval(() => { reload(); reloadHealth(); }, 3000);
    return () => clearInterval(id);
  }, [shouldPoll, reload, reloadHealth]);

  async function start(ticker: string, force = false, year?: number) {
    setStarting(ticker);
    setStartError(null);
    setStartNotice(null);
    try {
      const res = await api.startRun(ticker, force, year);
      setStartNotice({ threadId: res.thread_id, ticker: ticker.toUpperCase(), status: res.status, created: res.created });
      runs.reload();
      setTimeout(() => {
        document.getElementById(`run-row-${res.thread_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 120);
    } catch (e: unknown) {
      setStartError(`${ticker}: ${errorText(e)}`);
    } finally {
      setStarting(null);
    }
  }

  const list = runs.data ?? [];
  const sum = (k: 'n_auto' | 'n_pending' | 'n_reviewed') => list.reduce((s, r) => s + r[k], 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <header className="animate-dashboard-item flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight">
            Filing runs
          </h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl leading-relaxed">
            One run per company: fetch the latest 10-K, extract, score, validate, then auto-approve or pause for human verification.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-gray-200 bg-white text-xs font-medium text-gray-700 shadow-2xs">
            <span className={`w-2 h-2 rounded-full ${health.data?.ok && !runs.error ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
            {health.data?.ok && !runs.error
              ? `API online · SQLite · LLM: ${health.data.llm_provider}`
              : 'Reconnecting to backend (port 8000)…'}
          </div>
          <button
            type="button"
            onClick={() => { runs.reload(); health.reload(); }}
            disabled={runs.isLoading}
            aria-label="Refresh runs"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white hover:bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-700 shadow-2xs hover:shadow-xs hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${runs.isLoading ? 'animate-spin text-amber-500' : 'text-gray-500'}`} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* Start a Run Interactive Control Panel */}
      <section
        aria-labelledby="start-heading"
        className="animate-dashboard-item delay-75 bg-white/90 backdrop-blur-md rounded-2xl border border-gray-200/80 p-6 md:p-7 shadow-xs hover:shadow-md transition-shadow duration-300 relative overflow-hidden"
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

        {/* Ticker launch buttons with live run status badges */}
        <div className="flex flex-wrap gap-2.5">
          {TICKERS.map((t) => {
            const run = [...list].reverse().find((r) => r.ticker === t);
            const isBusy = starting === t || run?.status === 'running';
            return (
              <button
                key={t}
                type="button"
                disabled={starting !== null}
                onClick={() => start(t)}
                className={`relative group inline-flex items-center gap-2.5 min-h-11 px-4 rounded-full text-sm font-semibold border shadow-[0_4px_14px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_25px_rgba(0,0,0,0.35),0_0_20px_rgba(245,158,11,0.25)] hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all duration-200 disabled:opacity-50 overflow-hidden cursor-pointer ${
                  run?.status === 'paused'
                    ? 'bg-gradient-to-b from-amber-900 to-amber-950 text-white border-amber-400/60'
                    : run?.status === 'done'
                      ? 'bg-gradient-to-b from-emerald-900 to-zinc-950 text-white border-emerald-400/50'
                      : 'bg-gradient-to-b from-zinc-800 to-black text-white border-white/15 hover:border-amber-400/50'
                }`}
              >
                {/* Shimmer sweep effect */}
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />

                <span className="p-1 rounded-full bg-white/10 group-hover:bg-amber-400/20 transition-colors">
                  {isBusy ? (
                    <RefreshCw className="w-3 h-3 text-amber-300 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3 text-white group-hover:text-amber-400 transition-colors" />
                  )}
                </span>
                <span className="tracking-wide">{starting === t ? 'Starting…' : t}</span>
                {run?.status === 'paused' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-amber-950">
                    ⏸ {run.n_pending} waiting
                  </span>
                )}
                {run?.status === 'done' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-400/40">
                    ✓ Done
                  </span>
                )}
                {run?.status === 'running' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-400/20 text-blue-200 border border-blue-400/40">
                    Running
                  </span>
                )}
                {run?.status === 'error' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-400/20 text-red-200 border border-red-400/40">
                    Error
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-gray-500 mt-3 leading-relaxed">
          Demo companies (cached for instant offline operation). Running an existing company reopens its state ledger instead of re-downloading.
        </p>

        <CompanySearch disabled={starting !== null} onStart={(t, y) => start(t, false, y)} />
        {startNotice && (() => {
          const matched = list.find((r) => r.thread_id === startNotice.threadId);
          const status = matched?.status ?? startNotice.status;
          const counts = matched
            ? ` — ${matched.n_values} metrics extracted (${matched.n_auto} auto-approved, ${matched.n_pending} waiting for review)`
            : '';
          return (
            <div
              role="status"
              className={`mt-4 text-xs sm:text-sm rounded-xl p-3.5 border flex flex-wrap items-center justify-between gap-3 ${
                startNotice.created
                  ? status === 'paused'
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-blue-50/80 border-blue-200 text-blue-950'
              }`}
            >
              <div>
                {startNotice.created ? (
                  <span>
                    <strong>✓ Added {startNotice.threadId}</strong>
                    {status === 'paused'
                      ? `${counts || ' — paused at Human Review'}.`
                      : status === 'done'
                        ? `${counts || ' — all metrics auto-approved'}.`
                        : ' — fetching 10-K and extracting financial statements…'}
                  </span>
                ) : (
                  <span>
                    <strong>{startNotice.threadId} is already in your Runs table below</strong>
                    {counts} (state: <strong>{RUN_STYLE[status].label}</strong>).
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {status === 'paused' && (
                  <button
                    type="button"
                    onClick={onReview}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-900 hover:bg-amber-950 text-white text-xs font-semibold cursor-pointer"
                  >
                    <span>Jump to Review</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setStartNotice(null)}
                  className="text-xs font-semibold opacity-70 hover:opacity-100 px-2 py-1 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          );
        })()}
        {startError && (
          <div role="alert" className="mt-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl p-3.5">
            {startError}
          </div>
        )}
      </section>

      {/* 4 Stat Cards */}
      <div className="animate-dashboard-item delay-150 grid grid-cols-2 lg:grid-cols-4 gap-4">
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
        <div className="animate-dashboard-item delay-225 bg-white/90 backdrop-blur-sm rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[48rem]">
              <thead className="bg-gray-50/80 text-xs text-gray-500 font-bold uppercase tracking-wider border-b border-gray-200">
                <tr>
                  <th scope="col" className="py-3.5 px-5">Run &amp; 10-K filing</th>
                  <th scope="col" className="py-3.5 px-5">Values Breakdown</th>
                  <th scope="col" className="py-3.5 px-5">Checkpoint Pipeline</th>
                  <th scope="col" className="py-3.5 px-5">State</th>
                  <th scope="col" className="py-3.5 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 align-top">
                {list.map((r) => {
                  const doneSet = new Set(r.steps_done ?? []);
                  const nextSet = new Set(r.next ?? []);
                  const isHighlighted = startNotice?.threadId === r.thread_id;
                  return (
                    <tr
                      key={r.thread_id}
                      id={`run-row-${r.thread_id}`}
                      className={`transition-colors duration-300 group ${
                        isHighlighted ? 'bg-amber-50/70 hover:bg-amber-50' : 'hover:bg-blue-50/30'
                      }`}
                    >
                      <td className="py-4 px-5">
                        <div className="font-bold text-gray-900 text-base">
                          {r.ticker} <span className="font-mono text-xs font-normal text-gray-500">({r.thread_id})</span>
                        </div>
                        {r.accession && (
                          <div className="text-xs text-gray-500 font-mono mt-0.5">
                            10-K {r.accession}{r.period_end ? ` · FY end ${r.period_end}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-5 text-gray-700 tabular-nums text-xs sm:text-sm whitespace-nowrap">
                        <span className="font-semibold text-gray-900">{r.n_values}</span> total ·{' '}
                        <span className="text-emerald-700 font-medium">{r.n_auto} auto</span> ·{' '}
                        <span className="text-blue-700 font-medium">{r.n_reviewed} reviewed</span> ·{' '}
                        <span className="text-amber-700 font-medium">{r.n_pending} waiting</span>
                      </td>
                      <td className="py-4 px-5">
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {PIPELINE.map(([node, label]) => {
                            const isNext = nextSet.has(node);
                            const isDone = r.status === 'done' ? node !== 'human_review' || doneSet.has(node) : doneSet.has(node) && !isNext;
                            const cls = isNext
                              ? (r.status === 'paused' ? 'bg-amber-100 text-amber-900 border-amber-300 font-semibold' : 'bg-blue-100 text-blue-800 border-blue-300 font-semibold')
                              : isDone
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-gray-50 text-gray-400 border-gray-200';
                            return (
                              <span key={node} className={`text-[11px] px-1.5 py-0.5 rounded border ${cls}`}>
                                {isNext && r.status === 'paused' ? `⏸ ${label}` : isDone ? `✓ ${label}` : label}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-4 px-5 whitespace-nowrap">
                        <span className={`text-xs px-3 py-1 rounded-full font-semibold shadow-2xs ${RUN_STYLE[r.status].cls}`}>
                          {RUN_STYLE[r.status].label}
                        </span>
                        {r.error && <div className="text-xs text-red-700 mt-1 max-w-xs whitespace-normal">{r.error}</div>}
                      </td>
                      <td className="py-4 px-5 text-right whitespace-nowrap">
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
                        {(r.status === 'done' || r.status === 'error') && (
                          <button
                            type="button"
                            disabled={starting !== null}
                            onClick={() => start(r.ticker, true)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-800 hover:scale-105 active:scale-95 transition-all duration-200 border border-gray-300 disabled:opacity-50 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" /> Re-run
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Settings / Configuration Panel */}
      <Settings config={config} onSaved={onConfigChange} />
      <McpPanel />
    </div>
  );
}

function Settings({ config, onSaved }: { config: Config | null; onSaved: (c: Config) => void }) {
  const [threshold, setThreshold] = useState<number | null>(null);
  const [yoy, setYoy] = useState<number | null>(null);
  const [eqTol, setEqTol] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const values = useApi(() => api.values());
  const audit = useApi(() => api.audit(200));

  if (!config) return null;
  const savedEq = config.equation_tolerance ?? 0.005;
  const t = threshold ?? config.threshold;
  const y = yoy ?? config.yoy_threshold;
  const eq = eqTol ?? savedEq;
  const isDirty = Math.abs(t - config.threshold) > 1e-6 || Math.abs(y - config.yoy_threshold) > 1e-6 || Math.abs(eq - savedEq) > 1e-6;

  // Evaluate routing for any (threshold, yoy, eqTol) triple across extracted values.
  const allVals = values.data ?? [];
  function evalRouting(th: number, yoyLim: number, eqLim: number) {
    let auto = 0;
    let escalated = 0;
    let byConf = 0;
    let byYoy = 0;
    let byEq = 0;
    let bySafety = 0;
    const autoIds = new Set<string>();

    for (const v of allVals) {
      const yoyFail = v.value !== null && v.prior_value
        ? Math.abs((v.value - v.prior_value) / Math.abs(v.prior_value)) > yoyLim
        : false;
      const eqOrOtherFail = (v.validation ?? []).some((c) => {
        if (c.check === 'Year-on-year') return false;
        if (c.check === 'A = L + E' || c.check === 'Segment sum') {
          const m = c.detail.match(/([\d.]+)%/);
          return m ? Number(m[1]) / 100 > eqLim : c.status === 'failed';
        }
        return c.status === 'failed';
      });
      const safetyFail = v.value === null || v.is_derived || (v.signals.label ?? 0) < 0.8;
      const confFail = v.confidence < th;

      if (!yoyFail && !eqOrOtherFail && !safetyFail && !confFail) {
        auto += 1;
        autoIds.add(v.id);
      } else {
        escalated += 1;
        if (eqOrOtherFail) byEq += 1;
        else if (yoyFail) byYoy += 1;
        else if (safetyFail) bySafety += 1;
        else if (confFail) byConf += 1;
      }
    }
    return { auto, escalated, byConf, byYoy, byEq, bySafety, autoIds };
  }

  const sim = evalRouting(t, y, eq);
  const baseline = evalRouting(config.threshold, config.yoy_threshold, savedEq);
  const autoDelta = sim.auto - baseline.auto;
  const flipped = allVals.filter((v) => sim.autoIds.has(v.id) !== baseline.autoIds.has(v.id));
  const autoPct = allVals.length ? Math.round((sim.auto / allVals.length) * 100) : 0;

  // Adaptive escalation threshold from human reviewer feedback (PS-01 Bonus Hint #3 / PRD B-1).
  const humanRows = (audit.data ?? []).filter((r) => r.decision !== 'auto_approved');
  const approvedAsIs = humanRows.filter((r) => r.decision === 'approved').length;
  const changedOrRejected = humanRows.filter((r) => r.decision === 'corrected' || r.decision === 'rejected').length;
  const approvalRate = humanRows.length ? approvedAsIs / humanRows.length : null;
  const suggestedThreshold = humanRows.length >= 3 && approvalRate !== null
    ? (approvalRate >= 0.8 && changedOrRejected === 0
      ? Math.max(0.75, Math.round((config.threshold - 0.02) * 100) / 100)
      : changedOrRejected > 0 && approvalRate < 0.5
        ? Math.min(0.95, Math.round((config.threshold + 0.02) * 100) / 100)
        : config.threshold)
    : null;

  function applyPreset(nextT: number, nextY: number, nextEq: number) {
    setThreshold(nextT);
    setYoy(nextY);
    setEqTol(nextEq);
    setMsg(null);
  }

  async function save(next?: { threshold: number; yoy_threshold: number; equation_tolerance: number }) {
    setSaving(true);
    setMsg(null);
    const payload = next ?? { threshold: t, yoy_threshold: y, equation_tolerance: eq };
    try {
      const c = await api.putConfig(payload);
      setThreshold(c.threshold);
      setYoy(c.yoy_threshold);
      setEqTol(c.equation_tolerance ?? payload.equation_tolerance);
      onSaved(c);
      setMsg('Saved successfully. Applies to all subsequent runs.');
    } catch (e: unknown) {
      setMsg(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  const presets: { label: string; desc: string; detail: string; t: number; y: number; eq: number }[] = [
    { label: 'Strict Audit', desc: '0.92 · 25% · 0.2%', detail: 'Forensic: flags minor YoY shifts & 0.2% gaps', t: 0.92, y: 0.25, eq: 0.002 },
    { label: 'Balanced (Default)', desc: '0.85 · 40% · 0.5%', detail: 'Standard 10-K: flags NVDA YoY & TSLA 0.52% NCI', t: 0.85, y: 0.4, eq: 0.005 },
    { label: 'Fast Pass / NCI-Tolerant', desc: '0.80 · 60% · 0.6%', detail: 'High-speed: allows 60% growth & 0.6% NCI (TSLA passes)', t: 0.8, y: 0.6, eq: 0.006 },
  ];

  return (
    <section
      aria-labelledby="settings-heading"
      className="animate-dashboard-item delay-300 bg-white/90 backdrop-blur-md rounded-2xl border border-gray-200/80 p-6 md:p-7 shadow-xs hover:shadow-md transition-shadow duration-300 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="settings-heading" className="text-base font-bold text-gray-900">
            Verification Thresholds &amp; Adaptive Calibration
          </h2>
          <p className="text-xs text-gray-600 mt-0.5">
            Configure when extracted 10-K metrics auto-approve vs. pause for human review.
          </p>
        </div>

        {/* 1-Click Audit Mode Presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((p) => {
            const active = Math.abs(t - p.t) < 1e-6 && Math.abs(y - p.y) < 1e-6 && Math.abs(eq - p.eq) < 1e-6;
            return (
              <button
                key={p.label}
                type="button"
                title={p.detail}
                onClick={() => applyPreset(p.t, p.y, p.eq)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                  active
                    ? 'bg-black text-white border-black shadow-2xs'
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                }`}
              >
                {p.label} <span className={`font-mono text-[11px] ${active ? 'text-gray-300' : 'text-gray-500'}`}>({p.desc})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Short 1-Line Preset Comparison */}
      <div className="grid sm:grid-cols-3 gap-2 text-[11px]">
        {presets.map((p) => {
          const active = Math.abs(t - p.t) < 1e-6 && Math.abs(y - p.y) < 1e-6 && Math.abs(eq - p.eq) < 1e-6;
          return (
            <div
              key={p.label}
              onClick={() => applyPreset(p.t, p.y, p.eq)}
              className={`rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                active ? 'bg-gray-900 text-white border-gray-900' : 'bg-gray-50/70 text-gray-600 border-gray-200/80 hover:bg-gray-100'
              }`}
            >
              <strong className={active ? 'text-white' : 'text-gray-900'}>{p.label.split(' ')[0]}:</strong> {p.detail}
            </div>
          );
        })}
      </div>

      {/* Compact 3-Signal Formula + Safety Gates */}
      <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3.5 space-y-2.5 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-bold text-gray-900">
            Formula:{' '}
            <code className="font-mono bg-white px-2 py-0.5 rounded border border-gray-200">
              C = 0.45·Agreement + 0.30·Label + 0.25·Period/Unit
            </code>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="font-semibold text-gray-600">Hard overrides:</span>
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-950 font-medium">Derived ≤ 0.75</span>
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-950 font-medium">Label &lt; 0.80</span>
            <span className="px-2 py-0.5 rounded bg-red-100 text-red-900 font-medium">Any failed check → Review</span>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-2 text-[11px]">
          <div className="bg-white rounded-lg border border-gray-200/80 px-3 py-2">
            <div className="flex justify-between font-bold text-gray-900">
              <span>1. Agreement (A)</span>
              <span className="font-mono text-blue-700">45%</span>
            </div>
            <p className="text-gray-600 mt-0.5">Parser vs. LLM match (<code className="font-mono">1.0</code> agree · <code className="font-mono">0.5</code> single · <code className="font-mono">0.0</code> diff)</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200/80 px-3 py-2">
            <div className="flex justify-between font-bold text-gray-900">
              <span>2. Label Match (L)</span>
              <span className="font-mono text-indigo-700">30%</span>
            </div>
            <p className="text-gray-600 mt-0.5">RapidFuzz GAAP synonym score (must be <code className="font-mono">≥ 0.80</code>)</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200/80 px-3 py-2">
            <div className="flex justify-between font-bold text-gray-900">
              <span>3. Period &amp; Unit (P)</span>
              <span className="font-mono text-emerald-700">25%</span>
            </div>
            <p className="text-gray-600 mt-0.5"><code className="font-mono">(period_ok + scale_ok) / 2</code> — FY end &amp; unit scale</p>
          </div>
        </div>
      </div>

      {/* 3 Configurable Sliders */}
      <div className="grid sm:grid-cols-3 gap-4">
        <label className="block bg-gray-50/70 p-3.5 rounded-xl border border-gray-200/70">
          <span className="flex justify-between font-semibold text-gray-800 text-sm">
            <span>Auto-approve confidence</span>
            <span className="tabular-nums font-mono text-black font-bold">≥ {t.toFixed(2)}</span>
          </span>
          <span className="block text-[11px] text-gray-500 mt-0.5">Min score C to skip human review</span>
          <input
            type="range"
            min={0.5}
            max={0.99}
            step={0.01}
            value={t}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full mt-2 accent-black cursor-pointer"
          />
          <span className="flex justify-between text-[11px] text-gray-500 mt-1">
            <span>← More auto</span>
            <span>More review →</span>
          </span>
        </label>

        <label className="block bg-gray-50/70 p-3.5 rounded-xl border border-gray-200/70">
          <span className="flex justify-between font-semibold text-gray-800 text-sm">
            <span>Year-on-year anomaly flag</span>
            <span className="tabular-nums font-mono text-amber-600 font-bold">&gt; {Math.round(y * 100)}%</span>
          </span>
          <span className="block text-[11px] text-gray-500 mt-0.5">Flags big FY-over-FY jumps/drops</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={y}
            onChange={(e) => setYoy(Number(e.target.value))}
            className="w-full mt-2 accent-black cursor-pointer"
          />
          <span className="flex justify-between text-[11px] text-gray-500 mt-1">
            <span>← Stricter</span>
            <span>Allow growth →</span>
          </span>
        </label>

        <label className="block bg-gray-50/70 p-3.5 rounded-xl border border-gray-200/70">
          <span className="flex justify-between font-semibold text-gray-800 text-sm">
            <span>A = L + E &amp; segment tolerance</span>
            <span className="tabular-nums font-mono text-black font-bold">{(eq * 100).toFixed(1)}%</span>
          </span>
          <span className="block text-[11px] text-gray-500 mt-0.5">Max Balance Sheet / Segment gap</span>
          <input
            type="range"
            min={0.001}
            max={0.02}
            step={0.001}
            value={eq}
            onChange={(e) => setEqTol(Number(e.target.value))}
            className="w-full mt-2 accent-black cursor-pointer"
          />
          <span className="flex justify-between text-[11px] text-gray-500 mt-1">
            <span>← Strict (0.1%)</span>
            <span>TSLA NCI = 0.52% →</span>
          </span>
        </label>
      </div>

      {/* #2: Visual What-If Simulation Split Bar & Escalation Breakdown */}
      {allVals.length > 0 && (
        <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-bold text-gray-900">
              Live What-If Simulation across {allVals.length} extracted values
              {autoDelta !== 0 && (
                <span className={`ml-2 px-2 py-0.5 rounded-full font-semibold ${autoDelta > 0 ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>
                  {autoDelta > 0 ? `+${autoDelta} more auto-approved vs saved` : `${Math.abs(autoDelta)} more sent to human vs saved`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 font-semibold tabular-nums">
              <span className="text-emerald-800">✓ {sim.auto} Auto-approved ({autoPct}%)</span>
              <span className="text-amber-900">⏸ {sim.escalated} Escalated ({100 - autoPct}%)</span>
            </div>
          </div>

          {/* Visual Stacked Progress Bar */}
          <div className="h-3 w-full rounded-full bg-amber-200/80 overflow-hidden flex">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{ width: `${autoPct}%` }}
              title={`${sim.auto} auto-approved`}
            />
          </div>

          {/* Why the escalated ones are held */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-700">
            <div className="flex flex-wrap gap-2">
              <span className="font-semibold text-gray-800">Why {sim.escalated} escalate:</span>
              <span className="px-2 py-0.5 rounded bg-white border border-gray-200">
                YoY &gt; {Math.round(y * 100)}%: <strong>{sim.byYoy}</strong>
              </span>
              <span className="px-2 py-0.5 rounded bg-white border border-gray-200">
                A=L+E / Segment &gt; {(eq * 100).toFixed(1)}%: <strong>{sim.byEq}</strong>
              </span>
              <span className="px-2 py-0.5 rounded bg-white border border-gray-200">
                Derived / Label &lt; 0.80: <strong>{sim.bySafety}</strong>
              </span>
              <span className="px-2 py-0.5 rounded bg-white border border-gray-200">
                Confidence &lt; {t.toFixed(2)}: <strong>{sim.byConf}</strong>
              </span>
            </div>
            {flipped.length > 0 && (
              <div className="text-blue-950 font-medium">
                <strong>Flipped by slider change:</strong>{' '}
                {flipped.slice(0, 5).map((f) => `${f.ticker} ${METRIC_LABEL[f.metric]}`).join(', ')}
                {flipped.length > 5 ? ` +${flipped.length - 5} more` : ''}
              </div>
            )}
          </div>
        </div>
      )}

      {/* #3 & PRD B-1: Side-by-Side Adaptive Escalation Threshold + Before/After Impact Table */}
      <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 text-xs text-amber-950 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="font-bold text-amber-950">Adaptive Threshold Calibration (PRD B-1 · Reviewer Feedback)</div>
            {humanRows.length === 0 ? (
              <p className="text-amber-900">No human review decisions logged yet. Approve, correct, or reject escalated values to calibrate automatically.</p>
            ) : (
              <p className="text-amber-900">
                Logged <strong>{humanRows.length} human decisions</strong>: <strong>{approvedAsIs}</strong> approved unchanged ({Math.round((approvalRate ?? 0) * 100)}% agreement) · <strong>{changedOrRejected}</strong> corrected/rejected. Validation &amp; derived safety gates remain untouched.
              </p>
            )}
          </div>

          {humanRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-white border border-amber-200 font-mono text-gray-800">
                Before (Saved): <strong>{config.threshold.toFixed(2)}</strong>
              </span>
              {suggestedThreshold !== null && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-300 font-mono text-amber-950">
                  After (Suggested): <strong>{suggestedThreshold.toFixed(2)}</strong>
                </span>
              )}
              {suggestedThreshold !== null && Math.abs(suggestedThreshold - t) > 1e-6 && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => save({ threshold: suggestedThreshold, yoy_threshold: y, equation_tolerance: eq })}
                  className="px-3.5 py-1.5 rounded-full bg-amber-900 text-white font-semibold hover:bg-amber-950 shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  Apply {suggestedThreshold.toFixed(2)}
                </button>
              )}
            </div>
          )}
        </div>

        {suggestedThreshold !== null && suggestedThreshold !== config.threshold && allVals.length > 0 && (() => {
          const after = evalRouting(suggestedThreshold, config.yoy_threshold, savedEq);
          const escDiff = after.escalated - baseline.escalated;
          return (
            <div className="bg-white/90 rounded-lg border border-amber-200/80 overflow-x-auto">
              <table className="w-full text-left text-[11px] tabular-nums">
                <thead className="bg-amber-100/50 text-amber-950 font-semibold border-b border-amber-200/70">
                  <tr>
                    <th className="py-2 px-3">Calibration policy</th>
                    <th className="py-2 px-3 text-right">Threshold</th>
                    <th className="py-2 px-3 text-right">Auto-approved</th>
                    <th className="py-2 px-3 text-right">Human escalations</th>
                    <th className="py-2 px-3 text-right">Validation gates</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  <tr>
                    <td className="py-2 px-3 font-medium text-gray-700">Before (Current saved)</td>
                    <td className="py-2 px-3 text-right font-mono">{config.threshold.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right font-semibold text-emerald-800">{baseline.auto}</td>
                    <td className="py-2 px-3 text-right font-semibold text-amber-900">{baseline.escalated}</td>
                    <td className="py-2 px-3 text-right text-gray-600">All enforced</td>
                  </tr>
                  <tr className="bg-emerald-50/40">
                    <td className="py-2 px-3 font-bold text-gray-900">After (Adaptive calibration)</td>
                    <td className="py-2 px-3 text-right font-mono font-bold">{suggestedThreshold.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-800">{after.auto}</td>
                    <td className="py-2 px-3 text-right font-bold text-amber-900">
                      {after.escalated}{' '}
                      {escDiff !== 0 && <span className="text-emerald-700">({escDiff > 0 ? `+${escDiff}` : escDiff})</span>}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-emerald-800">All enforced (0 relaxed)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>

      {/* Save Row with Unsaved Changes Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => save()}
            className="min-h-11 px-7 rounded-full bg-black text-white text-sm font-semibold hover:bg-zinc-800 hover:scale-105 active:scale-95 transition-all duration-200 shadow-md hover:shadow-xl disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Saving…' : isDirty ? 'Save & apply thresholds' : 'Save thresholds'}
          </button>
          {isDirty && !msg && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              ● Unsaved slider changes
            </span>
          )}
          {!isDirty && !msg && (
            <span className="text-xs text-gray-500 font-medium">✓ Matches saved configuration</span>
          )}
          {msg && <span role="status" className="text-sm font-semibold text-emerald-700 animate-card-left">{msg}</span>}
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={() => save({ threshold: 0.85, yoy_threshold: 0.4, equation_tolerance: 0.005 })}
          className="text-xs font-semibold text-gray-600 hover:text-black underline disabled:opacity-50 cursor-pointer"
        >
          Reset to defaults (0.85 · 40% · 0.5%)
        </button>
      </div>
    </section>
  );
}

function McpPanel() {
  const mcp = useApi(api.mcpTools);
  const [res, setRes] = useState<McpCallResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function runCall(step: string, name: string, args: Record<string, unknown>) {
    setBusy(true);
    try {
      setRes(await api.mcpCall(step, name, args));
    } catch (e: unknown) {
      setRes({ ok: false, step, tool: name, result: null, error: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  const tools = mcp.data?.tools ?? [];
  if (!tools.length) return null;

  return (
    <section
      aria-labelledby="mcp-heading"
      className="animate-dashboard-item delay-300 bg-white/90 backdrop-blur-md rounded-2xl border border-gray-200/80 p-6 md:p-7 shadow-xs hover:shadow-md transition-shadow duration-300 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="mcp-heading" className="text-base font-bold text-gray-900">
            MCP Tool Integration · Step-Scoped Access Control
          </h2>
          <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
            SEC EDGAR 10-K retrieval and XBRL Company Facts exposed as MCP tools (<code className="font-mono">agent/mcp_tools.py</code>). Extraction nodes are blocked from calling <code className="font-mono">get_xbrl_fact</code> so the agent cannot peek at the ground-truth answer key before human review.
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
          {tools.length} MCP tools registered
        </span>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 text-xs">
        {tools.map((tool) => (
          <div key={tool.name} className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-1.5">
            <div className="font-mono font-bold text-gray-900">{tool.name}</div>
            <p className="text-gray-600">{tool.description}</p>
            <div className="pt-1 flex flex-wrap gap-1">
              {(tool.allowed_steps ?? []).map((s) => (
                <span key={s} className="px-1.5 py-0.5 rounded bg-white border border-gray-200 font-mono text-[11px] text-gray-700">
                  step: {s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-gray-700">Live MCP policy test:</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => runCall('fetch_filing', 'get_filing', { ticker: 'AAPL' })}
          className="px-3 py-1.5 rounded-full border border-gray-300 bg-white text-gray-800 font-medium hover:border-black disabled:opacity-50 cursor-pointer"
        >
          1. Call get_filing(AAPL) in fetch_filing ✓
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => runCall('extract', 'get_xbrl_fact', { ticker: 'AAPL', metric: 'revenue' })}
          className="px-3 py-1.5 rounded-full border border-amber-300 bg-amber-50 text-amber-900 font-medium hover:border-amber-600 disabled:opacity-50 cursor-pointer"
        >
          2. Attempt get_xbrl_fact in extract (Blocked ✗)
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => runCall('verify_vs_xbrl', 'get_xbrl_fact', { ticker: 'AAPL', metric: 'revenue' })}
          className="px-3 py-1.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-900 font-medium hover:border-emerald-600 disabled:opacity-50 cursor-pointer"
        >
          3. Call get_xbrl_fact(AAPL) in verify_vs_xbrl ✓
        </button>
      </div>

      {res && (
        <pre className={`text-xs font-mono rounded-xl p-3 overflow-x-auto border ${res.ok ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950' : 'bg-red-50/70 border-red-200 text-red-900'}`}>
          {JSON.stringify(res, null, 2)}
        </pre>
      )}
    </section>
  );
}
