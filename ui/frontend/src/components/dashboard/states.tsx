import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

/** Shared loading / error / empty blocks so every tab handles the three states the same way. */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-gray-500 py-10 justify-center">
      <Loader2 className="w-5 h-5 text-amber-500 animate-spin motion-reduce:animate-none" />
      <span className="font-medium">{label}</span>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="bg-red-50/90 backdrop-blur-xs border border-red-200 rounded-2xl p-5 flex items-start gap-3.5 text-sm text-red-900 shadow-sm">
      <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="font-semibold text-base">Couldn&apos;t load this</div>
        <div className="mt-1 text-red-800 leading-relaxed">{message}</div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 px-5 rounded-full border border-red-300 font-semibold bg-white hover:bg-red-50 hover:scale-105 active:scale-95 transition-all duration-200 shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-gray-200/80 p-12 text-center shadow-xs">
      <h3 className="text-lg font-bold text-gray-900">{title}</h3>
      {children && <div className="text-sm text-gray-600 mt-2 max-w-md mx-auto leading-relaxed">{children}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, tone = 'text-gray-900' }: {
  label: string; value: string; sub?: string; tone?: string;
}) {
  return (
    <div className="bg-white/90 backdrop-blur-sm p-5 md:p-6 rounded-2xl border border-gray-200/80 shadow-xs hover:shadow-xl hover:-translate-y-1.5 hover:border-black/20 transition-all duration-300 group relative overflow-hidden">
      {/* Dynamic top edge shimmer line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-black/10 to-transparent group-hover:via-amber-400/80 transition-all duration-500" />
      <div className="text-[11px] text-gray-500 font-semibold tracking-wider uppercase">{label}</div>
      <div className={`text-3xl md:text-4xl font-extrabold mt-2 tabular-nums tracking-tight group-hover:scale-105 transition-transform duration-300 origin-left ${tone}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-500 mt-1.5 font-medium">{sub}</div>}
    </div>
  );
}
