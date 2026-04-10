import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useWorkspace, type Workspace } from '@/contexts/WorkspaceContext';
import { toast } from 'sonner';

interface CreateWorkspaceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (workspace: Workspace, websiteUrl: string) => void;
}

function normalizeUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
      .toString()
      .replace(/\/$/, '');
  } catch {
    return trimmed;
  }
}

export function CreateWorkspaceModal({ open, onOpenChange, onCreated }: CreateWorkspaceModalProps) {
  const { createWorkspace, updateWebsiteUrl } = useWorkspace();
  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const workspaceName = name.trim();
      const workspace = await createWorkspace(workspaceName);
      const url = normalizeUrl(websiteUrl);
      if (url) {
        await updateWebsiteUrl(url);
        try {
          localStorage.setItem(`marqq_onboarding_ctx_${workspace.id}`, JSON.stringify({
            company: workspaceName,
            industry: '',
            icp: '',
            goals: '',
            connectedIntegrations: '',
          }));
          sessionStorage.setItem('marqq_company_intel_autorun', JSON.stringify({
            companyName: workspaceName,
            websiteUrl: url,
          }));
          sessionStorage.setItem('marqq_post_onboard_home_tour', '1');
        } catch {
          // non-blocking
        }
      }
      toast.success(`Brand "${workspaceName}" created${url ? ' — opening main channel' : ''}`);
      setName('');
      setWebsiteUrl('');
      onOpenChange(false);
      if (url) onCreated?.(workspace, url);
    } catch (err: unknown) {
      toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New brand</DialogTitle>
          <DialogDescription>
            Add a brand or client workspace. Optionally enter the company website to kick off background company intelligence.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ws-name">Brand name</Label>
            <Input
              id="ws-name"
              placeholder="e.g. Acme Corp, Client A"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-url">
              Company website <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="ws-url"
              placeholder="https://example.com"
              value={websiteUrl}
              onChange={e => setWebsiteUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!name.trim() || loading}>
            {loading ? 'Creating…' : 'Create brand'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
