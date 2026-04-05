import { Sidebar } from './Sidebar';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { ChannelHeader } from './ChannelHeader';
import { RightPanel } from './RightPanel';
import { ChatDrawer } from '@/components/chat/ChatDrawer';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { Conversation } from '@/types/chat';

interface MainLayoutProps {
  children: React.ReactNode;
  selectedModule: string | null;
  onModuleSelect: (moduleId: string | null) => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  onConversationSelect: (id: string) => void;
  onConversationsChange: () => void;
  chatOpen: boolean;
  onChatOpenChange: (open: boolean) => void;
  firstSessionBanner?: React.ReactNode;
}

const CHANNEL_NAMES: Record<string, { name: string; description: string }> = {
  home: { name: 'main', description: 'Your autonomous AI marketing team' },
  main: { name: 'main', description: 'Your autonomous AI marketing team' },
  'performance-scorecard': { name: 'performance', description: 'Analytics & KPI tracking' },
  'channel-health': { name: 'daily-brief', description: 'Daily marketing intelligence brief' },
  'calendar': { name: 'calendar', description: 'Content schedule across all channels' },
  'workspace-files': { name: 'files', description: 'Files created by your AI team' },
  'scheduled-jobs': { name: 'tasks', description: 'Tasks that run automatically on a schedule' },
  'chat-sessions': { name: 'chat-history', description: 'View and manage your conversation history' },
  'profile': { name: 'profile', description: 'Your account and brand settings' },
};

export function MainLayout({
  children,
  selectedModule,
  onModuleSelect,
  conversations,
  activeConversationId,
  onConversationSelect,
  onConversationsChange,
  chatOpen,
  onChatOpenChange,
  firstSessionBanner,
}: MainLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Chat/channel view = home, main (+ channel pages use ChannelHeader)
  const isChatView = !selectedModule || selectedModule === 'home' || selectedModule === 'main'
    || selectedModule === 'performance-scorecard' || selectedModule === 'channel-health'
    || selectedModule === 'calendar' || selectedModule === 'workspace-files'
    || selectedModule === 'scheduled-jobs' || selectedModule === 'chat-sessions'
    || selectedModule === 'profile';

  const channelInfo = CHANNEL_NAMES[selectedModule ?? 'home'] ?? { name: selectedModule ?? 'main', description: '' };

  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden">
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

      {/* Center + Right panes */}
      <div className={cn(
        "flex-1 flex overflow-hidden transition-[margin-left] duration-300 ease-in-out",
        sidebarCollapsed ? "ml-14" : "ml-60"
      )}>
        {/* Center pane */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {isChatView ? (
            <ChannelHeader
              channelName={channelInfo.name}
              description={channelInfo.description}
              onModuleSelect={onModuleSelect}
            />
          ) : (
            <DashboardHeader
              selectedModule={selectedModule}
              onModuleSelect={onModuleSelect}
              onOpenChat={() => onChatOpenChange(true)}
            />
          )}

          <main className={cn(
            "flex-1 overflow-hidden",
            !isChatView && "overflow-auto pt-4"
          )}>
            {firstSessionBanner}
            <div
              key={selectedModule ?? 'home'}
              className={cn(
                "h-full",
                isChatView ? "" : "page-enter page-enter-soft w-full px-6 pb-8"
              )}
            >
              {children}
            </div>
          </main>
        </div>

        {/* Right panel — only in main chat/home view (not calendar, files, etc.) */}
        {isChatView && selectedModule !== 'calendar' && selectedModule !== 'workspace-files' && (
          <RightPanel onModuleSelect={onModuleSelect} />
        )}
      </div>

      {/* Chat Drawer — only shown for module pages (not when chat is the primary view) */}
      {!isChatView && (
        <ChatDrawer
          open={chatOpen}
          onOpenChange={onChatOpenChange}
          onModuleSelect={onModuleSelect}
          onConversationsChange={onConversationsChange}
        />
      )}
    </div>
  );
}
