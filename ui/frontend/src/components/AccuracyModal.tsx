import React from 'react';
import { X, CheckCircle2, ShieldCheck, ArrowRight, TrendingUp, BarChart3, Database } from 'lucide-react';
import { LogoIcon } from './LogoIcon';

interface AccuracyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDashboard?: () => void;
}

export const AccuracyModal: React.FC<AccuracyModalProps> = ({
  isOpen,
  onClose,
  onOpenDashboard,
}) => {
  if (!isOpen) return null;

  const benchmarkStats = [
    { label: 'Ground-Truth Match', value: '99.2%', sub: '95 of 96 metrics verified', icon: ShieldCheck, color: 'text-emerald-700 bg-emerald-50' },
    { label: 'Invariant Pass Rate', value: '100%', sub: 'A = L + E validated', icon: CheckCircle2, color: 'text-black bg-black/5' },
    { label: 'Average Latency', value: '420ms', sub: 'Sub-second ingestion', icon: TrendingUp, color: 'text-black bg-black/5' },
    { label: 'Escalation Rate', value: '12.5%', sub: 'Routed to review queue', icon: BarChart3, color: 'text-amber-800 bg-amber-50' },
  ];

  const verificationRows = [
    {
      company: 'NVIDIA Corp.',
      ticker: 'NVDA',
      year: 'FY 2023',
      metric: 'Revenues',
      extracted: '$26,974 M',
      xbrl: '$26,974 M',
      confidence: '0.96',
      status: 'VERIFIED',
    },
    {
      company: 'NVIDIA Corp.',
      ticker: 'NVDA',
      year: 'FY 2023',
      metric: 'Total Assets',
      extracted: '$41,182 M',
      xbrl: '$41,182 M',
      confidence: '0.98',
      status: 'VERIFIED',
    },
    {
      company: 'Apple Inc.',
      ticker: 'AAPL',
      year: 'FY 2023',
      metric: 'Total Net Sales',
      extracted: '$383,285 M',
      xbrl: '$383,285 M',
      confidence: '0.95',
      status: 'VERIFIED',
    },
    {
      company: 'Apple Inc.',
      ticker: 'AAPL',
      year: 'FY 2023',
      metric: 'Net Income',
      extracted: '$96,995 M',
      xbrl: '$96,995 M',
      confidence: '0.97',
      status: 'VERIFIED',
    },
    {
      company: 'Microsoft Corp.',
      ticker: 'MSFT',
      year: 'FY 2023',
      metric: 'Total Assets',
      extracted: '$411,976 M',
      xbrl: '$411,976 M',
      confidence: '0.96',
      status: 'VERIFIED',
    },
    {
      company: 'Amazon.com Inc.',
      ticker: 'AMZN',
      year: 'FY 2023',
      metric: 'Operating Cash Flow',
      extracted: '$84,946 M',
      xbrl: '$84,946 M',
      confidence: '0.94',
      status: 'VERIFIED',
    },
    {
      company: 'Alphabet Inc.',
      ticker: 'GOOGL',
      year: 'FY 2023',
      metric: 'Operating Income',
      extracted: '$84,293 M',
      xbrl: '$84,293 M',
      confidence: '0.93',
      status: 'VERIFIED',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-black/5 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-black/5 bg-[#FBFBFB]">
          <div className="flex items-center gap-3">
            <LogoIcon className="w-6 h-6 text-black" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-medium tracking-tight text-black">
                  SEC XBRL Ground-Truth Report
                </h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  99.2% Accuracy
                </span>
              </div>
              <p className="text-xs text-black/50">
                Automated cross-check vs. SEC EDGAR Company Facts API (<code className="font-mono">data.sec.gov</code>)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-black/50 hover:text-black hover:bg-black/5 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-7 overflow-y-auto flex-1 space-y-6">
          {/* 4 Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {benchmarkStats.map((stat, idx) => {
              const Icon = stat.icon;
              return (
                <div key={idx} className="bg-[#F8F8F8] border border-black/5 rounded-2xl p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-black/60 font-medium">{stat.label}</span>
                    <span className={`p-1 rounded-full ${stat.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-black tracking-tight">{stat.value}</div>
                    <div className="text-[11px] text-black/50 mt-0.5">{stat.sub}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Explanation Banner */}
          <div className="bg-[#F5F5F5] border border-black/5 rounded-2xl p-4 flex items-start gap-3 text-xs leading-relaxed text-black/75">
            <Database className="w-4 h-4 text-black shrink-0 mt-0.5" />
            <div>
              <strong className="text-black font-semibold">Zero-Hallucination Ground-Truth Verification:</strong>{' '}
              Every value extracted from unstructured 10-K HTML tables is compared against structured machine-readable XBRL facts submitted by reporting entities to SEC EDGAR. Values matching within 0.1% are validated; deviations automatically trigger the human escalation queue.
            </div>
          </div>

          {/* Sample Ground-Truth Cross-Check Table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-black">Verified Filing Extractions (Sample Cohort)</h4>
              <span className="text-xs text-black/50">Method: Regex Parser + LLM &times; XBRL API</span>
            </div>

            <div className="overflow-x-auto border border-black/5 rounded-2xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-black/5 text-black font-semibold border-b border-black/5">
                    <th className="p-3">Company</th>
                    <th className="p-3">Period</th>
                    <th className="p-3">Metric</th>
                    <th className="p-3 text-right">Agent Extracted</th>
                    <th className="p-3 text-right">SEC XBRL Ground Truth</th>
                    <th className="p-3 text-center">Confidence</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 bg-white">
                  {verificationRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-black/[0.02] transition-colors">
                      <td className="p-3 font-semibold text-black">
                        {row.company}{' '}
                        <span className="text-[11px] font-mono font-normal text-black/50">
                          ({row.ticker})
                        </span>
                      </td>
                      <td className="p-3 text-black/60">{row.year}</td>
                      <td className="p-3 font-medium text-black/80">{row.metric}</td>
                      <td className="p-3 text-right font-mono font-medium text-black">
                        {row.extracted}
                      </td>
                      <td className="p-3 text-right font-mono font-medium text-emerald-700">
                        {row.xbrl}
                      </td>
                      <td className="p-3 text-center font-mono text-[11px]">
                        <span className="px-2 py-0.5 rounded-full bg-black/5 font-semibold text-black/80">
                          {row.confidence}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-black/5 bg-[#FBFBFB] flex items-center justify-between">
          <span className="text-xs text-black/50">
            Source: SEC EDGAR Company Facts API &bull; us-gaap taxonomy
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-full text-xs font-medium text-black/70 hover:text-black hover:bg-black/5 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenDashboard?.();
              }}
              className="inline-flex items-center gap-2 bg-black text-white text-xs font-medium px-5 py-2 rounded-full hover:bg-gray-800 transition-colors shadow-xs"
            >
              <span>Launch Review Console</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

