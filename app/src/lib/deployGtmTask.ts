import type { GtmDeployRequest } from '@/types/gtm';
import { storeGtmContext } from '@/lib/gtmContext';
import {
  getGtmTaskDestination,
  GTM_TASK_AUTORUN_KEY,
  type GtmTaskAutorunPayload,
} from '@/lib/gtmTaskRegistry';

/**
 * Deploy a locked GTM execute task:
 * 1. Store GTM context for the destination module
 * 2. Queue silent artifact generation for CI tasks
 * 3. Navigate to the task channel (ci-icps, etc.) or standalone module
 */
export function deployGtmTask(
  req: GtmDeployRequest,
  onModuleSelect?: (moduleId: string | null) => void
): { channelId: string } | null {
  const dest = getGtmTaskDestination(req.target);
  if (!dest) return null;

  if (req.context) {
    storeGtmContext(req.target, {
      sectionId: req.context.sectionId || '',
      sectionTitle: req.context.sectionTitle || '',
      summary: req.context.summary || '',
      bullets: req.context.bullets || [],
    });
  }

  if (dest.pageId && dest.artifactType) {
    const payload: GtmTaskAutorunPayload = {
      channelId: dest.channelId,
      pageId: dest.pageId,
      artifactType: dest.artifactType,
      agentTarget: req.target,
      agentName: dest.agentName,
      companyId: req.companyId ?? null,
      summary: req.context?.summary || '',
      bullets: req.context?.bullets || [],
      autoGenerate: true,
    };
    try {
      sessionStorage.setItem(GTM_TASK_AUTORUN_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  if (dest.hash) {
    const next = dest.hash.startsWith('#') ? dest.hash : `#${dest.hash}`;
    if (window.location.hash !== next) {
      window.location.hash = next;
    }
  } else if (window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  onModuleSelect?.(dest.moduleId);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  return { channelId: dest.channelId };
}
