import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';

interface HeroSectionProps {
  onJoinUs?: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onJoinUs }) => {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setScrollY(window.scrollY);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Parallax calculations (bounded to the hero viewport range)
  const heroProgress = Math.min(Math.max(scrollY, 0), 800);
  const containerScale = 1 - (heroProgress * 0.00007); // softly recedes into depth as you scroll down
  const videoTranslate = heroProgress * 0.22;
  const videoScale = 1 + (heroProgress * 0.00035);
  const textTranslate = heroProgress * 0.16;
  const textOpacity = Math.max(0.12, 1 - heroProgress / 620);

  const scrollToNextSection = () => {
    const el = document.getElementById('how-it-works');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="flex-1 px-6 pt-20 pb-6 flex items-end w-full">
      <div
        className="relative w-full rounded-2xl overflow-hidden max-w-[88rem] mx-auto shadow-sm will-change-transform motion-reduce:transform-none"
        style={{
          height: 'calc(100vh - 96px)',
          transform: `scale(${containerScale})`,
          transformOrigin: 'center bottom',
          transition: 'transform 0.1s ease-out',
        }}
      >
        {/* Background video with gold color grading filter and parallax scroll motion */}
        <div
          className="absolute inset-0 w-full h-full will-change-transform motion-reduce:transform-none"
          style={{
            transform: `translateY(${videoTranslate}px) scale(${videoScale})`,
            transformOrigin: 'center center',
          }}
        >
          <video
            autoPlay
            muted
            loop
            playsInline
            poster="/original-coins.jpg"
            className="object-cover absolute inset-0 w-full h-[115%]"
            style={{
              filter: 'hue-rotate(145deg) saturate(1.45) brightness(1.03) contrast(1.02)',
              top: '-7.5%',
            }}
            src="/hero-coins.mp4"
          />
        </div>

        {/* Subtle gradient wash to guarantee crisp typography contrast */}
        <div className="absolute inset-0 bg-gradient-to-r from-white/35 via-white/15 to-transparent pointer-events-none" />

        {/* Content overlay with smooth scroll depth fade & translation */}
        <div
          className="relative z-10 flex flex-col justify-center items-start h-full p-8 sm:p-12 md:p-16 max-w-2xl will-change-transform motion-reduce:transform-none"
          style={{
            transform: `translateY(-${textTranslate}px)`,
            opacity: textOpacity,
          }}
        >
          {/* Main Headline */}
          <h1
            className="text-black text-5xl md:text-6xl lg:text-7xl font-medium leading-tight mb-4 animate-card-left"
            style={{ letterSpacing: '-0.04em' }}
          >
            Every Filing
            <br />
            Verified
          </h1>

          {/* Subheading */}
          <p
            className="text-black/75 text-base md:text-lg max-w-md mb-8 leading-relaxed animate-card-left"
            style={{
              fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
              animationDelay: '120ms',
            }}
          >
            An intelligent financial auditor agent extracting 10-K filing metrics, validating accounting invariants, and escalating anomalies for human sign-off.
          </p>

          {/* Pill button "Launch Audit" */}
          <button
            type="button"
            onClick={onJoinUs}
            className="inline-flex items-center gap-3 bg-black text-white text-base md:text-lg font-medium pl-8 pr-2 py-2 rounded-full hover:bg-gray-800 transition-colors duration-200 group shadow-md active:scale-[0.98] animate-card-left"
            style={{ animationDelay: '220ms' }}
          >
            <span>Launch Audit</span>
            <span className="bg-white rounded-full p-2 group-hover:bg-white transition-colors duration-200 flex items-center justify-center">
              <ArrowRight className="w-5 h-5 text-black transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
          </button>
        </div>

        {/* Floating Scroll Cue Indicator */}
        <button
          type="button"
          onClick={scrollToNextSection}
          aria-label="Scroll to learn more"
          className="absolute bottom-6 right-8 z-10 hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/75 hover:bg-white/95 backdrop-blur-md border border-black/10 shadow-xs text-xs font-medium text-black/80 transition-all duration-300 hover:scale-105 active:scale-95 group"
          style={{ opacity: Math.max(0, 1 - heroProgress / 200) }}
        >
          <span>Scroll to explore</span>
          <span className="w-5 h-5 rounded-full bg-black/5 flex items-center justify-center animate-scroll-cue">
            <svg
              className="w-3.5 h-3.5 text-black"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>
      </div>
    </div>
  );
};
