import { AgentDashboard } from '@/components/agents/AgentDashboard';
import { ProductTour } from '@/components/tour/ProductTour';
import { LoginForm } from '@/components/auth/LoginForm';
import { SignupForm } from '@/components/auth/SignupForm';
import { ChatHome } from '@/components/chat/ChatHome';
import { HelpPanel } from '@/components/help/HelpPanel';
import { MainLayout } from '@/components/layout/MainLayout';
import { ModuleDetail } from '@/components/modules/ModuleDetail';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { dashboardData } from '@/data/dashboardData';
import { BRAND } from '@/lib/brand';
import type { Conversation } from '@/types/chat';
import { useEffect, useState } from 'react';
import './App.css';

// ── Composio OAuth popup callback ────────────────────────────────────────────
// When Composio redirects back to /settings?connected=xxx inside the popup,
// post a message to the opener and close the popup immediately.
if (window.opener && window.location.search.includes('connected=')) {
  const params = new URLSearchParams(window.location.search)
  const connectorId = params.get('connected')
  try { window.opener.postMessage({ type: 'composio_oauth_success', connectorId }, window.location.origin) } catch {}
  window.close()
}

// Update document title based on current view
function updateDocumentTitle(selectedModule: string | null) {
  if (selectedModule === 'home') {
    document.title = `Home - ${BRAND.titleSuffix}`;
    return;
  }
  if (selectedModule === 'dashboard') {
    document.title = `AI Team Dashboard - ${BRAND.titleSuffix}`;
    return;
  }
  if (selectedModule === 'settings' || selectedModule === 'settings-accounts') {
    document.title = `Settings - ${BRAND.titleSuffix}`;
  } else if (selectedModule === 'help') {
    document.title = `Help & Support - ${BRAND.titleSuffix}`;
  } else if (selectedModule) {
    const module = dashboardData.modules.find(m => m.id === selectedModule);
    document.title = module ? `${module.name} - ${BRAND.titleSuffix}` : `${BRAND.titleSuffix} - ${BRAND.platformTagline}`;
  } else {
    document.title = `${BRAND.titleSuffix} - ${BRAND.platformTagline}`;
  }
}

function ensureFavicon() {
  let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = BRAND.faviconSrc;
}

function AuthScreen() {
  const [isSignup, setIsSignup] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
      {isSignup ? (
        <SignupForm onToggleMode={() => setIsSignup(false)} />
      ) : (
        <LoginForm onToggleMode={() => setIsSignup(true)} />
      )}
    </div>
  );
}

function Dashboard() {
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [autoStartModule, setAutoStartModule] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    try {
      const raw = localStorage.getItem('marqq_conversations');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return parsed.map((c: { id: string; name: string; createdAt: string; lastMessageAt: string; messages: Array<{ id: string; content: string; sender: 'user' | 'ai'; timestamp: string }> }) => ({
        ...c,
        createdAt: new Date(c.createdAt),
        lastMessageAt: new Date(c.lastMessageAt),
        messages: c.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) })),
      }));
    } catch { return []; }
  });
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const handleConversationsChange = () => {
    try {
      const raw = localStorage.getItem('marqq_conversations');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setConversations(parsed.map((c: { id: string; name: string; createdAt: string; lastMessageAt: string; messages: Array<{ id: string; content: string; sender: 'user' | 'ai'; timestamp: string }> }) => ({
        ...c,
        createdAt: new Date(c.createdAt),
        lastMessageAt: new Date(c.lastMessageAt),
        messages: c.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) })),
      })));
    } catch { /* ignore */ }
  };

  const handleModuleSelect = (moduleId: string | null) => {
    setSelectedModule(moduleId);
    updateDocumentTitle(moduleId);
    // Check if this was triggered by a slash command (indicated by URL hash)
    if (window.location.hash === '#auto-start') {
      setAutoStartModule(true);
      // Clear the hash
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  // Reset auto-start after module change
  useEffect(() => {
    if (autoStartModule) {
      setTimeout(() => setAutoStartModule(false), 1000);
    }
  }, [selectedModule]);

  // Set initial document title
  useEffect(() => {
    updateDocumentTitle(selectedModule);
    ensureFavicon();
  }, [selectedModule]);

  const currentModule = selectedModule
    ? dashboardData.modules.find(m => m.id === selectedModule)
    : null;

  const renderContent = () => {
    // Home and default both show ChatHome
    if (!selectedModule || selectedModule === 'home') {
      return (
        <ChatHome
          onModuleSelect={handleModuleSelect}
          activeConversationId={activeConversationId}
          onConversationsChange={handleConversationsChange}
        />
      );
    }

    if (selectedModule === 'settings') return <SettingsPanel />;
    if (selectedModule === 'settings-accounts') return <SettingsPanel initialTab="accounts" />;
    if (selectedModule === 'help') return <HelpPanel />;
    if (selectedModule === 'dashboard') return <AgentDashboard />;

    if (currentModule) {
      return (
        <ModuleDetail
          module={currentModule}
          onBack={() => setSelectedModule(null)}
          onModuleSelect={handleModuleSelect}
          autoStart={autoStartModule}
        />
      );
    }

    // Fallback
    return (
      <ChatHome
        onModuleSelect={handleModuleSelect}
        onConversationsChange={handleConversationsChange}
      />
    );
  };

  return (
    <MainLayout
      selectedModule={selectedModule}
      onModuleSelect={handleModuleSelect}
      conversations={conversations}
      activeConversationId={activeConversationId}
      onConversationSelect={(id) => {
        setActiveConversationId(id);
        setSelectedModule('home');
      }}
    >
      {renderContent()}
    </MainLayout>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const [isOnboarded, setIsOnboarded] = useState(() => localStorage.getItem('marqq_onboarded') === '1');
  const [showTour, setShowTour] = useState(() => localStorage.getItem('marqq_tour_done') !== '1');

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <LoadingSpinner size="lg" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated && !isOnboarded) {
    return (
      <OnboardingFlow
        onComplete={() => {
          setIsOnboarded(true);
          setShowTour(true);
        }}
      />
    );
  }

  return isAuthenticated ? (
    <>
      <Dashboard />
      {showTour && <ProductTour onDone={() => setShowTour(false)} />}
    </>
  ) : <AuthScreen />;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <AppContent />
          <Toaster richColors position="top-right" />
        </WorkspaceProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
