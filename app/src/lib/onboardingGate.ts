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
 * Rules (strict — prefer showing onboarding over skipping):
 * 1. Fresh signup / incomplete-login session flag → always onboard
 * 2. Supabase user_metadata.onboarded === true → done (unless just-signed-up)
 * 3. Per-user local completion cache → done
 * 4. Otherwise → needs onboarding
 *
 * Never skip solely because a shared device flag `marqq_onboarded` is set —
 * that caused new accounts in shared browsers (and races) to bypass the flow.
 */
export function userNeedsOnboarding(user: {
  id: string;
  onboarded?: boolean;
} | null): boolean {
  if (!user?.id) return false;

  if (isJustSignedUpPending()) return true;

  // Explicitly completed in Supabase
  if (user.onboarded === true) return false;

  // Per-user device cache only (never the global legacy key alone)
  try {
    if (localStorage.getItem(onboardedStorageKey(user.id)) === '1') return false;
  } catch {
    /* ignore */
  }

  // Not complete in metadata → must onboard (covers false, undefined, missing)
  return true;
}
