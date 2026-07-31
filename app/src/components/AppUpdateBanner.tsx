import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { userNeedsOnboarding } from '@/lib/onboardingGate'
import { cleanLocationHref, saveAppRefreshResume } from '@/lib/appRefreshResume'

const POLL_MS = 60_000
const CURRENT_BUILD_ID = String(import.meta.env.VITE_APP_BUILD_ID || 'dev')

type VersionPayload = {
  buildId?: string
  builtAt?: string
}

async function fetchRemoteBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    })
    if (!res.ok) return null
    const json = (await res.json()) as VersionPayload
    const id = typeof json?.buildId === 'string' ? json.buildId.trim() : ''
    return id || null
  } catch {
    return null
  }
}

/**
 * Hard navigation that bypasses bfcache / stale index.html after deploys,
 * while preserving the signed-in screen (hash + onboarding state).
 */
function hardReloadToLatest(opts: { pastOnboarding: boolean; userId: string | null }) {
  saveAppRefreshResume({
    pastOnboarding: opts.pastOnboarding,
    userId: opts.userId,
  })

  const clean = cleanLocationHref()
  const url = new URL(clean.href, window.location.origin)
  url.searchParams.set('_build', String(Date.now()))
  // replace() avoids stacking history entries of stale shells
  window.location.replace(`${url.pathname}${url.search}${url.hash}`)
}

/**
 * Polls /version.json after deploys. Shows a banner when the running tab
 * is on an older build than the server.
 */
export function AppUpdateBanner() {
  const { user, isAuthenticated } = useAuth()
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [remoteBuildId, setRemoteBuildId] = useState<string | null>(null)

  useEffect(() => {
    // Dev / missing build id: skip noisy banners
    if (!CURRENT_BUILD_ID || CURRENT_BUILD_ID === 'dev') return

    let cancelled = false

    const check = async () => {
      const remote = await fetchRemoteBuildId()
      if (cancelled || !remote) return
      if (remote !== CURRENT_BUILD_ID) {
        setRemoteBuildId(remote)
        setUpdateAvailable(true)
      }
    }

    void check()
    const timer = window.setInterval(() => void check(), POLL_MS)

    const onFocus = () => void check()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void check()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onPageShow)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])

  if (!updateAvailable) return null

  const pastOnboarding = isAuthenticated && !!user && !userNeedsOnboarding(user)

  return (
    <div className="fixed inset-x-0 top-0 z-[100] flex justify-center px-3 pt-3 pointer-events-none">
      <div className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-2xl border border-orange-500/40 bg-zinc-950/95 px-4 py-3 text-sm text-zinc-100 shadow-lg shadow-orange-500/10 backdrop-blur">
        <RefreshCw className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-zinc-50">New version available</p>
          <p className="text-xs text-zinc-400">
            Refresh to load the latest deploy. You stay on this screen.
            {remoteBuildId ? (
              <span className="ml-1 font-mono text-zinc-500">
                ({CURRENT_BUILD_ID.slice(0, 7)} → {remoteBuildId.slice(0, 7)})
              </span>
            ) : null}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0 bg-orange-500 px-3 text-xs text-white hover:bg-orange-600"
          onClick={() =>
            hardReloadToLatest({
              pastOnboarding,
              userId: user?.id ?? null,
            })
          }
        >
          Refresh
        </Button>
      </div>
    </div>
  )
}
