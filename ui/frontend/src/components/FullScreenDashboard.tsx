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

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  const exitingRef = useRef(false);
  const handleClose = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setIsExiting(true);
    setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const onDecided = (message: string) => {
    setToast(message);
    runs.reload();
  };
  const threshold = config?.threshold ?? 0.85;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AuditLoop reviewer dashboard"
      data-lenis-prevent="true"
      className={`fixed inset-0 z-50 flex flex-col md:flex-row h-screen w-screen max-h-screen max-w-full overflow-hidden bg-[#F8FAFC] text-gray-900 antialiased ${
        isExiting ? 'animate-dashboard-exit' : 'animate-dashboard-enter'
      }`}
    >
      {/* Sleek Dark Glass Sidebar */}
      <aside className="md:w-68 max-h-screen overflow-y-auto bg-gradient-to-b from-[#0F1420] via-[#0B0F17] to-[#070A10] border-r border-white/10 flex md:flex-col justify-between gap-4 p-4 md:p-6 text-gray-300 shrink-0 shadow-2xl relative z-10">
        <div className="min-w-0">
          {/* Logo & Brand Header */}
          <div className="hidden md:flex items-center gap-3 px-2 py-3 mb-6">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-white to-gray-200 shadow-[0_0_20px_rgba(255,255,255,0.2)] flex items-center justify-center transition-transform hover:scale-105">
              <CheckSquare className="w-5 h-5 text-black" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white block leading-none">
                AuditLoop
              </span>
              <span className="text-[10px] uppercase font-mono tracking-widest text-emerald-400 font-semibold mt-1 block">
                Verification Hub
              </span>
            </div>
          </div>

          {/* Navigation Items with Animated Tabs */}
          <nav aria-label="Dashboard sections" className="flex md:flex-col gap-1.5 overflow-x-auto">
            {NAV.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={active ? 'page' : undefined}
                  className={`shrink-0 flex items-center justify-between gap-3 min-h-12 px-4 rounded-xl text-sm font-semibold transition-all duration-200 group relative ${
                    active
                      ? 'bg-white/10 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.18),0_4px_16px_rgba(0,0,0,0.4)] border border-white/15 scale-[1.01]'
                      : 'text-gray-400 hover:text-white hover:bg-white/5 hover:translate-x-1'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 transition-transform duration-200 ${active ? 'text-amber-400 scale-110' : 'group-hover:scale-110'}`} />
                    {label}
                  </span>
                  {id === 'review' && pendingCount > 0 && (
                    <span
                      className="bg-amber-500 text-black font-extrabold text-xs px-2.5 py-0.5 rounded-full tabular-nums shadow-[0_0_12px_rgba(245,158,11,0.6)] animate-pulse"
                      aria-label={`${pendingCount} waiting`}
                    >
                      {pendingCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Telemetry Card & Back to Landing Button */}
        <div className="md:pt-5 md:border-t border-white/10 text-xs text-gray-400 space-y-2 shrink-0">
          <div className="hidden md:block bg-white/[0.03] border border-white/5 rounded-xl p-3 space-y-1.5 backdrop-blur-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Auto-approve threshold</span>
              <span className="font-mono text-white text-xs font-semibold">≥ {threshold.toFixed(2)}</span>
            </div>
            {config && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-400">YoY change flag</span>
                <span className="font-mono text-amber-400 text-xs font-semibold">&gt; {Math.round(config.yoy_threshold * 100)}%</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 pt-1 border-t border-white/5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Source: SEC EDGAR</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="w-full flex items-center justify-center gap-2 min-h-12 px-4 rounded-xl text-xs font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/15 hover:border-white/25 active:scale-95 transition-all duration-200 shadow-md group"
          >
            <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-x-1" />
            <span className="hidden md:inline">Back to landing page</span>
            <span className="md:hidden">Close</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main
        data-lenis-prevent="true"
        className="flex-1 min-h-0 h-full max-h-full overflow-y-auto dashboard-scroll overscroll-contain p-4 sm:p-8 md:p-10 relative"
      >
        {/* Floating Top Header Bar with Close Button */}
        <div className="max-w-6xl mx-auto flex justify-end mb-4">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close dashboard (Escape)"
            className="hidden md:inline-flex items-center gap-2 min-h-10 px-4 rounded-full text-xs font-semibold text-gray-700 bg-white/90 hover:bg-white border border-black/10 shadow-xs hover:shadow-md hover:scale-105 active:scale-95 transition-all duration-200 group"
          >
            <span className="text-gray-500 group-hover:text-black">Exit</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-black/5 group-hover:bg-black/10 rounded border border-black/10 transition-colors">
              ESC
            </kbd>
            <X className="w-3.5 h-3.5 text-gray-500 group-hover:text-black transition-transform duration-200 group-hover:rotate-90" />
          </button>
        </div>

        {health.error && (
          <div role="alert" className="max-w-6xl mx-auto mb-6 bg-red-50 border border-red-200 rounded-2xl p-5 text-sm text-red-900 shadow-xs">
            <strong>Backend unreachable.</strong> Start the API: <code className="font-mono bg-red-100 px-2 py-0.5 rounded">.venv/bin/python -m uvicorn api.main:app --port 8000</code>
          </div>
        )}

        <div className="animate-card-left">
          {tab === 'review' && <ReviewTab threshold={threshold} onDecided={onDecided} onOpenRuns={() => setTab('runs')} />}
          {tab === 'runs' && <RunsTab config={config} onConfigChange={setConfig} onReview={() => setTab('review')} />}
          {tab === 'values' && <ValuesTab />}
          {tab === 'accuracy' && <AccuracyTab />}
          {tab === 'audit' && <AuditTab />}
        </div>
      </main>

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-4 sm:right-8 z-50 max-w-sm bg-emerald-950/95 backdrop-blur-md text-emerald-50 border border-emerald-500/40 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 animate-card-left"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-semibold">{toast}</span>
        </div>
      )}
    </div>
  );
};
