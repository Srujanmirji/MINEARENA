import React from 'react';
import { ArrowRight } from 'lucide-react';

interface UseCasesSectionProps {
  onKnowMore?: () => void;
}

export const UseCasesSection: React.FC<UseCasesSectionProps> = ({ onKnowMore }) => {
  return (
    <section id="for-auditors" className="bg-[#F5F5F5] px-6 py-24 scroll-mt-20">
      <div className="max-w-[88rem] mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Left Column */}
        <div className="md:pr-12 md:pt-2">
          {/* Eyebrow */}
          <p className="text-black/60 text-sm mb-2 font-medium tracking-wide uppercase">
            Filing Intelligence in Practice
          </p>

          {/* Heading */}
          <h2
            className="text-5xl md:text-6xl font-medium leading-none mb-6 text-black"
            style={{ letterSpacing: '-0.04em' }}
          >
            Audit modes
          </h2>

          {/* Paragraph */}
          <p className="text-black/60 text-base leading-relaxed max-w-sm">
            AuditLoop powers automated filing intake for audit teams, compliance leads, and financial analysts requiring zero-hallucination metric extraction.
          </p>
        </div>

        {/* Right Column */}
        <div className="relative rounded-3xl overflow-hidden min-h-[720px] w-full shadow-sm">
          {/* Background Video */}
          <video
            autoPlay
            muted
            loop
            playsInline
            className="object-cover absolute inset-0 w-full h-full"
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260423_183428_ab5e672a-f608-4dcb-b319-f3e040f02e2d.mp4"
          />

          {/* Subtle gradient wash for text legibility */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/10 pointer-events-none" />

          {/* Overlay Content */}
          <div className="relative z-10 p-10 md:p-12 flex flex-col justify-start h-full">
            <h3
              className="text-4xl md:text-5xl font-medium leading-tight mb-5 text-black"
              style={{ letterSpacing: '-0.03em' }}
            >
              Filing Intelligence
            </h3>

            <p className="text-black/70 text-base max-w-md mb-8 leading-relaxed">
              Automate 10-K extraction across revenue, operating income, net income, assets, liabilities, equity, and cash flows with instant XBRL ground-truth checks.
            </p>

            {/* Inline-flex link "Review Audit Protocol" with leading circular icon */}
            <div>
              <a
                href="#know-more"
                onClick={(e) => {
                  e.preventDefault();
                  onKnowMore?.();
                }}
                className="inline-flex items-center gap-3 text-black text-base font-medium group cursor-pointer select-none"
              >
                <span className="w-9 h-9 rounded-full bg-white/80 backdrop-blur flex items-center justify-center group-hover:bg-white transition-colors duration-200 shadow-sm">
                  <ArrowRight className="w-4 h-4 text-black transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
                <span className="group-hover:underline underline-offset-4 transition-all">
                  Review Audit Protocol
                </span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

