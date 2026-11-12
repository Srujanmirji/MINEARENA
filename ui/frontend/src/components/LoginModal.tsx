import React from 'react';
import { X } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess?: (user: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#030712] w-screen h-screen flex flex-col overflow-hidden animate-in fade-in duration-200">
      {/* Return / Close Floating Pill */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        <a
          href="/login.html"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white/10 hover:bg-white/20 text-white/80 hover:text-white px-3.5 py-1.5 rounded-full text-xs font-medium backdrop-blur-md border border-white/10 transition-colors"
        >
          Open standalone ↗
        </a>
        <button
          type="button"
          onClick={onClose}
          className="bg-white/10 hover:bg-white/20 text-white/80 hover:text-white p-2 rounded-full backdrop-blur-md border border-white/10 transition-colors"
          title="Return to site"
          aria-label="Close sign-in"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Embedded Keylight Sign-In Page */}
      <iframe
        src="/login.html"
        className="w-full h-full border-0 flex-1 bg-[#030712]"
        title="Keylight Sign In"
      />
    </div>
  );
};
