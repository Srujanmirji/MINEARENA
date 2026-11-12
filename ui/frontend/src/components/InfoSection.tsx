import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { api, pct } from '../api';

interface InfoSectionProps {
  onDiscover?: () => void;
  onOpenAccuracyReport?: () => void;
}

export const InfoSection: React.FC<InfoSectionProps> = ({
  onDiscover,
  onOpenAccuracyReport,
}) => {
  // Live from GET /report; never a hard-coded number.
  const [accuracy, setAccuracy] = useState<string>('Accuracy report');
  useEffect(() => {
    let cancelled = false;
    api.report()
      .then((r) => {
        if (!cancelled && r.overall.accuracy !== null) {
          setAccuracy(`${pct(r.overall.accuracy)} accuracy · ${r.overall.correct}/${r.overall.verifiable}`);
        }
      })
      .catch(() => { /* backend down: keep the neutral label */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <section id="how-it-works" className="bg-[#F5F5F5] px-6 py-24 scroll-mt-20">
      <div className="max-w-[88rem] mx-auto">
        {/* Row 1: 2-col header grid with scroll reveals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16 items-start">
          {/* Left Column */}
          <div className="reveal-from-left">
            <h2
              className="text-black text-4xl md:text-5xl font-medium leading-tight mb-8"
              style={{ letterSpacing: '-0.03em' }}
            >
              Meet AuditLoop.
            </h2>
            <button
              type="button"
              onClick={onDiscover}
              className="inline-flex items-center gap-3 bg-black text-white text-base font-medium pl-7 pr-2 py-2 rounded-full hover:bg-gray-800 transition-colors duration-200 group shadow-sm active:scale-[0.98]"
            >
              <span>Inspect Engine</span>
              <span className="bg-white rounded-full p-2 group-hover:bg-white transition-colors duration-200 flex items-center justify-center">
                <ArrowRight className="w-4 h-4 text-black transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
            </button>
          </div>

          {/* Right Column */}
          <div className="reveal-from-right delay-150">
            <p className="text-black/70 text-2xl md:text-3xl leading-relaxed">
              AuditLoop is a human-in-the-loop financial auditor agent that extracts 10-K metrics, validates balance equations, and proves accuracy against SEC XBRL facts.
            </p>
          </div>
        </div>

        {/* Row 2: 4-col card grid with staggered scroll glide */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1 (spans 2 cols on lg) */}
          <div
            className="reveal-on-scroll delay-75 card-hover-tilt lg:col-span-2 rounded-2xl p-7 min-h-80 flex flex-col justify-between overflow-hidden relative shadow-sm border border-black/5 group"
            style={{
              backgroundImage: `url('/coins-gold.jpg')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {/* Subtle gloss overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-white/20 to-transparent pointer-events-none" />

            {/* Title (top) */}
            <div className="relative z-10">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/85 backdrop-blur-md text-black/85 border border-black/10 shadow-xs mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Exact 10-K Citations
              </span>
              <h3
                className="text-black text-2xl md:text-3xl font-medium leading-snug"
                style={{ letterSpacing: '-0.02em' }}
              >
                Evidence that reconciles
              </h3>
            </div>

            {/* Body (bottom) */}
            <div className="relative z-10">
              <p className="text-black/80 text-base max-w-sm leading-relaxed font-medium">
                Extract balance sheet, income statement, and cash flow values with exact source row citations from filed 10-K HTML.
              </p>
            </div>
          </div>

          {/* Card 2 (solid #2B2644) - Accuracy Card */}
          <div
            id="accuracy"
            onClick={onOpenAccuracyReport}
            className="reveal-on-scroll delay-150 card-hover-tilt animate-border-glow-green scroll-mt-28 lg:col-span-1 rounded-2xl p-7 min-h-80 flex flex-col justify-between shadow-sm border border-emerald-500/25 relative group cursor-pointer"
            style={{ backgroundColor: '#2B2644' }}
            title="Click to view full SEC XBRL Accuracy Report"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-wider font-semibold text-emerald-400">
                  {accuracy}
                </span>
                <span className="text-[11px] text-white/60 bg-white/10 px-2 py-0.5 rounded-full group-hover:bg-white/20 transition-colors">
                  Report &rarr;
                </span>
              </div>
              <h3
                className="text-white text-2xl font-medium leading-tight whitespace-pre-line"
                style={{ letterSpacing: '-0.02em' }}
              >
                Always auditable,{"\n"}always verified.
              </h3>
            </div>
            <div>
              <p className="text-white/65 text-sm leading-relaxed mb-3">
                Check balance equations (Assets = Liabilities + Equity) on every filing, then grade final values against SEC XBRL facts after review.
              </p>
              <span className="text-xs text-emerald-400 font-medium group-hover:underline inline-flex items-center gap-1">
                View Ground-Truth Report &rarr;
              </span>
            </div>
          </div>

          {/* Card 3 (solid #2B2644) */}
          <div
            className="reveal-on-scroll delay-225 card-hover-tilt lg:col-span-1 rounded-2xl p-7 min-h-80 flex flex-col justify-between shadow-sm border border-white/10"
            style={{ backgroundColor: '#2B2644' }}
          >
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white/10 text-white/80 border border-white/15 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                Human Oversight
              </span>
              <h3
                className="text-white text-2xl font-medium leading-tight whitespace-pre-line"
                style={{ letterSpacing: '-0.02em' }}
              >
                Human in{"\n"}the loop
              </h3>
            </div>
            <div>
              <p className="text-white/60 text-base leading-relaxed">
                Automate high-confidence metrics while escalating ambiguous or suspicious disclosures for auditor review.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
