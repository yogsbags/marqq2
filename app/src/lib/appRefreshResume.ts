/**
 * Snapshot of the signed-in UI taken right before the "New version available"
 * hard reload. Survives the navigation (sessionStorage) so we can:
 *  - keep the user on the same module/hash
 *  - avoid bouncing through /login while auth rehydrates
 *  - avoid re-opening onboarding for accounts that were already past it
 */

export const APP_REFRESH_RESUME_KEY = 'marqq_app_refresh_resume';

export type AppRefreshResume = {
  /** Epoch ms when the refresh was requested */
  at: number;
  /** Path + search + hash to restore (without cache-bust params) */
  href: string;
  pathname: string;
  search: string;
  hash: string;
  /** Module deep-link (#m= / #ci=) if one was active */
  moduleId: string | null;
  /** True when the user was already past the onboarding gate */
  pastOnboarding: boolean;
  userId: string | null;
};

const MAX_AGE_MS = 5 * 60_000;

function moduleIdFromHash(hash: string): string | null {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!value) return null;
  if (value.startsWith('m=')) {
    try {
      return decodeURIComponent(value.slice(2)) || null;
    } catch {
      return value.slice(2) || null;
    }
  }
  if (value.startsWith('ci=')) return `ci-${value.slice(3)}`;
  if (value.startsWith('company-intel:')) return value;
  return null;
}

/** Build a clean URL without the `_build` cache-buster. */
export function cleanLocationHref(href = window.location.href): {
  href: string;
  pathname: string;
  search: string;
  hash: string;
} {
  const url = new URL(href);
  url.searchParams.delete('_build');
  const search = url.searchParams.toString();
  const searchPart = search ? `?${search}` : '';
  return {
    href: `${url.pathname}${searchPart}${url.hash}`,
    pathname: url.pathname,
    search: searchPart,
    hash: url.hash,
  };
}

export function saveAppRefreshResume(opts: {
  pastOnboarding: boolean;
  userId?: string | null;
}): AppRefreshResume {
  const clean = cleanLocationHref();
  const payload: AppRefreshResume = {
    at: Date.now(),
    href: clean.href,
    pathname: clean.pathname,
    search: clean.search,
    hash: clean.hash,
    moduleId: moduleIdFromHash(clean.hash),
    pastOnboarding: opts.pastOnboarding,
    userId: opts.userId ?? null,
  };
  try {
    sessionStorage.setItem(APP_REFRESH_RESUME_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  return payload;
}

export function peekAppRefreshResume(): AppRefreshResume | null {
  try {
    const raw = sessionStorage.getItem(APP_REFRESH_RESUME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppRefreshResume;
    if (!parsed || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > MAX_AGE_MS) {
      sessionStorage.removeItem(APP_REFRESH_RESUME_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearAppRefreshResume(): void {
  try {
    sessionStorage.removeItem(APP_REFRESH_RESUME_KEY);
  } catch {
    /* ignore */
  }
}

/** True for a short window after a version refresh — auth/onboarding gates should stay out of the way. */
export function isAppRefreshResumeActive(userId?: string | null): boolean {
  const resume = peekAppRefreshResume();
  if (!resume) return false;
  if (userId && resume.userId && resume.userId !== userId) return false;
  return true;
}

export function shouldSkipOnboardingAfterRefresh(userId?: string | null): boolean {
  const resume = peekAppRefreshResume();
  if (!resume?.pastOnboarding) return false;
  if (userId && resume.userId && resume.userId !== userId) return false;
  return true;
}
