import { useState, useEffect } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { InfoSection } from './components/InfoSection';
import { BackedBySection } from './components/BackedBySection';
import { UseCasesSection } from './components/UseCasesSection';
import { Footer } from './components/Footer';
import { FullScreenDashboard, type DashboardTab } from './components/FullScreenDashboard';
import { DocsModal } from './components/DocsModal';
import { AccuracyModal } from './components/AccuracyModal';

export function App() {
  // null = landing page; otherwise the dashboard is open on that tab.
  const [dashboardTab, setDashboardTab] = useState<DashboardTab | null>(null);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isAccuracyOpen, setIsAccuracyOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const isDashboardOpen = dashboardTab !== null;

  // Initialize Lenis luxury smooth scroll engine
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.25,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.8,
    });

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    // Sync scrollProgress and showBackToTop directly with Lenis smooth scroll events
    lenis.on('scroll', (e: { scroll: number; limit: number }) => {
      const currentScroll = e.scroll;
      const maxScroll = e.limit;
      const progress = maxScroll > 0 ? Math.min(Math.max(currentScroll / maxScroll, 0), 1) : 0;
      setScrollProgress(progress);
      setShowBackToTop(currentScroll > 420);
    });

    // Also fallback window scroll listener for compatibility
    const handleScroll = () => {
      const currentScroll = window.scrollY;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? Math.min(Math.max(currentScroll / maxScroll, 0), 1) : 0;
      setScrollProgress(progress);
      setShowBackToTop(currentScroll > 420);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    if (isDashboardOpen) {
      lenis.stop();
    } else {
      lenis.start();
    }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', handleScroll);
      lenis.destroy();
    };
  }, [isDashboardOpen]);

  // IntersectionObserver to orchestrate smooth scroll-driven reveals across all sections
  useEffect(() => {
    // Small timeout to allow DOM to settle after tab/modal transitions
    const timeout = setTimeout(() => {
      const targets = document.querySelectorAll<HTMLElement>(
        '.reveal-on-scroll, .reveal-from-left, .reveal-from-right, .reveal-scale'
      );

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-revealed');
              observer.unobserve(entry.target);
            }
          });
        },
        {
          threshold: 0.12,
          rootMargin: '0px 0px -40px 0px',
        }
      );

      targets.forEach((target) => {
        // If element is already above the fold, reveal it immediately
        const rect = target.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          target.classList.add('is-revealed');
        } else {
          observer.observe(target);
        }
      });

      return () => observer.disconnect();
    }, 40);

    return () => clearTimeout(timeout);
  }, [dashboardTab]);

  return (
    <div className="flex flex-col bg-[#F5F5F5] min-h-screen selection:bg-black selection:text-white relative">
      {/* Background ambient lighting orbs that softly drift with scroll */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-amber-200/20 via-yellow-100/15 to-transparent blur-3xl will-change-transform animate-ambient-drift"
          style={{ transform: `translateY(${scrollProgress * 140}px)` }}
        />
        <div
          className="absolute top-1/2 -left-48 w-[550px] h-[550px] rounded-full bg-gradient-to-tr from-indigo-200/15 via-purple-100/10 to-transparent blur-3xl will-change-transform"
          style={{ transform: `translateY(-${scrollProgress * 120}px)` }}
        />
      </div>

      {/* Top Gold Scroll Progress Bar with Glowing Laser Tip */}
      <div
        className="fixed top-0 left-0 right-0 h-[2.5px] z-50 pointer-events-none origin-left transition-transform duration-75 ease-out"
        style={{
          transform: `scaleX(${scrollProgress})`,
          background: 'linear-gradient(90deg, #F59E0B 0%, #FBBF24 50%, #D97706 90%, #FFFFFF 100%)',
          boxShadow: '0 0 14px 2px rgba(245, 158, 11, 0.75), 0 0 28px 4px rgba(251, 191, 36, 0.45)',
        }}
        role="progressbar"
        aria-valuenow={Math.round(scrollProgress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      />

      {/* Floating Clear Glassy Navbar: Fixed to viewport, floats along as you scroll */}
      {!isDashboardOpen && (
        <Navbar
          onOpenDashboard={() => setDashboardTab('review')}
          onDocsClick={() => setIsDocsOpen(true)}
          onAccuracyClick={() => setIsAccuracyOpen(true)}
        />
      )}

      {/* Floating Back-to-Top Pill */}
      {!isDashboardOpen && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Scroll to top"
          className={`fixed bottom-6 right-6 z-40 p-3 rounded-full bg-black/85 text-white backdrop-blur-md border border-white/20 shadow-xl transition-all duration-300 hover:bg-black hover:scale-110 active:scale-95 flex items-center justify-center group ${showBackToTop
              ? 'opacity-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 translate-y-4 pointer-events-none'
            }`}
          title="Scroll back to top"
        >
          <svg
            className="w-4 h-4 transition-transform duration-200 group-hover:-translate-y-0.5 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 19V5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
      )}

      {/* Landing page: dimmed and inert while the dashboard is open */}
      <div
        aria-hidden={isDashboardOpen || undefined}
        className={`flex flex-col transition-[transform,opacity,filter] duration-500 ease-out origin-center motion-reduce:transition-none ${isDashboardOpen ? 'scale-[0.985] blur-[1.5px] opacity-70 pointer-events-none' : ''
          }`}
      >
        <div className="h-screen flex flex-col overflow-hidden relative">
          <HeroSection onJoinUs={() => setDashboardTab('runs')} />
        </div>
        <InfoSection
          onDiscover={() => setDashboardTab('values')}
          onOpenAccuracyReport={() => setIsAccuracyOpen(true)}
        />
        <BackedBySection />
        <UseCasesSection onKnowMore={() => setDashboardTab('review')} />
        <Footer
          onOpenDashboard={() => setDashboardTab('review')}
          onOpenRuns={() => setDashboardTab('runs')}
          onOpenAccuracy={() => setIsAccuracyOpen(true)}
          onOpenAudit={() => setDashboardTab('audit')}
          onOpenDocs={() => setIsDocsOpen(true)}
        />
      </div>

      {isDashboardOpen && (
        <FullScreenDashboard onClose={() => setDashboardTab(null)} initialTab={dashboardTab} />
      )}

      <DocsModal
        isOpen={isDocsOpen}
        onClose={() => setIsDocsOpen(false)}
        onOpenDashboard={() => setDashboardTab('review')}
      />
      <AccuracyModal
        isOpen={isAccuracyOpen}
        onClose={() => setIsAccuracyOpen(false)}
        onOpenDashboard={() => setDashboardTab('accuracy')}
      />
    </div>
  );
}

export default App;
