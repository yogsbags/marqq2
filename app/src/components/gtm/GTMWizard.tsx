/**
 * Legacy modal GTM wizard — retired in favor of Home chat GtmModuleWizard.
 * Kept as a redirect stub so any remaining imports do not open the old flow.
 */
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  onClose: () => void;
  onNavigate?: (moduleId: string, options?: { hash?: string }) => void;
}

export function GTMWizard({ onClose, onNavigate }: Props) {
  const goHome = () => {
    onNavigate?.('home');
    onClose();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>GTM moved to Home</DialogTitle>
          <DialogDescription>
            The go-to-market wizard now lives in the main Home chat. Complete sequential
            sections there, lock each one, then run a single task.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="button" onClick={goHome}>
            Open Home wizard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
