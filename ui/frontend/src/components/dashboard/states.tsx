import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

/** Shared loading / error / empty blocks so every tab handles the three states the same way. */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-gray-500 py-10 justify-center">
      <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 text-sm text-red-900">
      <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="font-semibold">Couldn&apos;t load this</div>
        <div className="mt-0.5">{message}</div>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 px-4 rounded-lg border border-red-300 font-semibold hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
      <h3 className="text-base font-bold text-gray-900">{title}</h3>
      {children && <div className="text-sm text-gray-600 mt-1.5 max-w-md mx-auto">{children}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, tone = 'text-gray-900' }: {
  label: string; value: string; sub?: string; tone?: string;
}) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs">
      <div className="text-xs text-gray-600 font-medium">{label}</div>
      <div className={`text-3xl font-bold mt-1 tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-gray-600 mt-1">{sub}</div>}
    </div>
  );
}
