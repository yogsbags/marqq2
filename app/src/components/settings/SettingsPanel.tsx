import { useState } from 'react';
import { User, Users, CreditCard } from 'lucide-react';
import { PageSectionHeader } from '@/components/layout/PageSectionHeader';
import { cn } from '@/lib/utils';
import { GeneralTab } from './tabs/GeneralTab';
import { MembersTab } from './tabs/MembersTab';
import { BillingTab } from './tabs/BillingTab';

type TabId = 'general' | 'members' | 'billing';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'general',  label: 'General',  icon: <User className="h-4 w-4" /> },
  { id: 'members',  label: 'Members',  icon: <Users className="h-4 w-4" /> },
  { id: 'billing',  label: 'Billing',  icon: <CreditCard className="h-4 w-4" /> },
];

interface SettingsPanelProps {
  initialTab?: TabId;
}

export function SettingsPanel({ initialTab = 'general' }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  const renderTab = () => {
    switch (activeTab) {
      case 'general':  return <GeneralTab />;
      case 'members':  return <MembersTab />;
      case 'billing':  return <BillingTab />;
    }
  };

  return (
    <div className="space-y-6 min-h-full">
      <PageSectionHeader
        eyebrow="Workspace"
        title="Settings"
        description="Manage workspace details, members, and billing without leaving the product shell."
      />

      <div className="flex gap-6 min-h-full">
      <aside className="w-60 shrink-0 self-start rounded-[28px] border border-border/70 bg-background/80 shadow-sm">
        <div className="px-5 py-5 pb-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Preferences</div>
        </div>
        <nav className="px-3 pb-3 space-y-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-sm transition-colors text-left',
                activeTab === tab.id
                  ? 'bg-orange-50 text-orange-700 font-medium dark:bg-orange-900/20 dark:text-orange-400'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        {renderTab()}
      </main>
      </div>
    </div>
  );
}
