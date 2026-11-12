import React, { useState } from 'react';
import { X, Layers, CheckCircle2, Shield, Code, Cpu, ArrowRight } from 'lucide-react';
import { LogoIcon } from './LogoIcon';

interface DocsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDashboard?: () => void;
}

type TabType = 'overview' | 'metrics' | 'invariants' | 'confidence' | 'api';

export const DocsModal: React.FC<DocsModalProps> = ({
  isOpen,
  onClose,
  onOpenDashboard,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-black/5 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-black/5 bg-[#FBFBFB]">
          <div className="flex items-center gap-3">
            <LogoIcon className="w-6 h-6 text-black" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-medium tracking-tight text-black">AuditLoop Documentation</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-black/5 text-black/70 font-medium">
                  PS-01 Spec v1.0
                </span>
              </div>
              <p className="text-xs text-black/50">Human-in-the-Loop Financial Filing Auditor Agent</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-black/50 hover:text-black hover:bg-black/5 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-7 py-3 border-b border-black/5 bg-white overflow-x-auto">
          {[
            { id: 'overview' as const, label: 'Overview & Architecture', icon: Cpu },
            { id: 'metrics' as const, label: '8 Core Metrics', icon: Layers },
            { id: 'invariants' as const, label: 'Validation Invariants', icon: CheckCircle2 },
            { id: 'confidence' as const, label: 'Confidence Rubric', icon: Shield },
            { id: 'api' as const, label: 'REST API', icon: Code },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs md:text-sm font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-black text-white shadow-xs'
                    : 'text-black/60 hover:text-black hover:bg-black/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content (Scrollable) */}
        <div className="p-7 overflow-y-auto flex-1 space-y-6 text-sm text-black/80 leading-relaxed">
          {/* Tab 1: Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-lg font-medium text-black mb-2">Autonomous Filing Audit Pipeline</h4>
                <p className="text-black/70 leading-relaxed">
                  AuditLoop is an intelligent agent designed for audit teams and regulatory compliance. It fetches official SEC Form 10-K filings, reads the primary financial statements with two independent extractors (a pandas table parser and an LLM), calculates multi-part confidence scores, validates invariant accounting equations, and escalates anomalies to a verified human review queue.
                </p>
              </div>

              {/* 7 Core Pipeline Modules */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {[
                  {
                    step: '1. Ingestion',
                    title: 'SEC EDGAR Integration',
                    desc: 'Direct retrieval of raw 10-K filings with company CIK lookup and automated primary statement extraction (balance sheet, income statement, cash flows).',
                  },
                  {
                    step: '2. Extraction',
                    title: 'Dual-Pass Extraction',
                    desc: 'Deterministic pandas table parser cross-checked with an LLM extractor; an LLM answer is rejected unless its source row appears word-for-word in the table.',
                  },
                  {
                    step: '3. Scoring',
                    title: 'Confidence Scoring Rubric',
                    desc: 'Four-factor confidence score (Agreement, Label clarity, Period match, Invariant validation) evaluated between 0.00 and 1.00.',
                  },
                  {
                    step: '4. Validation',
                    title: 'Invariant Checking',
                    desc: 'Automatic verification of mathematical and accounting invariants (Assets = Liabilities + Equity, YoY percentage shifts, segment sums).',
                  },
                  {
                    step: '5. HITL Review',
                    title: 'Human-in-the-Loop Escalation',
                    desc: 'Low-confidence (< 0.85) or failed-invariant items route to human reviewer with side-by-side evidence, parser vs LLM diff, and highlighted 10-K source row.',
                  },
                  {
                    step: '6. Verification',
                    title: 'XBRL Ground-Truth Comparison',
                    desc: 'Automated verification against the SEC EDGAR XBRL Company Facts API (data.sec.gov/api/xbrl/companyfacts).',
                  },
                  {
                    step: '7. Audit Trail',
                    title: 'Append-Only Audit Log',
                    desc: 'Immutable record of every human decision (approvals, corrections with typed justification, rejections) stored with run metadata.',
                  },
                  {
                    step: '8. Persistence',
                    title: 'Workflow State Machine',
                    desc: 'Audit runs can pause awaiting human review and resume seamlessly without duplicating completed extraction steps.',
                  },
                ].map((item, idx) => (
                  <div key={idx} className="bg-[#F8F8F8] border border-black/5 rounded-2xl p-4">
                    <span className="text-[11px] font-semibold text-black/50 uppercase tracking-wider">
                      {item.step}
                    </span>
                    <h5 className="font-semibold text-black mt-1 mb-1">{item.title}</h5>
                    <p className="text-xs text-black/60 leading-normal">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 2: 8 Financial Metrics */}
          {activeTab === 'metrics' && (
            <div className="space-y-5">
              <div>
                <h4 className="text-lg font-medium text-black mb-1">Standardized Financial Metrics (US GAAP)</h4>
                <p className="text-black/70 text-xs">
                  AuditLoop extracts a minimum of 8 core metrics per 10-K filing across all primary financial statements.
                </p>
              </div>

              <div className="overflow-x-auto border border-black/5 rounded-2xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-black/5 text-black font-semibold border-b border-black/5">
                      <th className="p-3">Metric Name</th>
                      <th className="p-3">US GAAP XBRL Tag</th>
                      <th className="p-3">Primary Statement</th>
                      <th className="p-3">Standard Unit</th>
                      <th className="p-3">Invariants</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 bg-white">
                    {[
                      {
                        name: 'Revenue / Net Sales',
                        tag: 'us-gaap:Revenues, us-gaap:SalesRevenueNet',
                        statement: 'Income Statement',
                        unit: 'USD (Millions)',
                        rule: 'Revenue > 0; YoY change ≤ 40%; segments sum to total',
                      },
                      {
                        name: 'Net Income / (Loss)',
                        tag: 'us-gaap:NetIncomeLoss',
                        statement: 'Income Statement',
                        unit: 'USD (Millions)',
                        rule: 'Net Income ≤ Revenue',
                      },
                      {
                        name: 'Operating Income',
                        tag: 'us-gaap:OperatingIncomeLoss',
                        statement: 'Income Statement',
                        unit: 'USD (Millions)',
                        rule: 'Gross Profit - OpEx',
                      },
                      {
                        name: 'Gross Profit',
                        tag: 'us-gaap:GrossProfit',
                        statement: 'Income Statement',
                        unit: 'USD (Millions)',
                        rule: 'Revenue - Cost of Goods Sold',
                      },
                      {
                        name: 'Total Assets',
                        tag: 'us-gaap:Assets',
                        statement: 'Balance Sheet',
                        unit: 'USD (Millions)',
                        rule: 'Assets = Liabilities + Equity',
                      },
                      {
                        name: 'Total Liabilities',
                        tag: 'us-gaap:Liabilities',
                        statement: 'Balance Sheet',
                        unit: 'USD (Millions)',
                        rule: 'Liabilities = Assets - Equity',
                      },
                      {
                        name: "Stockholders' Equity",
                        tag: 'us-gaap:StockholdersEquity',
                        statement: 'Balance Sheet',
                        unit: 'USD (Millions)',
                        rule: 'Equity = Assets - Liabilities',
                      },
                      {
                        name: 'Operating Cash Flow',
                        tag: 'us-gaap:NetCashProvidedByUsedInOperatingActivities',
                        statement: 'Cash Flow Statement',
                        unit: 'USD (Millions)',
                        rule: 'Operating Cash Flow sign check',
                      },
                    ].map((m, idx) => (
                      <tr key={idx} className="hover:bg-black/[0.02] transition-colors">
                        <td className="p-3 font-semibold text-black">{m.name}</td>
                        <td className="p-3 font-mono text-[11px] text-black/70">{m.tag}</td>
                        <td className="p-3 text-black/60">{m.statement}</td>
                        <td className="p-3 text-black/60">{m.unit}</td>
                        <td className="p-3 text-emerald-700 font-medium">{m.rule}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 3: Validation Invariants */}
          {activeTab === 'invariants' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-lg font-medium text-black mb-1">Financial Validation Invariants</h4>
                <p className="text-black/70 text-xs">
                  Every extraction run automatically verifies mathematical identities. A violation lowers the confidence score and immediately flags the value for human review.
                </p>
              </div>

              <div className="space-y-4">
                <div className="bg-[#F8F8F8] border border-black/5 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-black text-base">1. Fundamental Accounting Equation</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                      Strict Invariant
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-black/5 font-mono text-sm font-semibold text-black mb-2">
                    Total Assets == Total Liabilities + Stockholders' Equity
                  </div>
                  <p className="text-xs text-black/60">
                    Tolerance: 0.5% of total assets. If it fails, total assets, total liabilities and equity all escalate to human review (hard check), with a note when equity may exclude noncontrolling interest.
                  </p>
                </div>

                <div className="bg-[#F8F8F8] border border-black/5 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-black text-base">2. Segment Sum</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                      Hard, when available
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-black/5 font-mono text-sm font-semibold text-black mb-2">
                    &Sigma; segment revenue == Total revenue (&plusmn;0.5%)
                  </div>
                  <p className="text-xs text-black/60">
                    Uses the filing&apos;s segment note. Shown as N/A when no clear revenue-by-segment table exists, never as a fake pass. Scale sanity (~1,000&times; prior year) and sign checks (revenue, assets, liabilities &gt; 0) also run.
                  </p>
                </div>

                <div className="bg-[#F8F8F8] border border-black/5 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-black text-base">3. Year-over-Year (YoY) Anomaly Detection</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                      Heuristic Guardrail
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-black/5 font-mono text-sm font-semibold text-black mb-2">
                    |Value(FY) - Value(FY-1)| / |Value(FY-1)| &le; 0.40
                  </div>
                  <p className="text-xs text-black/60">
                    Changes greater than 40% year-on-year are flagged as anomalies (soft check) and sent to human review, e.g. NVIDIA&apos;s revenue growth. The limit is configurable.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Confidence Rubric */}
          {activeTab === 'confidence' && (
            <div className="space-y-6">
              <div>
                <h4 className="text-lg font-medium text-black mb-1">Multi-Factor Confidence Scoring Rubric</h4>
                <p className="text-black/70 text-xs">
                  Confidence scores determine whether a financial extraction is accepted automatically or routed to human review.
                </p>
              </div>

              <div className="bg-black text-white rounded-2xl p-5 shadow-sm">
                <div className="text-xs text-white/60 mb-1 uppercase tracking-wider font-semibold">
                  Scoring Formula
                </div>
                <div className="text-base md:text-lg font-mono font-medium">
                  Confidence = (0.40 &times; A) + (0.20 &times; L) + (0.20 &times; P) + (0.20 &times; V)
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {[
                  {
                    factor: 'A: Agreement (45%)',
                    desc: 'Do the two independent extractors (pandas table parser and LLM) agree? Within one table unit = 1.0; one of them has no answer = 0.5; different numbers = 0.0.',
                  },
                  {
                    factor: 'L: Label Match (30%)',
                    desc: 'Fuzzy match (rapidfuzz ratio) between the 10-K row label and known names for the metric. Below 0.80 always goes to a human, whatever the score.',
                  },
                  {
                    factor: 'P: Period & Unit (25%)',
                    desc: 'Right fiscal period and a detected scale ("in millions"). Both = 1.0; one = 0.5.',
                  },
                  {
                    factor: 'Validation is separate',
                    desc: 'Accounting checks answer "does it make sense?", not "did we read it right?". Any failed check escalates, whatever the score. Derived values are capped at 0.75.',
                  },
                ].map((item, idx) => (
                  <div key={idx} className="bg-[#F8F8F8] border border-black/5 rounded-2xl p-4">
                    <span className="font-semibold text-black text-sm block mb-1">{item.factor}</span>
                    <p className="text-xs text-black/60 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 text-xs text-amber-900 leading-relaxed">
                <strong>Threshold Gate:</strong> A value is <em>AUTO-APPROVED</em> only if it exists, scores &ge; 0.85 (configurable), its label match is &ge; 0.80 and no validation check failed. Anything else pauses the workflow and escalates to the review queue with the reason.
              </div>
            </div>
          )}

          {/* Tab 5: REST API Reference */}
          {activeTab === 'api' && (
            <div className="space-y-5">
              <div>
                <h4 className="text-lg font-medium text-black mb-1">REST API Reference (OpenAPI Compliant)</h4>
                <p className="text-black/70 text-xs">
                  All 15 endpoints powering the backend audit agent pipeline and frontend review console.
                </p>
              </div>

              <div className="space-y-3 font-mono text-xs">
                {[
                  { method: 'POST', path: '/runs', desc: 'Trigger a new audit run for ticker and fiscal year' },
                  { method: 'GET', path: '/runs/{id}', desc: 'Poll run status (queued, parsing, validating, complete)' },
                  { method: 'GET', path: '/runs/{id}/values', desc: 'Retrieve all 8 extracted financial values and confidence breakdown' },
                  { method: 'GET', path: '/runs/{id}/source/{value_id}', desc: 'Fetch source 10-K table HTML snippet with highlighted row (<tr class="hl">)' },
                  { method: 'GET', path: '/pending', desc: 'Get review queue of escalated values requiring human reviewer sign-off' },
                  { method: 'POST', path: '/decisions', desc: 'Submit human decision (approve, correct with value, or reject with reason)' },
                  { method: 'GET', path: '/report', desc: 'Get SEC XBRL ground-truth benchmark accuracy report' },
                  { method: 'GET', path: '/audit-log', desc: 'Append-only tamper-evident log of all human reviewer decisions' },
                ].map((ep, idx) => (
                  <div key={idx} className="bg-[#F8F8F8] border border-black/5 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        ep.method === 'POST' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {ep.method}
                      </span>
                      <span className="font-semibold text-black">{ep.path}</span>
                    </div>
                    <span className="text-black/60 font-sans text-xs">{ep.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-7 py-4 border-t border-black/5 bg-[#FBFBFB] flex items-center justify-between">
          <div className="text-xs text-black/50">
            SEC EDGAR &bull; US GAAP XBRL &bull; Human-in-the-Loop Audit Protocol
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-full text-xs font-medium text-black/70 hover:text-black hover:bg-black/5 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenDashboard?.();
              }}
              className="inline-flex items-center gap-2 bg-black text-white text-xs font-medium px-5 py-2 rounded-full hover:bg-gray-800 transition-colors shadow-xs"
            >
              <span>Open Review Console</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
