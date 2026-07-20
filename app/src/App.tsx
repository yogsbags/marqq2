import { AppUpdateBanner } from '@/components/AppUpdateBanner';
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
import { markUserOnboardedLocal, userNeedsOnboarding } from '@/lib/onboardingGate';
import type { Conversation } from '@/types/chat';
import { loadConversationsLocal } from '@/lib/conversationPersistence';
import { pinChannel } from '@/lib/pinnedChannels';
import {
  channelMetaForModule,
  isCiTaskChannel,
  moduleIdFromCiHash,
  pageIdFromCiChannel,
} from '@/lib/gtmTaskRegistry';
import { CompanyIntelligenceFlow } from '@/components/modules/CompanyIntelligenceFlow';
import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';

// ── Composio OAuth popup callback ────────────────────────────────────────────
// When Composio redirects back into the popup, post success to the opener and close.
// Supports our `connected=` callback and Composio's `status=success` append.
if (window.opener) {
  const params = new URLSearchParams(window.location.search)
  const connectorId =
    params.get('connected') ||
    params.get('connectorId') ||
    params.get('connector_id') ||
    null
  const status = (params.get('status') || '').toLowerCase()
  const connectedAccountId =
    params.get('connected_account_id') ||
    params.get('connectedAccountId') ||
    null

  if (connectorId || status === 'success' || connectedAccountId) {
    try {
      window.opener.postMessage(
        {
          type: 'composio_oauth_success',
          connectorId,
          connectedAccountId,
          status: status || 'success',
        },
        window.location.origin,
      )
    } catch {
      /* ignore */
    }
    window.close()
  }
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
    const ciMeta = channelMetaForModule(selectedModule);
    if (ciMeta) {
      document.title = `#${ciMeta.name} - ${BRAND.titleSuffix}`;
      return;
    }
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

// ── Generic module deep-linking (#m=<moduleId>) ─────────────────────────────
// Company Intelligence pages already round-trip through #ci=/#company-intel:.
// Every other module (Lead Intelligence, Video Gen, Settings, etc.) had no URL
// representation at all, so a hard reload — e.g. the "New version available"
// banner, or a plain browser refresh — always fell back to Home. Mirror the
// same #ci= pattern generically so any module survives a reload.
function moduleIdFromGenericHash(hash?: string): string | null {
  const raw = hash ?? (typeof window !== 'undefined' ? window.location.hash : '');
  const value = raw.startsWith('#') ? raw.slice(1) : raw;
  if (!value.startsWith('m=')) return null;
  try {
    return decodeURIComponent(value.slice(2)) || null;
  } catch {
    return value.slice(2) || null;
  }
}

function syncModuleHash(moduleId: string | null) {
  if (typeof window === 'undefined') return;
  const base = window.location.pathname + window.location.search;

  if (!moduleId || moduleId === 'home') {
    if (window.location.hash) window.history.replaceState(null, '', base);
    return;
  }

  if (isCiTaskChannel(moduleId)) {
    const pageId = pageIdFromCiChannel(moduleId);
    if (!pageId) return;
    const nextHash = `#ci=${pageId}`;
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', `${base}${nextHash}`);
    }
    return;
  }

  const nextHash = `#m=${encodeURIComponent(moduleId)}`;
  if (window.location.hash !== nextHash) {
    window.history.replaceState(null, '', `${base}${nextHash}`);
  }
}

type AuthPathMode = 'login' | 'signup';

function getAuthPathMode(pathname = window.location.pathname): AuthPathMode | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/login') return 'login'
  if (path === '/signup') return 'signup'
  return null
}

function replaceAuthPath(mode: AuthPathMode | 'home') {
  const url = new URL(window.location.href)
  url.pathname = mode === 'home' ? '/' : `/${mode}`
  window.history.replaceState(null, '', url.toString())
}

