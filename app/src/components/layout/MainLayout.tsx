import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { Taskboard } from '@/components/taskboard/Taskboard';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/types/chat';

interface MainLayoutProps {
  children: React.ReactNode;
  selectedModule: string | null;
  onModuleSelect: (moduleId: string | null) => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  onConversationSelect: (id: string) => void;
}

export function MainLayout({
  children,
  selectedModule,
  onModuleSelect,
  conversations,
  activeConversationId,
  onConversationSelect,
}: MainLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const isHomeView = !selectedModule || selectedModule === 'home';

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Left: Sidebar */}
      <Sidebar
        selectedModule={selectedModule}
        onModuleSelect={onModuleSelect}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
        conversations={conversations}
        activeConversationId={activeConversationId}
        onConversationSelect={onConversationSelect}
      />

      {/* Center: Main content (chat home or module view) */}
      <div className={cn(
        "flex-1 flex flex-col overflow-hidden transition-all duration-300",
        sidebarCollapsed ? "ml-16" : "ml-72"
      )}>
        {/* Hide header on home/chat view to give full height to chat */}
        {!isHomeView && (
          <DashboardHeader selectedModule={selectedModule} onModuleSelect={onModuleSelect} />
        )}

        <main className={cn(
          "flex-1 overflow-auto transition-all duration-300",
          isHomeView
            ? "bg-white dark:bg-gray-900"
            : "bg-gradient-to-br from-orange-50/30 via-white to-orange-50/50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 pt-4"
        )}>
          <div className={cn("h-full", !isHomeView && "w-full px-6 pb-8")}>
            {children}
          </div>
        </main>
      </div>

      {/* Right: Taskboard (always visible) */}
      <Taskboard />
    </div>
  );
}
