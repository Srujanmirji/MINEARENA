import React from 'react';
import { ArrowRight } from 'lucide-react';

interface HeroSectionProps {
  onJoinUs?: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onJoinUs }) => {
  return (
    <div className="flex-1 px-6 pt-20 pb-6 flex items-end w-full">
      <div
        className="relative w-full rounded-2xl overflow-hidden max-w-[88rem] mx-auto shadow-sm"
        style={{ height: 'calc(100vh - 96px)' }}
      >
        {/* Local still image: the old background video streamed from a third-party CDN (breaks offline). */}
        <img
          src="/hero-coins-gold.jpg"
          alt=""
          className="object-cover absolute inset-0 w-full h-full"
          style={{ filter: 'hue-rotate(145deg) saturate(1.45) brightness(1.03) contrast(1.02)' }}
        />

        {/* Subtle gradient wash to guarantee crisp typography contrast */}
        <div className="absolute inset-0 bg-gradient-to-r from-white/30 via-white/10 to-transparent pointer-events-none" />

        {/* Content overlay */}
        <div className="relative z-10 flex flex-col justify-center items-start h-full p-8 sm:p-12 md:p-16 max-w-2xl">
          {/* Main Headline */}
          <h1
            className="text-black text-5xl md:text-6xl lg:text-7xl font-medium leading-tight mb-4"
            style={{ letterSpacing: '-0.04em' }}
          >
            Every Filing
            <br />
            Verified
          </h1>

          {/* Subheading */}
          <p
            className="text-black/75 text-base md:text-lg max-w-md mb-8 leading-relaxed"
            style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}
          >
            An intelligent financial auditor agent extracting 10-K filing metrics, validating accounting invariants, and escalating anomalies for human sign-off.
          </p>

          {/* Pill button "Launch Audit" */}
          <button
            type="button"
            onClick={onJoinUs}
            className="inline-flex items-center gap-3 bg-black text-white text-base md:text-lg font-medium pl-8 pr-2 py-2 rounded-full hover:bg-gray-800 transition-colors duration-200 group shadow-md active:scale-[0.98]"
          >
            <span>Launch Audit</span>
            <span className="bg-white rounded-full p-2 group-hover:bg-white transition-colors duration-200 flex items-center justify-center">
              <ArrowRight className="w-5 h-5 text-black transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
