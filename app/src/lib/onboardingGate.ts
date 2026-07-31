/** Per-user onboarding completion flag (avoids cross-account contamination on shared browsers). */
export function onboardedStorageKey(userId: string) {
  return `marqq_onboarded:${userId}`;
}

/** Sticky "must onboard" flag — survives auth races and bad Supabase metadata. */
export function needsOnboardingStorageKey(userId: string) {
  return `marqq_needs_onboarding:${userId}`;
}

export function markUserOnboardedLocal(userId: string) {
  try {
    localStorage.setItem(onboardedStorageKey(userId), '1');
    // Keep legacy key in sync for older tour code paths
    localStorage.setItem('marqq_onboarded', '1');
    localStorage.removeItem(needsOnboardingStorageKey(userId));
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
 * Mark this account as incomplete for GTM onboarding.
 * Cleared ONLY when the user finishes/skips the onboarding flow — never by SIGNED_IN.
 */
export function markNeedsOnboarding(userId: string) {
  try {
    localStorage.setItem(needsOnboardingStorageKey(userId), '1');
    localStorage.removeItem(onboardedStorageKey(userId));
    localStorage.removeItem('marqq_onboarded');
  } catch {
    /* ignore */
  }
  markJustSignedUpPending();
}

export function clearNeedsOnboarding(userId?: string | null) {
  try {
    if (userId) localStorage.removeItem(needsOnboardingStorageKey(userId));
  } catch {
    /* ignore */
  }
  clearJustSignedUpPending();
}

export function accountNeedsOnboardingFlag(userId: string): boolean {
  try {
    return localStorage.getItem(needsOnboardingStorageKey(userId)) === '1';
  } catch {
    return false;
  }
}

export const JUST_SIGNED_UP_KEY = 'marqq_just_signed_up';

/** Call as soon as signup/login starts for an incomplete account — before auth events race. */
export function markJustSignedUpPending() {
  try {
    sessionStorage.setItem(JUST_SIGNED_UP_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function clearJustSignedUpPending() {
  try {
    sessionStorage.removeItem(JUST_SIGNED_UP_KEY);
  } catch {
    /* ignore */
  }
}

export function isJustSignedUpPending(): boolean {
  try {
    return sessionStorage.getItem(JUST_SIGNED_UP_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Decide whether the authenticated user must complete the workspace GTM onboarding.
 *
 * Prefer showing onboarding over skipping:
 * 1. Version-refresh resume (user was already past onboarding) → stay put
 * 2. Per-user `marqq_needs_onboarding:<id>` (set at signup) → always onboard
 * 3. Session pending flag → always onboard
 * 4. Per-user local completion cache → done
 * 5. Supabase user_metadata.onboarded === true → done (returning / cross-device)
 * 6. Otherwise → needs onboarding
 *
 * Never skip solely because of the shared `marqq_onboarded` key.
 * Auth SIGNED_IN must never clear the needs-onboarding marker.
 */
export function userNeedsOnboarding(user: {
  id: string;
  onboarded?: boolean;
} | null): boolean {
  if (!user?.id) return false;

  // Version refresh: keep the same screen — don't dump them back into onboarding.
  try {
    // Lazy import-safe check via sessionStorage key (avoid circular deps at module load)
    const raw = sessionStorage.getItem('marqq_app_refresh_resume');
    if (raw) {
      const resume = JSON.parse(raw) as {
        at?: number;
        pastOnboarding?: boolean;
        userId?: string | null;
      };
      const fresh = typeof resume.at === 'number' && Date.now() - resume.at < 5 * 60_000;
      const sameUser = !resume.userId || resume.userId === user.id;
      if (fresh && sameUser && resume.pastOnboarding) return false;
    }
  } catch {
    /* ignore */
  }

  // Sticky incomplete marker beats metadata races (past bugs wrote onboarded:true early)
  if (accountNeedsOnboardingFlag(user.id)) return true;

  if (isJustSignedUpPending()) return true;

  // Explicitly completed on this device
  try {
    if (localStorage.getItem(onboardedStorageKey(user.id)) === '1') return false;
  } catch {
    /* ignore */
  }

  // Returning user completed elsewhere
  if (user.onboarded === true) return false;

  // No completion markers → must onboard
  return true;
}
