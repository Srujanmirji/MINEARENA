import React, { useState } from 'react';
import { X, CheckCircle2, Shield, ArrowUpRight, Copy, Check } from 'lucide-react';
import { LogoIcon } from './LogoIcon';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'wallet' | 'join' | 'discover' | 'commerce';
}

export const WalletModal: React.FC<WalletModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'wallet',
}) => {
  const [copied, setCopied] = useState(false);
  const [depositAmount, setDepositAmount] = useState('10,000');
  const [connected, setConnected] = useState(false);

  if (!isOpen) return null;

  const numericMetric = parseFloat(depositAmount.replace(/,/g, '')) || 391035;
  const varianceFormatted = (Math.abs(numericMetric - 383285) / 383285 * 100).toFixed(2);

  const handleCopy = () => {
    navigator.clipboard?.writeText('0x892a0138cf00d8A47900bE2399d3eF1');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity duration-200">
      <div className="relative w-full max-w-md bg-white rounded-3xl p-7 shadow-2xl border border-black/5 transform transition-all duration-300">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full text-black/50 hover:text-black hover:bg-black/5 transition-colors"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-2.5 mb-6">
          <LogoIcon className="w-6 h-6 text-black" />
          <span className="text-xl font-medium tracking-tight text-black">AuditLoop</span>
          <span className="ml-auto text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium border border-emerald-200/60 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            SEC EDGAR Active
          </span>
        </div>

        {/* Dynamic Content based on state */}
        {!connected ? (
          <div>
            <h3 className="text-2xl font-medium text-black mb-2 tracking-tight">
              {initialMode === 'join' ? 'Pending Human Review' : 'Review Queue'}
            </h3>
            <p className="text-black/60 text-sm mb-6 leading-relaxed">
              Inspect flagged Form 10-K extractions with confidence scores below the 0.85 threshold.
            </p>

            {/* Metric Inspector Preview */}
            <div className="bg-[#F5F5F5] rounded-2xl p-4 mb-6">
              <div className="flex items-center justify-between text-xs text-black/60 mb-2 font-medium">
                <span>FLAGGED 10-K EXTRACTION</span>
                <span className="text-black font-semibold">Confidence: 0.72</span>
              </div>
              <div className="flex items-center justify-between bg-white rounded-xl px-3 py-2 border border-black/5 mb-3">
                <span className="text-sm text-black/40 font-medium">$</span>
                <input
                  type="text"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full text-right text-base font-semibold text-black focus:outline-none"
                  placeholder="391,035"
                />
                <span className="ml-2 text-xs font-medium text-black/60">USD M</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-black/5">
                <div>
                  <div className="text-black/50">Equation Invariant</div>
                  <div className="text-sm font-semibold text-emerald-600 mt-0.5">
                    Assets = L + E (Pass)
                  </div>
                </div>
                <div>
                  <div className="text-black/50">YoY Variance</div>
                  <div className="text-sm font-semibold text-black mt-0.5">
                    +{varianceFormatted}% (Normal)
                  </div>
                </div>
              </div>
            </div>

            {/* Review Action Options */}
            <div className="space-y-2 mb-6">
              <button
                type="button"
                onClick={() => setConnected(true)}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-black/10 hover:border-black/30 hover:bg-black/5 transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center font-bold text-emerald-700 text-xs">
                    ✓
                  </div>
                  <div>
                    <div className="text-sm font-medium text-black">Approve Source Citation</div>
                    <div className="text-xs text-black/50">Verified row: 'Total net sales' (Item 8)</div>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-black/40 group-hover:text-black group-hover:translate-x-0.5 transition-all" />
              </button>

              <button
                type="button"
                onClick={() => setConnected(true)}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-black/10 hover:border-black/30 hover:bg-black/5 transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center font-bold text-blue-600 text-xs">
                    ⚖️
                  </div>
                  <div>
                    <div className="text-sm font-medium text-black">Reconcile With XBRL Facts</div>
                    <div className="text-xs text-black/50">Cross-reference SEC Company Facts API</div>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-black/40 group-hover:text-black group-hover:translate-x-0.5 transition-all" />
              </button>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-black/50">
              <Shield className="w-3.5 h-3.5 text-black/60" />
              <span>Append-only audit trail · SHA-256 hash-chained reviews</span>
            </div>
          </div>
        ) : (
          <div className="text-center py-2">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-medium text-black mb-1 tracking-tight">Extraction Verified</h3>
            <p className="text-sm text-black/60 mb-6">
              Auditor decision committed to the append-only log with hash checkpoint.
            </p>

            <div className="bg-[#F5F5F5] rounded-2xl p-5 mb-6 text-left">
              <div className="text-xs text-black/50 uppercase tracking-wider mb-1">Audited Metric Committed</div>
              <div className="text-3xl font-medium text-black tracking-tight mb-3">
                $391,035 <span className="text-sm font-normal text-black/50">USD M (AAPL)</span>
              </div>
              <div className="flex items-center justify-between text-xs pt-3 border-t border-black/10">
                <span className="text-black/60">XBRL Verification</span>
                <span className="text-emerald-600 font-medium">100% Ground Truth Match</span>
              </div>
            </div>

            {/* Smart Contract / Hash chain snippet */}
            <div className="flex items-center justify-between bg-black/5 rounded-xl px-3 py-2 text-xs text-black/70 mb-6 font-mono">
              <span>sha256:7f83b...e4a1</span>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 text-black hover:text-black/70 transition-colors font-sans"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Hash'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full bg-black text-white text-base font-medium py-3 rounded-full hover:bg-gray-800 transition-colors"
            >
              Return to Overview
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

