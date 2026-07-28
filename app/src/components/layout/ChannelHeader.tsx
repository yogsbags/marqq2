import { Hash, Bell, Moon, Sun, LogOut, Settings, Zap, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePlan } from '@/hooks/usePlan';
import { NotificationsPanel } from '@/components/notifications/NotificationsPanel';
import { isCiTaskChannel, returnToGtmWizard, shouldResumeGtmWizard } from '@/lib/gtmTaskRegistry';
import { useState } from 'react';

interface ChannelHeaderProps {
  channelName: string;
  description?: string;
  selectedModule?: string | null;
  onModuleSelect?: (id: string | null) => void;
}

export function ChannelHeader({ channelName, description, selectedModule, onModuleSelect }: ChannelHeaderProps) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { plan, creditsRemaining, creditsTotal } = usePlan();

  const creditPct = creditsTotal > 0 && creditsRemaining !== -1
    ? Math.round((creditsRemaining / creditsTotal) * 100) : 100;
  const creditColor = creditPct > 50 ? 'text-green-600 dark:text-green-400'
    : creditPct > 20 ? 'text-orange-500 dark:text-orange-400'
    : 'text-red-500 dark:text-red-400';

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'MA';
  const PLAN_LABELS: Record<string, string> = { growth: 'Growth', scale: 'Scale', agency: 'Agency' };
  const showBackToGtm =
    Boolean(selectedModule) &&
    selectedModule !== 'home' &&
    selectedModule !== 'main' &&
    (isCiTaskChannel(selectedModule) || shouldResumeGtmWizard());

  return (
    <>
      <header className="flex h-12 items-center px-4 border-b border-border/60 bg-background/95 backdrop-blur-sm flex-shrink-0 z-30">
        {/* Left: channel name */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {showBackToGtm ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mr-1 h-7 shrink-0 gap-1 px-2 text-xs text-orange-700 hover:bg-orange-50 hover:text-orange-800 dark:text-orange-300 dark:hover:bg-orange-950/30"
              onClick={() => returnToGtmWizard(onModuleSelect)}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              GTM
            </Button>
          ) : null}
          <Hash className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="font-semibold text-sm text-foreground">{channelName}</span>
          {description && (
            <span className="hidden sm:block text-xs text-muted-foreground truncate ml-2 pl-2 border-l border-border/60">{description}</span>
          )}
        </div>

        {/* Right: utilities */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Credits */}
          {creditsTotal > 0 && creditsRemaining !== -1 && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onModuleSelect?.('settings')}
                    className="flex items-center gap-1 px-2 py-1 rounded-full border border-border/60 bg-background/80 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors text-[11px]"
                  >
                    <Zap className={`h-3 w-3 ${creditColor}`} />
                    <span className={`font-medium ${creditColor}`}>{creditsRemaining}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>{creditsRemaining} of {creditsTotal} credits · {plan ? PLAN_LABELS[plan] ?? plan : 'Free'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Notifications */}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setNotificationsOpen(true)}
                  className="relative rounded-full p-1.5 transition-colors hover:bg-orange-50 dark:hover:bg-orange-900/20 text-gray-600 dark:text-gray-300"
                >
                  <Bell className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>Notifications</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Theme toggle */}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="rounded-full p-1.5 transition-colors hover:bg-orange-50 dark:hover:bg-orange-900/20 text-gray-600 dark:text-gray-300"
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>Toggle theme</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-1 rounded-full ring-2 ring-transparent hover:ring-orange-300 transition-all">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 text-[11px] font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none truncate">{user?.email ?? 'Account'}</p>
                  <p className="text-xs leading-none text-muted-foreground">{plan ? PLAN_LABELS[plan] ?? plan : 'Free'} plan</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onModuleSelect?.('settings')}>
                <Settings className="mr-2 h-4 w-4" />Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-red-600 dark:text-red-400">
                <LogOut className="mr-2 h-4 w-4" />Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <NotificationsPanel isOpen={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </>
  );
}
