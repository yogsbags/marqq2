import { AgentDashboard } from '@/components/agents/AgentDashboard';
import { ChatHome } from '@/components/chat/ChatHome';
import { ChatSessionsPage } from '@/components/chat/ChatSessionsPage';
import { ScheduledJobsPage } from '@/components/tasks/ScheduledJobsPage';
import { ProfilePage } from '@/components/profile/ProfilePage';
import { IntegrationsHub } from '@/components/integrations/IntegrationsHub';
import { HomePostOnboardingTour } from '@/components/tour/HomePostOnboardingTour';
import { InviteAccept } from '@/components/auth/InviteAccept';
import { LoginForm } from '@/components/auth/LoginForm';
import { SignupForm } from '@/components/auth/SignupForm';
import { HelpPanel } from '@/components/help/HelpPanel';
import { HomeView } from '@/components/home/HomeView';
import { LibraryView } from '@/components/library/LibraryView';
import { MarketingCalendarPage } from '@/components/calendar/MarketingCalendarPage';
import { MainLayout } from '@/components/layout/MainLayout';
import { ModuleDetail } from '@/components/modules/ModuleDetail';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { WorkspaceProvider, useWorkspace } from '@/contexts/WorkspaceContext';
import { dashboardData } from '@/data/dashboardData';
import { BRAND } from '@/lib/brand';
import { supabase } from '@/lib/supabase';
import type { Conversation } from '@/types/chat';
import { loadConversationsLocal } from '@/lib/conversationPersistence';
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
  if (selectedModule === 'library') {
    document.title = `Library - ${BRAND.titleSuffix}`;
    return;
  }
  if (selectedModule === 'settings') {
    document.title = `Settings - ${BRAND.titleSuffix}`;
  } else if (selectedModule === 'integrations') {
    document.title = `Integrations - ${BRAND.titleSuffix}`;
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
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(107,79,235,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(107,79,235,0.07),transparent_22%),linear-gradient(180deg,rgba(255,251,255,0.98),rgba(255,255,255,0.94))] p-4 dark:bg-[radial-gradient(circle_at_top_left,rgba(107,79,235,0.16),transparent_24%),radial-gradient(circle_at_top_right,rgba(107,79,235,0.08),transparent_18%),linear-gradient(180deg,rgba(10,10,10,0.98),rgba(10,10,10,0.96))]">
      {isSignup ? (
        <SignupForm onToggleMode={() => setIsSignup(false)} />
      ) : (
        <LoginForm onToggleMode={() => setIsSignup(true)} />
      )}
    </div>
  );
}

