/**
 * pinnedChannels.ts
 * Persists the list of user-pinned module channels per workspace.
 * Dynamic channels are modules the user has opened at least once.
 */

const PREFIX = 'marqq_pinned_channels_';

export type PinnedChannel = {
  id: string;       // module ID, e.g. 'revenue-ops'
  title: string;    // short channel name, e.g. 'revenue-ops'
  pinnedAt: number; // timestamp ms
};

// Module IDs that are ALWAYS shown statically — never stored in pinnedChannels
export const STATIC_CHANNEL_IDS = new Set(['home', 'main', 'performance-scorecard', 'calendar']);

// Non-channel module IDs that should never be pinned as channels
export const NON_CHANNEL_IDS = new Set([
  'integrations', 'settings', 'help', 'dashboard', 'workspace-files',
  'scheduled-jobs', 'chat-sessions', 'profile', 'setup',
]);

/** Derive a short human-readable channel title from a module ID */
export function moduleIdToChannelTitle(moduleId: string): string {
  // Special cases
  const OVERRIDES: Record<string, string> = {
    'seo-llmo':              'seo-llmo',
    'ai-content':            'ai-content',
    'ai-voice-bot':          'voice-bot',
    'ai-video-bot':          'video-bot',
    'lead-intelligence':     'lead-intel',
    'budget-optimization':   'budget',
    'social-media':          'social',
    'social-calendar':       'social-cal',
    'unified-customer-view': 'customer-view',
    'company-intelligence':  'company-intel',
    'industry-intelligence': 'industry-intel',
    'market-signals':        'market',
    'audience-profiles':     'audiences',
    'revenue-ops':           'revenue-ops',
    'email-sequence':        'email-seq',
    'lead-outreach':         'outreach',
    'lead-magnets':          'lead-magnets',
    'landing-pages':         'landing-pages',
    'marketing-audit':       'mkt-audit',
    'channel-health':        'ch-health',
    'launch-strategy':       'launch',
    'sales-enablement':      'sales-enable',
    'referral-program':      'referral',
    'churn-prevention':      'churn',
    'action-plan':           'action-plan',
    'cro-audit':             'cro-audit',
    'performance-scorecard': 'performance',
  };
  return OVERRIDES[moduleId] ?? moduleId.replace(/-+/g, '-').slice(0, 16);
}

function storageKey(workspaceId: string): string {
  return `${PREFIX}${workspaceId}`;
}

export function loadPinnedChannels(workspaceId: string | undefined): PinnedChannel[] {
  if (!workspaceId) return [];
  try {
    const raw = localStorage.getItem(storageKey(workspaceId));
    return raw ? (JSON.parse(raw) as PinnedChannel[]) : [];
  } catch {
    return [];
  }
}

export function savePinnedChannels(workspaceId: string, channels: PinnedChannel[]): void {
  try {
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(channels));
  } catch { /* ignore */ }
}

/** Pin a module as a channel (idempotent — won't duplicate). */
export function pinChannel(workspaceId: string, moduleId: string): PinnedChannel[] {
  if (STATIC_CHANNEL_IDS.has(moduleId) || NON_CHANNEL_IDS.has(moduleId)) {
    return loadPinnedChannels(workspaceId);
  }
  const existing = loadPinnedChannels(workspaceId);
  if (existing.some(c => c.id === moduleId)) return existing;
  const updated: PinnedChannel[] = [
    ...existing,
    { id: moduleId, title: moduleIdToChannelTitle(moduleId), pinnedAt: Date.now() },
  ];
  savePinnedChannels(workspaceId, updated);
  return updated;
}

/** Unpin a module channel. */
export function unpinChannel(workspaceId: string, moduleId: string): PinnedChannel[] {
  const existing = loadPinnedChannels(workspaceId);
  const updated = existing.filter(c => c.id !== moduleId);
  savePinnedChannels(workspaceId, updated);
  return updated;
}
