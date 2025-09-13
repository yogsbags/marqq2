import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { ChatToggle } from '@/components/chat/ChatToggle';
import { cn } from '@/lib/utils';

interface MainLayoutProps {
  children: React.ReactNode;
  selectedModule: string | null;
  onModuleSelect: (moduleId: string | null) => void;
}

export function MainLayout({ children, selectedModule, onModuleSelect }: MainLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      id: '1',
      content: 'Hello! I\'m your AI assistant. How can I help you with your marketing campaigns today?',
      sender: 'ai' as const,
      timestamp: new Date(),
    },
  ]);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        selectedModule={selectedModule}
        onModuleSelect={onModuleSelect}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
      />

      {/* Main Content */}
      <div className={cn(
        "flex-1 flex flex-col overflow-hidden transition-all duration-300",
        sidebarCollapsed ? "ml-16" : "ml-72"
      )}>
        {/* Header - Only show on dashboard */}
        <DashboardHeader selectedModule={selectedModule} />
        
        {/* Main Content Area */}
        <main className={cn(
          "flex-1 overflow-auto bg-gradient-to-br from-orange-50/30 via-white to-orange-50/50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950",
          "transition-all duration-300 pt-4"
        )}>
          <div className="w-full px-6 pb-8">
            {children}
          </div>
        </main>

        {/* Chat Toggle Button */}
        {!chatOpen && (
          <ChatToggle onClick={() => setChatOpen(true)} />
        )}
      </div>

      {/* Chat Panel */}
      <ChatPanel 
        isOpen={chatOpen} 
        onClose={() => setChatOpen(false)} 
        messages={chatMessages}
        onMessagesChange={setChatMessages}
        onModuleSelect={onModuleSelect}
      />
    </div>
  );
}