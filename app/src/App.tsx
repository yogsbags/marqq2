import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { Toaster } from '@/components/ui/sonner';
import { LoginForm } from '@/components/auth/LoginForm';
import { SignupForm } from '@/components/auth/SignupForm';
import { MainLayout } from '@/components/layout/MainLayout';
import { ModuleDetail } from '@/components/modules/ModuleDetail';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { HelpPanel } from '@/components/help/HelpPanel';
import { ChatHome } from '@/components/chat/ChatHome';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { dashboardData } from '@/data/dashboardData';
import type { Conversation } from '@/types/chat';
import './App.css';

// Update document title based on current view
function updateDocumentTitle(selectedModule: string | null) {
  if (selectedModule === 'home') {
    document.title = 'Home - Torqq AI';
    return;
  }
  if (selectedModule === 'settings') {
    document.title = 'Settings - Torqq AI';
  } else if (selectedModule === 'help') {
    document.title = 'Help & Support - Torqq AI';
  } else if (selectedModule) {
    const module = dashboardData.modules.find(m => m.id === selectedModule);
    document.title = module ? `${module.name} - Torqq AI` : 'Torqq AI - Marketing Intelligence Platform';
  } else {
    document.title = 'Torqq AI - Marketing Intelligence Platform';
  }
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
      const raw = localStorage.getItem('torqq_conversations');
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
      const raw = localStorage.getItem('torqq_conversations');
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
    if (selectedModule === 'help') return <HelpPanel />;

    if (currentModule) {
      return (
        <ModuleDetail
          module={currentModule}
          onBack={() => setSelectedModule(null)}
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

  return isAuthenticated ? <Dashboard /> : <AuthScreen />;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
