import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, BarChart3, CheckCircle2, CheckSquare, Clock, FileText, Layers, X } from 'lucide-react';
import { api, type Config } from '../api';
import { AccuracyTab } from './dashboard/AccuracyTab';
import { AuditTab } from './dashboard/AuditTab';
import { ReviewTab } from './dashboard/ReviewTab';
import { RunsTab } from './dashboard/RunsTab';
import { ValuesTab } from './dashboard/ValuesTab';
import { useApi } from './dashboard/useApi';

export type DashboardTab = 'review' | 'runs' | 'values' | 'accuracy' | 'audit';

interface FullScreenDashboardProps {
  onClose: () => void;
  initialTab?: DashboardTab;
}

const NAV: { id: DashboardTab; label: string; icon: typeof Layers }[] = [
  { id: 'runs', label: 'Runs', icon: Layers },
  { id: 'review', label: 'Review queue', icon: CheckSquare },
  { id: 'values', label: 'Extracted values', icon: FileText },
  { id: 'accuracy', label: 'Accuracy report', icon: BarChart3 },
  { id: 'audit', label: 'Audit log', icon: Clock },
];
const EXIT_MS = 320;

export const FullScreenDashboard: React.FC<FullScreenDashboardProps> = ({ onClose, initialTab = 'review' }) => {
  const [tab, setTab] = useState<DashboardTab>(initialTab);
  const [isExiting, setIsExiting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  // Light polling only: each API request opens SQLite connections server-side.
  const runs = useApi(api.listRuns, 15000);
  const health = useApi(api.health);
  const pendingCount = (runs.data ?? []).reduce((s, r) => s + r.n_pending, 0);

  useEffect(() => { api.getConfig().then(setConfig).catch(() => setConfig(null)); }, []);

  const exitingRef = useRef(false);
  const handleClose = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setIsExiting(true);
    setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const onDecided = (message: string) => { setToast(message); runs.reload(); };
  const threshold = config?.threshold ?? 0.85;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AuditLoop reviewer dashboard"
      className={`fixed inset-0 z-50 flex flex-col md:flex-row bg-[#F8FAFC] text-gray-900 antialiased ${isExiting ? 'animate-dashboard-exit' : 'animate-dashboard-enter'}`}
    >
      <aside className="md:w-64 bg-[#0B0F17] flex md:flex-col justify-between gap-4 p-3 md:p-5 text-gray-300 shrink-0">
        <div className="min-w-0">
          <div className="hidden md:flex items-center gap-3 px-2 py-3 mb-6">
            <div className="w-7 h-7 rounded-md bg-white flex items-center justify-center"><CheckSquare className="w-5 h-5 text-black" /></div>
            <span className="text-xl font-bold tracking-tight text-white">AuditLoop</span>
          </div>
          <nav aria-label="Dashboard sections" className="flex md:flex-col gap-1.5 overflow-x-auto">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`shrink-0 flex items-center justify-between gap-3 min-h-11 px-3.5 rounded-xl text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${tab === id ? 'bg-[#1E293B] text-white' : 'text-gray-300 hover:text-white hover:bg-white/5'}`}
              >
                <span className="flex items-center gap-3"><Icon className="w-4 h-4" />{label}</span>
                {id === 'review' && pendingCount > 0 && (
                  <span className="bg-amber-500 text-black font-extrabold text-xs px-2 py-0.5 rounded-full tabular-nums" aria-label={`${pendingCount} waiting`}>{pendingCount}</span>
                )}
              </button>
            ))}
          </nav>
        </div>
        <div className="md:pt-6 md:border-t border-gray-800 text-xs text-gray-400 space-y-1.5 md:px-1 shrink-0">
          <div className="hidden md:block">Auto-approve at ≥ {threshold.toFixed(2)}</div>
          {config && <div className="hidden md:block">YoY flag above {Math.round(config.yoy_threshold * 100)}%</div>}
          <div className="hidden md:block">Source: SEC EDGAR</div>
          <button type="button" onClick={handleClose}
            className="md:mt-4 w-full flex items-center justify-center gap-2 min-h-11 px-3 rounded-lg text-xs font-medium text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border border-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
            <ArrowLeft className="w-3.5 h-3.5" /><span className="hidden md:inline">Back to landing page</span><span className="md:hidden">Close</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 sm:p-8 md:p-10">
        <div className="max-w-6xl mx-auto flex justify-end mb-2">
          <button type="button" onClick={handleClose} aria-label="Close dashboard (Escape)"
            className="hidden md:inline-flex items-center gap-1.5 min-h-11 px-3 rounded-full text-xs font-medium text-gray-600 hover:text-black hover:bg-gray-200/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-black">
            Esc <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {health.error && (
          <div role="alert" className="max-w-6xl mx-auto mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-900">
            <strong>Backend unreachable.</strong> Start the API: <code className="font-mono">.venv/bin/python -m uvicorn api.main:app --port 8000</code>
          </div>
        )}

        {tab === 'review' && <ReviewTab threshold={threshold} onDecided={onDecided} onOpenRuns={() => setTab('runs')} />}
        {tab === 'runs' && <RunsTab config={config} onConfigChange={setConfig} onReview={() => setTab('review')} />}
        {tab === 'values' && <ValuesTab />}
        {tab === 'accuracy' && <AccuracyTab />}
        {tab === 'audit' && <AuditTab />}
      </main>

      {toast && (
        <div role="status" aria-live="polite"
          className="fixed bottom-6 right-4 sm:right-8 z-50 max-w-sm bg-emerald-900 text-emerald-50 border border-emerald-700 px-5 py-3 rounded-xl shadow-xl flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}
    </div>
  );
};
