import React from 'react';
import { LogoIcon } from './LogoIcon';
import { ArrowRight, ShieldCheck, CheckCircle2, ArrowUpRight } from 'lucide-react';

interface FooterProps {
  onOpenDashboard?: () => void;
  onOpenRuns?: () => void;
  onOpenAccuracy?: () => void;
  onOpenAudit?: () => void;
  onOpenDocs?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenDashboard,
  onOpenRuns,
  onOpenAccuracy,
  onOpenAudit,
  onOpenDocs,
}) => {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="bg-[#0B0F17] text-white border-t border-white/10 select-none">
      {/* Pre-footer Callout Banner */}
      <div className="border-b border-white/10 px-6 py-14 reveal-on-scroll">
        <div className="max-w-[88rem] mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <h3 className="text-3xl md:text-4xl font-medium tracking-tight text-white leading-tight">
              Every Filing Verified. Zero Hallucinations.
            </h3>
            <p className="text-gray-400 text-sm md:text-base mt-2 leading-relaxed">
              Extract 10-K metrics, validate accounting invariants, and escalate anomalies with complete auditability.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOpenDashboard}
              className="inline-flex items-center gap-3 bg-white text-black text-sm md:text-base font-semibold pl-6 pr-2 py-2 rounded-full hover:bg-gray-100 transition-colors shadow-lg active:scale-[0.98]"
            >
              <span>Launch Review Console</span>
              <span className="bg-black rounded-full p-2 flex items-center justify-center">
                <ArrowRight className="w-4 h-4 text-white" />
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="px-6 py-16 reveal-on-scroll delay-150">
        <div className="max-w-[88rem] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Brand Col (spans 2) */}
          <div className="lg:col-span-2 pr-4">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                scrollToTop();
              }}
              className="flex items-center gap-2.5 group cursor-pointer"
            >
              <LogoIcon className="w-7 h-7 text-white transition-transform duration-300 group-hover:scale-105" />
              <span className="text-2xl font-bold tracking-tight text-white">AuditLoop</span>
            </a>

            <p className="text-gray-400 text-sm mt-4 leading-relaxed max-w-sm">
              An intelligent Human-in-the-Loop financial auditor agent extracting 10-K metrics from SEC EDGAR, enforcing GAAP invariants, and recording every decision in an immutable append-only ledger.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/5 border border-white/10 text-gray-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                SEC EDGAR Live
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/5 border border-white/10 text-gray-300">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                SHA-256 Ledger
              </span>
            </div>
          </div>

          {/* Product Col */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-4">
              Review Workspace
            </h4>
            <ul className="space-y-2.5 text-sm text-gray-300">
              <li>
                <button
                  type="button"
                  onClick={onOpenDashboard}
                  className="hover:text-white transition-colors text-left"
                >
                  Review Queue
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenRuns}
                  className="hover:text-white transition-colors text-left"
                >
                  Filing Ingestion Runs
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenAccuracy}
                  className="hover:text-white transition-colors text-left"
                >
                  Accuracy Benchmark
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenAudit}
                  className="hover:text-white transition-colors text-left"
                >
                  Cryptographic Audit Log
                </button>
              </li>
            </ul>
          </div>

          {/* Verification Col */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-4">
              Audit Invariants
            </h4>
            <ul className="space-y-2.5 text-sm text-gray-400">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Assets = Liabilities + Equity</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Segment Revenue Sum</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Year-on-Year &le; 40% Threshold</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>SEC XBRL Company Facts</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Auditor's Unqualified Opinion</span>
              </li>
            </ul>
          </div>

          {/* Event & Team Col */}
          <div>
            <h4 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-4">
              MineArena 1.0
            </h4>
            <ul className="space-y-2.5 text-sm text-gray-300">
              <li className="text-xs text-gray-400">
                Problem Statement: <strong className="text-white">PS-01</strong>
              </li>
              <li className="text-xs text-gray-400">
                Venue: <span className="text-gray-200">BIET Davangere</span>
              </li>
              <li className="pt-1">
                <button
                  type="button"
                  onClick={onOpenDocs}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <span>Technical Docs &amp; PRD</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </li>
              <li className="text-xs text-gray-500 pt-2 leading-relaxed">
                Team: Zeeshan (Backend) · Mayur (SEC Data) · Sai (Frontend) · Srujan (Lead)
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/10 px-6 py-6 text-xs text-gray-500">
        <div className="max-w-[88rem] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>
            &copy; 2026 AuditLoop. Built for MineArena 1.0 (PS-01). All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <span className="hidden sm:inline text-gray-600">
              Append-only database triggers enforce zero-edit auditability.
            </span>
            <button
              type="button"
              onClick={scrollToTop}
              className="text-gray-400 hover:text-white transition-colors"
            >
              Back to top &uarr;
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};

