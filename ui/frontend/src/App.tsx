import { useState } from 'react';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { InfoSection } from './components/InfoSection';
import { BackedBySection } from './components/BackedBySection';
import { UseCasesSection } from './components/UseCasesSection';
import { FullScreenDashboard } from './components/FullScreenDashboard';
import { LoginModal } from './components/LoginModal';
import { DocsModal } from './components/DocsModal';
import { AccuracyModal } from './components/AccuracyModal';

export function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isAccuracyOpen, setIsAccuracyOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<'wallet' | 'join' | 'discover' | 'commerce'>('wallet');

  const handleOpenModal = (mode: 'wallet' | 'join' | 'discover' | 'commerce') => {
    setModalMode(mode);
    setIsModalOpen(true);
  };

  const handleLoginSuccess = (user: string) => {
    setIsLoggedIn(true);
    setCurrentUser(user);
    handleOpenModal('wallet');
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
  };

  return (
    <div
      className={`flex flex-col bg-[#F5F5F5] min-h-screen selection:bg-black selection:text-white transition-all duration-300 ease-out origin-center ${
        isModalOpen ? 'scale-[0.985] opacity-75 pointer-events-none filter blur-[0.5px]' : 'scale-100 opacity-100 filter-none'
      }`}
    >
      {/* 1. First Section: Navbar + Hero in h-screen overflow-hidden wrapper */}
      <div className="h-screen flex flex-col overflow-hidden relative">
        <Navbar
          isLoggedIn={isLoggedIn}
          currentUser={currentUser}
          onOpenDashboard={() => handleOpenModal('wallet')}
          onLogout={handleLogout}
          onDocsClick={() => setIsDocsOpen(true)}
          onAccuracyClick={() => setIsAccuracyOpen(true)}
        />
        <HeroSection
          onJoinUs={() => handleOpenModal('wallet')}
        />
      </div>

      {/* 2. Info Section (How it works & Accuracy Card) */}
      <InfoSection
        onDiscover={() => handleOpenModal('discover')}
        onOpenAccuracyReport={() => setIsAccuracyOpen(true)}
      />

      {/* 3. Backed By Section */}
      <BackedBySection />

      {/* 4. Use Cases Section (For auditors) */}
      <UseCasesSection onKnowMore={() => handleOpenModal('commerce')} />

      {/* Login Modal */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Full Screen AuditLoop Reviewer Dashboard & Console */}
      {isModalOpen && (
        <FullScreenDashboard
          onClose={() => setIsModalOpen(false)}
          initialTab={modalMode === 'discover' ? 'accuracy' : modalMode === 'commerce' ? 'runs' : 'review'}
        />
      )}

      {/* Documentation Modal (PS-01 Specifications & API Reference) */}
      <DocsModal
        isOpen={isDocsOpen}
        onClose={() => setIsDocsOpen(false)}
        onOpenDashboard={() => (isLoggedIn ? handleOpenModal('wallet') : setIsLoginOpen(true))}
      />

      {/* Ground-Truth XBRL Accuracy Benchmark Modal */}
      <AccuracyModal
        isOpen={isAccuracyOpen}
        onClose={() => setIsAccuracyOpen(false)}
        onOpenDashboard={() => (isLoggedIn ? handleOpenModal('wallet') : setIsLoginOpen(true))}
      />
    </div>
  );
}

export default App;
