import { Sidebar } from './Sidebar';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { ChannelHeader } from './ChannelHeader';
import { RightPanel } from './RightPanel';
import { cn } from '@/lib/utils';
import { channelMetaForModule, isCiTaskChannel } from '@/lib/gtmTaskRegistry';
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
  'veena-dm': { name: 'veena', description: 'Direct message with Veena' },
  'performance-scorecard': { name: 'performance', description: 'Analytics & KPI tracking' },
  'crm': { name: 'crm', description: 'HubSpot & Zoho contacts, notes, and voicebot sync' },
  'channel-health': { name: 'daily-brief', description: 'Daily marketing intelligence brief' },
  'calendar': { name: 'calendar', description: 'Content schedule across all channels' },
  'paid-ads': { name: 'paid-ads', description: 'Goals, research, campaigns, and performance guardrails' },
  'execution-outreach': { name: 'outreach', description: 'Prospects, sequences, approvals, and replies' },
  'execution-content': { name: 'content', description: 'Content lanes, previews, approvals, and publishing' },
  'execution-blog-seo': { name: 'blog-seo', description: 'Research, briefs, articles, and organic growth' },
  'execution-landing-pages': { name: 'landing-pages', description: 'Browser previews, CRO, and publishing' },
  'execution-lead-magnets': { name: 'lead-magnets', description: 'Offers, capture, delivery, and nurture' },
  'execution-social': { name: 'social', description: 'Platform-native posts, media, and scheduling' },
  'execution-dashboard': { name: 'dashboard', description: 'Goal pacing, attribution, and channel performance' },
  'execution-monitoring': { name: 'monitoring', description: 'External signals, competitors, and course correction' },
  'draft-approvals': { name: 'approvals', description: 'Review and approve drafts before anything goes live' },
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
  const isChatView = !selectedModule || selectedModule === 'home' || selectedModule === 'main' || selectedModule === 'veena-dm'
    || selectedModule === 'performance-scorecard' || selectedModule === 'crm' || selectedModule === 'channel-health'
    || selectedModule === 'calendar' || selectedModule === 'workspace-files'
    || selectedModule === 'scheduled-jobs' || selectedModule === 'chat-sessions'
    || selectedModule === 'profile'
    || isCiTaskChannel(selectedModule);

  const channelInfo =
    channelMetaForModule(selectedModule ?? '') ||
    CHANNEL_NAMES[selectedModule ?? 'home'] ||
    { name: selectedModule ?? 'main', description: '' };

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
              selectedModule={selectedModule}
              onModuleSelect={onModuleSelect}
            />
          ) : (
            <DashboardHeader
              selectedModule={selectedModule}
              onModuleSelect={onModuleSelect}
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
        {isChatView && selectedModule !== 'calendar' && selectedModule !== 'workspace-files' && selectedModule !== 'veena-dm' && (
          <RightPanel onModuleSelect={onModuleSelect} />
        )}
      </div>

    </div>
  );
}
