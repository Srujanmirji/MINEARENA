import React, { useState, useEffect } from 'react';
import { LogoIcon } from './LogoIcon';
import { Menu, X } from 'lucide-react';

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
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
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
    <nav
      className={`fixed top-0 left-0 right-0 z-30 transition-all duration-200 px-6 ${
        scrolled
          ? 'py-3.5 bg-[#F5F5F5]/90 backdrop-blur-md shadow-xs border-b border-black/5'
          : 'py-5 bg-transparent'
      }`}
    >
      <div className="max-w-[88rem] mx-auto flex items-center justify-between">
        {/* Left: Logo & Brand */}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex items-center gap-2.5 group"
        >
          <LogoIcon className="w-7 h-7 text-black transition-transform duration-300 group-hover:scale-105" />
          <span className="text-2xl font-medium tracking-tight text-black">AuditLoop</span>
        </a>

        {/* Center: Links (How it works · Accuracy · For auditors · Docs) */}
        <div className="hidden md:flex items-center gap-8 text-base text-gray-700 font-medium">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              onClick={(e) => handleLinkClick(e, link.name)}
              className="text-gray-700 hover:text-black font-medium transition-colors duration-200 cursor-pointer"
            >
              {link.name}
            </a>
          ))}
        </div>

        {/* Right: Action pill button (Log in when logged out, Open dashboard when logged in) */}
        <div className="flex items-center gap-3">
          {isLoggedIn && currentUser && (
            <span
              onClick={onLogout}
              title="Click to sign out"
              className="hidden lg:inline-flex items-center text-xs font-medium text-black/60 bg-black/5 hover:bg-black/10 px-3 py-1.5 rounded-full cursor-pointer transition-colors"
            >
              👤 {currentUser.split(' ')[0]} (Sign out)
            </span>
          )}

          <button
            type="button"
            onClick={handleActionClick}
            className="bg-black text-white text-base font-medium px-7 py-2.5 rounded-full hover:bg-gray-800 transition-colors duration-200 shadow-sm active:scale-[0.98]"
          >
            Open dashboard
          </button>

          {/* Mobile hamburger toggle (only visible below md) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-full text-black hover:bg-black/5 transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="md:hidden mt-3 mx-auto max-w-[88rem] bg-white/95 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-black/5 flex flex-col gap-4">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              onClick={(e) => handleLinkClick(e, link.name)}
              className="text-gray-800 hover:text-black text-lg font-medium py-1 transition-colors cursor-pointer"
            >
              {link.name}
            </a>
          ))}
          {isLoggedIn && currentUser && (
            <div className="text-xs text-black/60 py-1">
              Signed in as: <strong className="text-black">{currentUser}</strong>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              handleActionClick();
            }}
            className="w-full mt-2 bg-black text-white text-base font-medium py-3 rounded-full hover:bg-gray-800 transition-colors"
          >
            Open dashboard
          </button>
        </div>
      )}
    </nav>
  );
};
