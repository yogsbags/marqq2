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

/** GTM strategy section channels use the `gtm-section:<moduleId>:<sectionId>` ID scheme. */
export function isGtmSectionChannelId(moduleId: string): boolean {
  return moduleId.startsWith('gtm-section:');
}

export function gtmSectionChannelId(moduleId: string, sectionId: string): string {
  return `gtm-section:${moduleId}:${sectionId}`;
}

// Module IDs that are ALWAYS shown statically — never stored in pinnedChannels
export const STATIC_CHANNEL_IDS = new Set([
  'home', 'main', 'performance-scorecard', 'crm', 'calendar',
  'execution-outreach', 'execution-content', 'execution-blog-seo',
  'execution-landing-pages', 'execution-lead-magnets', 'execution-social',
  'execution-dashboard', 'execution-monitoring',
]);

// Non-channel module IDs that should never be pinned as channels
export const NON_CHANNEL_IDS = new Set([
  'integrations', 'settings', 'help', 'dashboard', 'workspace-files',
  'scheduled-jobs', 'chat-sessions', 'profile', 'setup',
]);

/** Derive a short human-readable channel title from a module ID */
export function moduleIdToChannelTitle(moduleId: string): string {
  if (moduleId.startsWith('gtm-section:')) {
    const sectionId = moduleId.split(':')[2] || 'strategy'
    return sectionId.replace(/_/g, '-').slice(0, 24)
  }
  if (moduleId.startsWith('ci-')) {
    const page = moduleId.slice(3);
    const CI_TITLES: Record<string, string> = {
      icps: 'icps',
      competitor_intelligence: 'competitors',
      positioning_messaging: 'positioning',
      sales_enablement: 'sales-enable',
      pricing_intelligence: 'pricing',
      content_strategy: 'content',
      channel_strategy: 'channels',
      social_calendar: 'social-cal',
      lead_magnets: 'lead-magnets',
      marketing_strategy: 'mkt-strategy',
      opportunities: 'opportunities',
      website_audit: 'site-audit',
      client_profiling: 'clients',
      partner_profiling: 'partners',
      lookalike_audiences: 'lookalikes',
      overview: 'company',
    };
    return CI_TITLES[page] || page.replace(/_/g, '-').slice(0, 16);
  }
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
    'crm':                   'crm',
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
  return pinChannels(workspaceId, [moduleId]);
}

/** Pin several modules as channels in one pass, preserving the given order. */
export function pinChannels(workspaceId: string, moduleIds: string[]): PinnedChannel[] {
  const existing = loadPinnedChannels(workspaceId);
  const byId = new Map(existing.map((c) => [c.id, c]));
  const now = Date.now();
  let changed = false;
  moduleIds.forEach((moduleId, index) => {
    if (!moduleId || STATIC_CHANNEL_IDS.has(moduleId) || NON_CHANNEL_IDS.has(moduleId)) return;
    if (byId.has(moduleId)) return;
    byId.set(moduleId, {
      id: moduleId,
      title: moduleIdToChannelTitle(moduleId),
      pinnedAt: now + index,
    });
    changed = true;
  });
  const updated = [...byId.values()];
  if (changed) savePinnedChannels(workspaceId, updated);
  return updated;
}

/**
 * Make the sidebar mirror the strategy document: every section of `gtmModuleId`
 * becomes a channel in `sectionIds` order, and sections that no longer exist
 * (e.g. after a regenerate) are dropped.
 */
export function syncGtmSectionChannels(
  workspaceId: string,
  gtmModuleId: string,
  sectionIds: string[],
): PinnedChannel[] {
  const wanted = sectionIds.map((sectionId) => gtmSectionChannelId(gtmModuleId, sectionId));
  const wantedSet = new Set(wanted);
  const existing = loadPinnedChannels(workspaceId);
  const kept = existing.filter(
    (c) => !c.id.startsWith(`gtm-section:${gtmModuleId}:`) || wantedSet.has(c.id),
  );
  const existingById = new Map(kept.map((c) => [c.id, c]));
  const now = Date.now();
  const sectionChannels: PinnedChannel[] = wanted.map((id, index) => ({
    id,
    title: moduleIdToChannelTitle(id),
    pinnedAt: existingById.get(id)?.pinnedAt ?? now + index,
  }));
  const others = kept.filter((c) => !wantedSet.has(c.id));
  const updated = [...others, ...sectionChannels];
  const unchanged =
    updated.length === existing.length &&
    updated.every((c, i) => existing[i]?.id === c.id && existing[i]?.title === c.title);
  if (!unchanged) savePinnedChannels(workspaceId, updated);
  return updated;
}

/** Unpin a module channel. */
export function unpinChannel(workspaceId: string, moduleId: string): PinnedChannel[] {
  const existing = loadPinnedChannels(workspaceId);
  const updated = existing.filter(c => c.id !== moduleId);
  savePinnedChannels(workspaceId, updated);
  return updated;
}