function AuthScreen({ initialMode = 'login' }: { initialMode?: AuthPathMode }) {
  const [isSignup, setIsSignup] = useState(initialMode === 'signup');

  useEffect(() => {
    setIsSignup(initialMode === 'signup')
  }, [initialMode])

  const showSignup = () => {
    setIsSignup(true)
    replaceAuthPath('signup')
  }

  const showLogin = () => {
    setIsSignup(false)
    replaceAuthPath('login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(107,79,235,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(107,79,235,0.07),transparent_22%),linear-gradient(180deg,rgba(255,251,255,0.98),rgba(255,255,255,0.94))] p-4 dark:bg-[radial-gradient(circle_at_top_left,rgba(107,79,235,0.16),transparent_24%),radial-gradient(circle_at_top_right,rgba(107,79,235,0.08),transparent_18%),linear-gradient(180deg,rgba(10,10,10,0.98),rgba(10,10,10,0.96))]">
      {isSignup ? (
        <SignupForm onToggleMode={showLogin} />
      ) : (
        <LoginForm onToggleMode={showSignup} />
      )}
    </div>
  );
}

function Dashboard() {
  const { activeWorkspace } = useWorkspace();
  const [selectedModule, setSelectedModule] = useState<string | null>(
    () => moduleIdFromCiHash() || moduleIdFromGenericHash(),
  );
  const [autoStartModule, setAutoStartModule] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    return loadConversationsLocal(activeWorkspace?.id, 'veena-dm');
  });
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [workflowParams, setWorkflowParams] = useState<Record<string, Record<string, string>>>({});
  const conversationRefreshTimerRef = useRef<number | null>(null);

  const handleConversationsChange = useCallback(() => {
    // Debounce parent state updates to avoid "setState during render" warning
    // This callback is called from child render phase, so defer the update
    if (conversationRefreshTimerRef.current) {
      clearTimeout(conversationRefreshTimerRef.current);
    }
    conversationRefreshTimerRef.current = window.setTimeout(() => {
      setConversations(loadConversationsLocal(activeWorkspace?.id, 'veena-dm'));
    }, 0);
  }, [activeWorkspace?.id]);

  const handleModuleSelect = (moduleId: string | null) => {
    if (moduleId !== 'veena-dm' && moduleId !== 'chat-sessions') {
      setActiveConversationId(null);
    }
    setSelectedModule(moduleId);
    updateDocumentTitle(moduleId);
    // Check if this was triggered by a slash command (indicated by URL hash)
    if (window.location.hash === '#auto-start') {
      setAutoStartModule(true);
      window.history.replaceState(null, '', window.location.pathname);
    }
    // Keep the URL hash in sync with the selected module so a hard reload (e.g. the
    // "New version available" update banner) restores the same view instead of
    // falling back to Home.
    syncModuleHash(moduleId);
    // Pin as a dynamic channel whenever a module is opened
    if (moduleId && activeWorkspace?.id) {
      const updated = pinChannel(activeWorkspace.id, moduleId);
      // Notify sidebar so it re-renders without a full reload
      window.dispatchEvent(
        new CustomEvent('marqq:channels-updated', { detail: { channels: updated } })
      );
    }
  };

  // Reload conversations when workspace changes
  useEffect(() => {
    handleConversationsChange();
    setActiveConversationId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id]);

  // Restore the current module from its deep-link hash on browser hash navigation
  // (back/forward, manual edits) — Company Intelligence pages use #ci=/#company-intel:,
  // every other module uses the generic #m=<moduleId> scheme.
  useEffect(() => {
    const restoreRoute = () => {
      const ciModuleId = moduleIdFromCiHash();
      if (ciModuleId) {
        setAutoStartModule(false);
        setSelectedModule(ciModuleId);
        updateDocumentTitle(ciModuleId);
        return;
      }
      const genericModuleId = moduleIdFromGenericHash();
      if (genericModuleId) {
        setAutoStartModule(false);
        setSelectedModule(genericModuleId);
        updateDocumentTitle(genericModuleId);
      }
    };
    window.addEventListener('hashchange', restoreRoute);
    return () => window.removeEventListener('hashchange', restoreRoute);
  }, []);

  // Reset auto-start after module change
  useEffect(() => {
    if (autoStartModule) {
      setTimeout(() => setAutoStartModule(false), 1000);
    }
  }, [selectedModule]);

  // Listen for in-app navigation events dispatched by deep components (e.g. OfferSelector)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ moduleId?: string | null; autoStart?: boolean }>).detail
      const moduleId = detail?.moduleId
      if (moduleId === undefined) return
      if (detail?.autoStart) {
        setAutoStartModule(true)
      }
      if (moduleId === null || moduleId === 'home') {
        if (window.location.hash.startsWith('#ci=') || window.location.hash.startsWith('#company-intel')) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
        }
        handleModuleSelect(null)
        return
      }
      if (window.location.hash.startsWith('#ci=') || window.location.hash.startsWith('#company-intel')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
      handleModuleSelect(moduleId)
    }
    window.addEventListener('marqq:navigate', handler)
    return () => window.removeEventListener('marqq:navigate', handler)
  }, [])

  // Listen for workflow params collected from in-chat forms before module opens
  useEffect(() => {
    const handler = (e: Event) => {
      const { moduleId, params } = (e as CustomEvent<{ moduleId: string; params: Record<string, string> }>).detail ?? {}
      if (moduleId && params) {
        setWorkflowParams(prev => ({ ...prev, [moduleId]: params }))
      }
    }
    window.addEventListener('marqq:workflow-params', handler)
    return () => window.removeEventListener('marqq:workflow-params', handler)
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
    const hasOnboardedMarker =
      localStorage.getItem('marqq_onboarded') === '1' ||
      Object.keys(localStorage).some(
        (k) => k.startsWith('marqq_onboarded:') && localStorage.getItem(k) === '1'
      );
    if (!hasOnboardedMarker) return;
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
          scope="main"
        />
      );
    }

    if (selectedModule === 'veena-dm') {
      return (
        <ChatHome
          onModuleSelect={handleModuleSelect}
          activeConversationId={activeConversationId}
          onConversationsChange={handleConversationsChange}
          scope="veena-dm"
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
          setSelectedModule('veena-dm');
        }}
        onConversationsChange={handleConversationsChange}
      />
    );

    // GTM / #main task channels — one CI workstream per channel (e.g. #icps)
    if (isCiTaskChannel(selectedModule)) {
      const focusPage = pageIdFromCiChannel(selectedModule);
      if (focusPage) {
        return (
          <div className="h-full overflow-auto px-6 py-4">
            <CompanyIntelligenceFlow
              focusPage={focusPage}
              taskChannelMode
              onModuleSelect={handleModuleSelect}
            />
          </div>
        );
      }
    }

    if (currentModule) {
      return (
        <ModuleDetail
          module={currentModule}
          onBack={() => setSelectedModule(null)}
          onModuleSelect={handleModuleSelect}
          autoStart={autoStartModule}
          workflowParams={workflowParams[currentModule.id]}
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
  const { isAuthenticated, isLoading, user } = useAuth();
  // Set when this session finishes the flow (so we leave onboarding without waiting for metadata refresh)
  const [finishedOnboarding, setFinishedOnboarding] = useState(false);
  const [authPathMode, setAuthPathMode] = useState<AuthPathMode | null>(() => getAuthPathMode());

  const needsOnboarding =
    !finishedOnboarding &&
    isAuthenticated &&
    !!user &&
    userNeedsOnboarding(user);

  // Invite token from URL (?invite=<token>) or session (stored before login)
  const [inviteToken, setInviteToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('invite') || null
  })

  // Keep /login and /signup in sync with auth state (SPA has no React Router).
  useEffect(() => {
    if (isLoading) return

    const path = window.location.pathname.replace(/\/+$/, '') || '/'
    const mode = getAuthPathMode(path)

    if (!isAuthenticated) {
      // Unauthenticated root → /login (preserve query, e.g. ?invite=)
      if (path === '/') {
        replaceAuthPath('login')
        setAuthPathMode('login')
        return
      }
      if (mode) setAuthPathMode(mode)
      return
    }

    // Authenticated users shouldn't stay on auth URLs
    if (mode) {
      replaceAuthPath('home')
      setAuthPathMode(null)
    }
  }, [isAuthenticated, isLoading])

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
    if (!isAuthenticated || needsOnboarding || isLoading || !user?.id) return;
    if (localStorage.getItem('marqq_home_tour_done') === '1') return;
    if (sessionStorage.getItem('marqq_post_onboard_home_tour')) return;
    try {
      sessionStorage.setItem('marqq_post_onboard_home_tour', '1');
    } catch {
      /* ignore */
    }
  }, [isAuthenticated, needsOnboarding, isLoading, user?.id]);

  // Show invite acceptance screen when a token is present (regardless of auth state)
  if (inviteToken && !isLoading) {
    return <InviteAccept token={inviteToken} onDone={clearInvite} />
  }

  if (isLoading || (isAuthenticated && !user)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <LoadingSpinner size="lg" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (needsOnboarding && user) {
    return (
      <OnboardingFlow
        onComplete={() => {
          markUserOnboardedLocal(user.id);
          setFinishedOnboarding(true);
          try {
            sessionStorage.setItem('marqq_post_onboard_home_tour', '1');
          } catch {
            /* ignore */
          }
        }}
      />
    );
  }

  return isAuthenticated ? (
    <Dashboard />
  ) : (
    <AuthScreen initialMode={authPathMode || 'login'} />
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <AppUpdateBanner />
          <AppContent />
          <Toaster richColors position="top-right" />
        </WorkspaceProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
