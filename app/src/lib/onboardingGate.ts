/** Per-user onboarding completion flag (avoids cross-account contamination on shared browsers). */
export function onboardedStorageKey(userId: string) {
  return `marqq_onboarded:${userId}`;
}

export function markUserOnboardedLocal(userId: string) {
  try {
    localStorage.setItem(onboardedStorageKey(userId), '1');
    // Keep legacy key in sync for older tour code paths
    localStorage.setItem('marqq_onboarded', '1');
  } catch {
    /* ignore */
  }
}

export function clearUserOnboardedLocal(userId?: string | null) {
  try {
    localStorage.removeItem('marqq_onboarded');
    if (userId) localStorage.removeItem(onboardedStorageKey(userId));
  } catch {
    /* ignore */
  }
}

/**
 * Decide whether the authenticated user must complete the workspace GTM onboarding.
 * Source of truth: Supabase user_metadata.onboarded, with per-user localStorage cache.
 * Fresh signup (session flag) always forces onboarding and ignores stale device flags.
 */
export function userNeedsOnboarding(user: {
  id: string;
  onboarded?: boolean;
} | null): boolean {
  if (!user?.id) return false;

  let justSignedUp = false;
  try {
    justSignedUp = sessionStorage.getItem('marqq_just_signed_up') === '1';
  } catch {
    justSignedUp = false;
  }

  // Brand-new signup always enters onboarding (ignore stale device flags from other accounts)
  if (justSignedUp) return true;

  // Completed in Supabase metadata
  if (user.onboarded === true) return false;

  try {
    if (localStorage.getItem(onboardedStorageKey(user.id)) === '1') return false;
  } catch {
    /* ignore */
  }

  // Explicitly not onboarded
  if (user.onboarded === false) return true;

  // Legacy: migrate global device flag → per-user, then skip
  try {
    if (localStorage.getItem('marqq_onboarded') === '1') {
      localStorage.setItem(onboardedStorageKey(user.id), '1');
      return false;
    }
  } catch {
    /* ignore */
  }

  // No completion markers — needs onboarding
  return true;
}
