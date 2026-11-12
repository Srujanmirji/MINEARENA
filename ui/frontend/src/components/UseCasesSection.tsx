import React from 'react';
import { ArrowRight, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';

interface UseCasesSectionProps {
  onKnowMore?: () => void;
}

export const UseCasesSection: React.FC<UseCasesSectionProps> = ({ onKnowMore }) => {
  return (
    <section id="for-auditors" className="bg-[#F5F5F5] px-6 py-24 scroll-mt-20 overflow-hidden">
      <div className="max-w-[88rem] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (5 cols) with scroll reveal motions */}
        <div className="lg:col-span-5 md:pr-8 md:pt-2">
          {/* Eyebrow */}
          <p className="reveal-from-left text-black/60 text-sm mb-2 font-medium tracking-wide uppercase">
            Filing Intelligence in Practice
          </p>

          {/* Heading */}
          <h2
            className="reveal-from-left delay-75 text-5xl md:text-6xl font-medium leading-none mb-6 text-black"
            style={{ letterSpacing: '-0.04em' }}
          >
            Audit modes
          </h2>

          {/* Paragraph */}
          <p className="reveal-from-left delay-150 text-black/70 text-base leading-relaxed mb-8">
            AuditLoop powers automated filing intake for audit teams, compliance leads, and financial analysts requiring zero-hallucination metric extraction.
          </p>

          {/* Key capabilities list */}
          <div className="space-y-4 border-t border-black/10 pt-6">
            <div className="reveal-from-left delay-150 flex items-start gap-3">
              <span className="p-1.5 rounded-md bg-black text-white shrink-0 mt-0.5">
                <Zap className="w-3.5 h-3.5" />
              </span>
              <div>
                <h4 className="text-sm font-semibold text-black">Dual-Pass Extraction</h4>
                <p className="text-xs text-black/60 mt-0.5 leading-relaxed">
                  HTML table parsing combined with LLM extraction runs concurrently on primary 10-K tables.
                </p>
              </div>
            </div>

            <div className="reveal-from-left delay-225 flex items-start gap-3">
              <span className="p-1.5 rounded-md bg-black text-white shrink-0 mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </span>
              <div>
                <h4 className="text-sm font-semibold text-black">Invariant Validation</h4>
                <p className="text-xs text-black/60 mt-0.5 leading-relaxed">
                  Automated balance equations verify Assets = Liabilities + Equity and YoY change limits (&le; 40%).
                </p>
              </div>
            </div>

            <div className="reveal-from-left delay-300 flex items-start gap-3">
              <span className="p-1.5 rounded-md bg-black text-white shrink-0 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5" />
              </span>
              <div>
                <h4 className="text-sm font-semibold text-black">Cryptographic Chain</h4>
                <p className="text-xs text-black/60 mt-0.5 leading-relaxed">
                  Immutable SHA-256 ledger records all reviewer decisions with trigger-enforced delete protection.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (7 cols) with scale reveal and subtle depth */}
        <div className="reveal-scale delay-150 lg:col-span-7 relative rounded-3xl overflow-hidden shadow-sm border border-black/5 bg-[#E8E8E8]">
          {/* Background Video with poster fallback */}
          <video
            autoPlay
            muted
            loop
            playsInline
            poster="/coins-gold.jpg"
            className="object-cover absolute inset-0 w-full h-full opacity-60 mix-blend-multiply"
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260423_183428_ab5e672a-f608-4dcb-b319-f3e040f02e2d.mp4"
          />

          {/* Subtle gradient wash for maximum legibility */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/50 via-white/30 to-white/80 pointer-events-none" />

          {/* Overlay Content */}
          <div className="relative z-10 p-8 sm:p-10 flex flex-col justify-between h-full">
            <div>
              <h3
                className="text-3xl md:text-4xl font-medium leading-tight mb-3 text-black"
                style={{ letterSpacing: '-0.03em' }}
              >
                Filing Intelligence
              </h3>

              <p className="text-black/75 text-sm md:text-base max-w-xl mb-6 leading-relaxed">
                Automate 10-K extraction across revenue, operating income, net income, assets, liabilities, equity, and cash flows with instant XBRL ground-truth checks.
              </p>

              {/* Inline-flex link "Review Audit Protocol" with leading circular icon */}
              <div className="mb-6">
                <a
                  href="#know-more"
                  onClick={(e) => {
                    e.preventDefault();
                    onKnowMore?.();
                  }}
                  className="inline-flex items-center gap-3 text-black text-sm md:text-base font-semibold group cursor-pointer select-none"
                >
                  <span className="w-8 h-8 rounded-full bg-white/90 backdrop-blur flex items-center justify-center group-hover:bg-white transition-colors duration-200 shadow-sm border border-black/10">
                    <ArrowRight className="w-4 h-4 text-black transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                  <span className="group-hover:underline underline-offset-4 transition-all">
                    Review Audit Protocol
                  </span>
                </a>
              </div>
            </div>

            {/* Visual Protocol Pipeline / Interactive Audit Modes Card filling the space */}
            <div className="bg-white/95 backdrop-blur-md rounded-2xl p-5 md:p-6 border border-black/10 shadow-md space-y-4">
              <div className="flex items-center justify-between border-b border-black/5 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-black">
                    Live Audit Modes Engine
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-black/50 bg-black/5 px-2.5 py-0.5 rounded-full">
                  SEC Form 10-K Ingestion
                </span>
              </div>

              {/* 3 Modes Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Mode 1 */}
                <div className="bg-[#F8FAFC] rounded-xl p-3 border border-black/5 hover:border-emerald-300 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-gray-900">1. Auto-Pass</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                      &ge; 0.85
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-tight">
                    Dual-pass extractors agree with valid equations.
                  </p>
                  <div className="mt-2 text-[10px] font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                    AAPL Revenue $391,035M
                  </div>
                </div>

                {/* Mode 2 */}
                <div className="bg-amber-50/40 rounded-xl p-3 border border-amber-200 hover:border-amber-400 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-gray-900">2. Escalation</span>
                    <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                      &lt; 0.85
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-tight">
                    Discrepancy or failed check pauses workflow.
                  </p>
                  <div className="mt-2 text-[10px] font-mono font-semibold text-amber-800 bg-amber-100/70 px-2 py-1 rounded">
                    Operating Cash Flow (Paused)
                  </div>
                </div>

                {/* Mode 3 */}
                <div className="bg-[#F8FAFC] rounded-xl p-3 border border-black/5 hover:border-blue-300 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-gray-900">3. Immutable Log</span>
                    <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded">
                      SHA-256
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-tight">
                    Append-only cryptographic chain verification.
                  </p>
                  <div className="mt-2 text-[10px] font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded">
                    Block #15 Chain Intact
                  </div>
                </div>
              </div>

              {/* Status bar */}
              <div className="flex flex-wrap items-center justify-between pt-2 border-t border-black/5 text-[11px] text-gray-600">
                <span className="font-mono text-[10px]">A = L + E Invariant Check: Passed</span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Zero Manual Hallucinations
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
