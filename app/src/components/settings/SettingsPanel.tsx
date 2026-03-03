import { useState } from 'react';
import { User, Plug, Users, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GeneralTab } from './tabs/GeneralTab';
import { AccountsTab } from './tabs/AccountsTab';
import { MembersTab } from './tabs/MembersTab';
import { BillingTab } from './tabs/BillingTab';

type TabId = 'general' | 'accounts' | 'members' | 'billing';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'general',  label: 'General',  icon: <User className="h-4 w-4" /> },
  { id: 'accounts', label: 'Accounts', icon: <Plug className="h-4 w-4" /> },
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
      case 'accounts': return <AccountsTab />;
      case 'members':  return <MembersTab />;
      case 'billing':  return <BillingTab />;
    }
  };

  return (
    <div className="flex gap-0 min-h-full">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 border-r pr-0">
        <div className="px-4 py-4 pb-2">
          <h1 className="font-semibold text-base">Settings</h1>
        </div>
        <nav className="px-2 space-y-0.5">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left',
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
      <main className="flex-1 px-8 py-6 overflow-auto">
        {renderTab()}
      </main>
    </div>
  );
}
