import { useState } from 'react';
import { Bell, CalendarDays, Settings, User, LogOut, Moon, Sun, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { dashboardData } from '@/data/dashboardData';
import { NotificationsPanel } from '@/components/notifications/NotificationsPanel';
import { CalendarPanel } from '@/components/calendar/CalendarPanel';
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher';
import { usePlan } from '@/hooks/usePlan';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DashboardHeaderProps {
  selectedModule: string | null;
  onModuleSelect: (moduleId: string | null) => void;
}

export function DashboardHeader({ selectedModule, onModuleSelect }: DashboardHeaderProps) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { plan, creditsRemaining, creditsTotal } = usePlan();

  const creditPct = creditsTotal > 0 && creditsRemaining !== -1
    ? Math.round((creditsRemaining / creditsTotal) * 100)
    : 100;
  const creditColor = creditPct > 50 ? 'text-green-600 dark:text-green-400'
    : creditPct > 20 ? 'text-orange-500 dark:text-orange-400'
    : 'text-red-500 dark:text-red-400';
  const PLAN_LABELS: Record<string, string> = { growth: 'Growth', scale: 'Scale', agency: 'Agency' };

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-white/85 dark:bg-gray-950/85 backdrop-blur-xl supports-[backdrop-filter]:bg-white/80 dark:supports-[backdrop-filter]:bg-gray-950/80">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center space-x-4">
          <WorkspaceSwitcher onModuleSelect={onModuleSelect} />
        </div>

        <div className="flex items-center space-x-4">
          {/* Credits badge */}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onModuleSelect('settings')}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/60 bg-background/80 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                >
                  <Zap className={`h-3 w-3 ${creditColor}`} />
                  <span className={`text-xs font-semibold tabular-nums ${creditColor}`}>
                    {creditsRemaining === -1 ? '∞' : creditsRemaining.toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    / {creditsTotal === -1 ? '∞' : creditsTotal.toLocaleString()}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground hidden sm:inline ml-0.5">
                    {PLAN_LABELS[plan] ?? plan}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {creditsRemaining === -1
                  ? 'Unlimited agent runs'
                  : `${creditsRemaining} of ${creditsTotal} agent credits remaining this month`}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button
            variant="ghost"
            size="sm"
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="rounded-full transition-colors duration-200 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-gray-600 dark:text-gray-300 bg-transparent"
          >
            {theme === 'light' ? <Moon className="h-4 w-4 text-gray-900 dark:text-gray-100" /> : <Sun className="h-4 w-4 text-gray-900 dark:text-gray-100" />}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            aria-label="Open agent schedule"
            onClick={() => { setCalendarOpen(!calendarOpen); setNotificationsOpen(false); }}
            className="rounded-full transition-colors duration-200 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-gray-600 dark:text-gray-300 bg-transparent"
          >
            <CalendarDays className="h-4 w-4 text-gray-900 dark:text-gray-100" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            aria-label="Open notifications"
            onClick={() => { setNotificationsOpen(!notificationsOpen); setCalendarOpen(false); }}
            className="relative rounded-full transition-colors duration-200 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-gray-600 dark:text-gray-300 bg-transparent"
          >
            <Bell className="h-4 w-4 text-gray-900 dark:text-gray-100" />
            <span aria-hidden="true" className="absolute -top-1 -right-1 h-3 w-3 bg-orange-500 rounded-full motion-reduce:animate-none animate-pulse" />
            <span className="sr-only">You have unread notifications</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Open user menu"
                className="relative rounded-full hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-all duration-200 text-gray-600 dark:text-gray-300 bg-transparent"
              >
                <User className="h-4 w-4 text-gray-900 dark:text-gray-100" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user?.name}</p>
                  <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => onModuleSelect('settings')}
              >
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-red-600"
                onClick={async () => {
                  try {
                    await logout();
                  } catch (error) {
                    console.error('Logout error:', error);
                  }
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      </header>

      {/* Notifications Panel */}
      <NotificationsPanel
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onModuleSelect={onModuleSelect}
      />

      {/* Calendar Panel */}
      <CalendarPanel
        isOpen={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        onModuleSelect={onModuleSelect}
      />
    </>
  );
}
