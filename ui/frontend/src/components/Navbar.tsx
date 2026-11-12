import React, { useState, useEffect } from 'react';
import { LogoIcon } from './LogoIcon';
import { Menu, X, ArrowRight } from 'lucide-react';

interface NavbarProps {
  isLoggedIn?: boolean;
  currentUser?: string | null;
  onLoginClick?: () => void;
  onOpenDashboard?: () => void;
  onLogout?: () => void;
  onDocsClick?: () => void;
  onAccuracyClick?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  isLoggedIn = false,
  currentUser,
  onOpenDashboard,
  onLogout,
  onDocsClick,
  onAccuracyClick,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setScrolled(window.scrollY > 35);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'How it works', href: '#how-it-works' },
    { name: 'Accuracy', href: '#accuracy' },
    { name: 'For auditors', href: '#for-auditors' },
    { name: 'Docs', href: '#docs' },
  ];

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, linkName: string) => {
    e.preventDefault();
    setMobileMenuOpen(false);

    if (linkName === 'Docs') {
      onDocsClick?.();
      return;
    }

    if (linkName === 'Accuracy') {
      const el = document.getElementById('accuracy');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
      onAccuracyClick?.();
      return;
    }

    if (linkName === 'How it works') {
      const el = document.getElementById('how-it-works');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }

    if (linkName === 'For auditors') {
      const el = document.getElementById('for-auditors');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }
  };

  const handleActionClick = () => {
    onOpenDashboard?.();
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-40 pointer-events-none transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] px-3 sm:px-6 pt-3 sm:pt-4">
      {/* Centered Clear Liquid Glass Capsule: Dynamically reduces width on scroll */}
      <div
        className={`pointer-events-auto mx-auto rounded-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] relative overflow-hidden ${
          scrolled
            ? 'w-[96%] sm:w-[90%] md:w-[82%] lg:max-w-4xl py-2 px-4 sm:px-6 bg-white/[0.30] backdrop-blur-2xl backdrop-saturate-[190%] border border-white/60 shadow-[0_20px_45px_-10px_rgba(0,0,0,0.12),0_4px_16px_rgba(0,0,0,0.04),inset_0_1.5px_2px_rgba(255,255,255,0.95),inset_0_-1px_1px_rgba(255,255,255,0.3)]'
            : 'w-full max-w-[88rem] py-3 px-5 sm:px-8 bg-white/[0.18] backdrop-blur-xl backdrop-saturate-[160%] border border-white/45 shadow-[0_8px_32px_rgba(0,0,0,0.05),inset_0_1.5px_1px_rgba(255,255,255,0.85),inset_0_-1px_1px_rgba(255,255,255,0.2)]'
        }`}
      >
        {/* Specular Liquid Glass Sheen across the curved top edge */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/45 via-white/10 to-transparent pointer-events-none" />

        <div className="relative z-10 flex items-center justify-between gap-3">
          {/* Left: Brand Icon + Title */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center gap-2.5 group cursor-pointer"
            >
              <div className="p-1 rounded-lg bg-black/5 backdrop-blur-xs group-hover:bg-black/10 transition-colors">
                <LogoIcon className="w-6 h-6 sm:w-7 sm:h-7 text-black transition-transform duration-300 group-hover:scale-110" />
              </div>
              <span className="text-lg sm:text-xl font-semibold tracking-tight text-black">
                AuditLoop
              </span>
            </a>
          </div>

          {/* Center: Frosted Glass Nav Links Track */}
          <nav className="hidden md:flex items-center gap-1 bg-black/[0.04] backdrop-blur-xs p-1 rounded-full border border-white/40 shadow-[inset_0_1px_1px_rgba(0,0,0,0.04)]">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={(e) => handleLinkClick(e, link.name)}
                className={`text-xs sm:text-sm font-medium text-black/75 hover:text-black hover:bg-white/80 active:bg-white/95 rounded-full transition-all duration-200 cursor-pointer shadow-none hover:shadow-xs ${
                  scrolled ? 'px-3 py-1' : 'px-4 py-1.5'
                }`}
              >
                {link.name}
              </a>
            ))}
          </nav>

          {/* Right: User / Action Button */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {isLoggedIn && currentUser && (
              <span
                onClick={onLogout}
                title="Click to sign out"
                className="hidden xl:inline-flex items-center text-xs font-medium text-black/60 bg-black/5 hover:bg-black/10 px-3 py-1.5 rounded-full cursor-pointer transition-colors"
              >
                👤 {currentUser.split(' ')[0]} (Sign out)
              </span>
            )}

            <button
              type="button"
              onClick={handleActionClick}
              className={`inline-flex items-center gap-2 bg-black/90 hover:bg-black text-white text-xs sm:text-sm font-medium rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.3)] hover:shadow-[0_6px_22px_rgba(0,0,0,0.3)] active:scale-95 transition-all duration-300 group ${
                scrolled
                  ? 'pl-3.5 sm:pl-4 pr-1.5 sm:pr-2 py-1 sm:py-1.5'
                  : 'pl-4 sm:pl-5 pr-2 sm:pr-2.5 py-1.5 sm:py-2'
              }`}
            >
              <span>Open dashboard</span>
              <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/20 group-hover:bg-white/30 flex items-center justify-center transition-colors">
                <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
            </button>

            {/* Mobile hamburger toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-full text-black bg-black/5 hover:bg-black/10 transition-colors"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu with matching clear liquid glass */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-3 pt-3 border-t border-black/5 flex flex-col gap-2">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={(e) => handleLinkClick(e, link.name)}
                className="text-gray-800 hover:text-black text-base font-medium py-1.5 px-3 rounded-xl hover:bg-black/5 transition-colors cursor-pointer"
              >
                {link.name}
              </a>
            ))}
            {isLoggedIn && currentUser && (
              <div className="text-xs text-black/60 px-3 py-1">
                Signed in as: <strong className="text-black">{currentUser}</strong>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