function Dashboard() {
  const { activeWorkspace } = useWorkspace();
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [autoStartModule, setAutoStartModule] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    return loadConversationsLocal(activeWorkspace?.id);
  });
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const handleConversationsChange = () => {
    setConversations(loadConversationsLocal(activeWorkspace?.id));
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

  // Reload conversations when workspace changes
  useEffect(() => {
    handleConversationsChange();
    setActiveConversationId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id]);

  // Reset auto-start after module change
  useEffect(() => {
    if (autoStartModule) {
      setTimeout(() => setAutoStartModule(false), 1000);
    }
  }, [selectedModule]);

  // Listen for in-app navigation events dispatched by deep components (e.g. OfferSelector)
  useEffect(() => {
    const handler = (e: Event) => {
      const moduleId = (e as CustomEvent<{ moduleId: string }>).detail?.moduleId
      if (moduleId) handleModuleSelect(moduleId)
    }
    window.addEventListener('marqq:navigate', handler)
    return () => window.removeEventListener('marqq:navigate', handler)
  }, [])

  // Set initial document title
  useEffect(() => {
    updateDocumentTitle(selectedModule);
    ensureFavicon();
  }, [selectedModule]);

  const currentModule = selectedModule
    ? dashboardData.modules.find(m => m.id === selectedModule)
    : null;

  const [chatOpen, setChatOpen] = useState(false);
  const [homeTourOpen, setHomeTourOpen] = useState(false);

  /** Post-onboarding home spotlight: session flag set from signup or legacy catch-up. */
  useEffect(() => {
    const isHome = !selectedModule || selectedModule === 'home';
    if (!isHome || homeTourOpen) return;
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem('marqq_onboarded') !== '1') return;
    if (localStorage.getItem('marqq_home_tour_done') === '1') return;
    if (typeof sessionStorage === 'undefined') return;
    if (sessionStorage.getItem('marqq_post_onboard_home_tour') !== '1') return;

    const id = window.setTimeout(() => {
      try {
        sessionStorage.removeItem('marqq_post_onboard_home_tour');
      } catch {
        /* ignore */
      }
      setHomeTourOpen(true);
    }, 500);
    return () => clearTimeout(id);
  }, [selectedModule, homeTourOpen]);

  const renderContent = () => {
    // Home and default now show the chat-first interface (Helena-style)
    if (!selectedModule || selectedModule === 'home') {
      return (
        <ChatHome
          onModuleSelect={handleModuleSelect}
          activeConversationId={activeConversationId}
          onConversationsChange={handleConversationsChange}
        />
      );
    }

    if (selectedModule === 'integrations') return <IntegrationsHub />;
    if (selectedModule === 'settings') return <SettingsPanel />;
    if (selectedModule === 'help') return <HelpPanel />;
    if (selectedModule === 'dashboard') return <AgentDashboard />;
    if (selectedModule === 'library') return <LibraryView />;
    if (selectedModule === 'workspace-files') return <LibraryView />;
    if (selectedModule === 'calendar') return <MarketingCalendarPage onModuleSelect={handleModuleSelect} />;
    if (selectedModule === 'scheduled-jobs') return <ScheduledJobsPage />;
    if (selectedModule === 'profile') return <ProfilePage />;
    if (selectedModule === 'chat-sessions') return (
      <ChatSessionsPage
        conversations={conversations}
        onConversationSelect={(id) => {
          setActiveConversationId(id);
          setSelectedModule(null);
        }}
        onConversationsChange={handleConversationsChange}
      />
    );

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

    return (
      <HomeView
        onModuleSelect={handleModuleSelect}
        onOpenChat={() => setChatOpen(true)}
      />
    );
  };

  return (
    <>
      <MainLayout
        selectedModule={selectedModule}
        onModuleSelect={handleModuleSelect}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onConversationSelect={(id) => {
          setActiveConversationId(id);
          setChatOpen(true);
        }}
        onConversationsChange={handleConversationsChange}
        chatOpen={chatOpen}
        onChatOpenChange={setChatOpen}
      >
        {renderContent()}
      </MainLayout>
      {homeTourOpen && (
        <HomePostOnboardingTour onDone={() => setHomeTourOpen(false)} />
      )}
    </>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const [isOnboarded, setIsOnboarded] = useState(() => localStorage.getItem('marqq_onboarded') === '1');

  // On login with empty localStorage: skip onboarding for existing users.
  // Only fresh signups (sessionStorage flag set by AuthContext.signup) should see onboarding.
  useEffect(() => {
    if (!isAuthenticated || isOnboarded) return;
    const isFreshSignup = sessionStorage.getItem('marqq_just_signed_up') === '1';
    if (isFreshSignup) return; // let the onboarding flow handle it
    // Existing user logging in — mark as onboarded without showing the flow
    localStorage.setItem('marqq_onboarded', '1');
    supabase.auth.updateUser({ data: { onboarded: true } }).catch(() => {});
    setIsOnboarded(true);
  }, [isAuthenticated, isOnboarded]);

  // Invite token from URL (?invite=<token>) or session (stored before login)
  const [inviteToken, setInviteToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('invite') || null
  })

  // After login, check for a pending invite stored before the user signed in
  useEffect(() => {
    if (!isAuthenticated || inviteToken) return
    const pending = sessionStorage.getItem('marqq_pending_invite')
    if (pending) {
      sessionStorage.removeItem('marqq_pending_invite')
      setInviteToken(pending)
    }
  }, [isAuthenticated, inviteToken])

  const clearInvite = () => {
    setInviteToken(null)
    // Remove ?invite= from URL without reload
    const url = new URL(window.location.href)
    url.searchParams.delete('invite')
    window.history.replaceState(null, '', url.toString())
  }

  // Queue home spotlight when onboarded but the tour is not finished (incl. legacy users).
  useEffect(() => {
    if (!isAuthenticated || !isOnboarded || isLoading) return;
    if (localStorage.getItem('marqq_home_tour_done') === '1') return;
    if (sessionStorage.getItem('marqq_post_onboard_home_tour')) return;
    try {
      sessionStorage.setItem('marqq_post_onboard_home_tour', '1');
    } catch {
      /* ignore */
    }
  }, [isAuthenticated, isOnboarded, isLoading]);

  // Show invite acceptance screen when a token is present (regardless of auth state)
  if (inviteToken && !isLoading) {
    return <InviteAccept token={inviteToken} onDone={clearInvite} />
  }

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
          try {
            sessionStorage.setItem('marqq_post_onboard_home_tour', '1');
          } catch {
            /* ignore */
          }
        }}
      />
    );
  }

  return isAuthenticated ? <Dashboard /> : <AuthScreen />;
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
