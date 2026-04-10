import { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { CreateWorkspaceModal } from '@/components/workspace/CreateWorkspaceModal';

function truncate(str: string, n = 22) {
  return str.length > n ? str.slice(0, n) + '…' : str;
}

interface WorkspaceSwitcherProps {
  onModuleSelect?: (moduleId: string) => void;
}

export function WorkspaceSwitcher({ onModuleSelect }: WorkspaceSwitcherProps) {
  const { workspaces, activeWorkspace, switchWorkspace, isLoading } = useWorkspace();
  const [modalOpen, setModalOpen] = useState(false);

  if (isLoading) {
    return <div className="h-9 w-40 rounded-md bg-muted animate-pulse" />;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 font-medium text-sm max-w-[200px]"
          >
            <span className="truncate">
              {activeWorkspace ? truncate(activeWorkspace.name) : 'Select workspace'}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            My workspaces
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {workspaces.map(ws => (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => switchWorkspace(ws.id)}
              className="flex items-center justify-between gap-2 cursor-pointer"
            >
              <span className="truncate">{truncate(ws.name)}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-muted-foreground">{ws.role}</span>
                {activeWorkspace?.id === ws.id && (
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                )}
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setModalOpen(true)}
            className="text-orange-600 dark:text-orange-400 cursor-pointer gap-2"
          >
            <Plus className="h-3.5 w-3.5" />
            Create a workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateWorkspaceModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreated={(_ws, url) => url && onModuleSelect?.('home')}
      />
    </>
  );
}
