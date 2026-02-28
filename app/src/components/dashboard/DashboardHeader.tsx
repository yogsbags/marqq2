import { useState } from 'react';
import { Bell, Settings, User, LogOut, Moon, Sun } from 'lucide-react';
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
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher';

interface DashboardHeaderProps {
  selectedModule: string | null;
  onModuleSelect: (moduleId: string | null) => void;
}

export function DashboardHeader({ selectedModule, onModuleSelect }: DashboardHeaderProps) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b bg-white dark:bg-gray-950 backdrop-blur supports-[backdrop-filter]:bg-white/95 dark:supports-[backdrop-filter]:bg-gray-950/95">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center space-x-4">
          <WorkspaceSwitcher />
        </div>

        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="transition-colors duration-200 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-gray-600 dark:text-gray-300 bg-transparent"
          >
            {theme === 'light' ? <Moon className="h-4 w-4 text-gray-900 dark:text-gray-100" /> : <Sun className="h-4 w-4 text-gray-900 dark:text-gray-100" />}
          </Button>

          <Button
            variant="ghost"
            size="sm"
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="relative transition-colors duration-200 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-gray-600 dark:text-gray-300 bg-transparent"
          >
            <Bell className="h-4 w-4 text-gray-900 dark:text-gray-100" />
            <span className="absolute -top-1 -right-1 h-3 w-3 bg-orange-500 rounded-full animate-pulse" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="relative hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-all duration-200 text-gray-600 dark:text-gray-300 bg-transparent"
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
    </>
  );
}
