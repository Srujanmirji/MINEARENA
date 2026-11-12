import { useState } from 'react';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { InfoSection } from './components/InfoSection';
import { BackedBySection } from './components/BackedBySection';
import { UseCasesSection } from './components/UseCasesSection';
import { FullScreenDashboard, type DashboardTab } from './components/FullScreenDashboard';
import { DocsModal } from './components/DocsModal';
import { AccuracyModal } from './components/AccuracyModal';

export function App() {
  // null = landing page; otherwise the dashboard is open on that tab.
  const [dashboardTab, setDashboardTab] = useState<DashboardTab | null>(null);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isAccuracyOpen, setIsAccuracyOpen] = useState(false);
  const isDashboardOpen = dashboardTab !== null;

  return (
    <div className="flex flex-col bg-[#F5F5F5] min-h-screen selection:bg-black selection:text-white">
      {/* Landing page: dimmed and inert while the dashboard is open */}
      <div
        aria-hidden={isDashboardOpen || undefined}
        className={`flex flex-col transition-[transform,opacity,filter] duration-500 ease-out origin-center motion-reduce:transition-none ${
          isDashboardOpen ? 'scale-[0.985] blur-[1.5px] opacity-70 pointer-events-none' : 'scale-100 blur-0 opacity-100'
        }`}
      >
        <div className="h-screen flex flex-col overflow-hidden relative">
          <Navbar
            onOpenDashboard={() => setDashboardTab('review')}
            onDocsClick={() => setIsDocsOpen(true)}
            onAccuracyClick={() => setIsAccuracyOpen(true)}
          />
          <HeroSection onJoinUs={() => setDashboardTab('runs')} />
        </div>
        <InfoSection
          onDiscover={() => setDashboardTab('values')}
          onOpenAccuracyReport={() => setIsAccuracyOpen(true)}
        />
        <BackedBySection />
        <UseCasesSection onKnowMore={() => setDashboardTab('review')} />
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
