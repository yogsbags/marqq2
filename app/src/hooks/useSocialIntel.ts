import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface SocialPost {
  id: string
  platform: 'instagram' | 'twitter' | 'facebook' | 'youtube' | 'linkedin'
  handle: string
  account_type: 'own' | 'competitor'
  post_url: string
  fetched_at: string
  intelligence: {
    summary: string
    topics: string[]
    key_messages: string[]
    content_type: string
    sentiment: string
    entities: string[]
    cta: string
  } | null
  raw_data: Record<string, unknown> | null
}

export interface SocialAccount {
  id: string
  platform: string
  handle: string
  display_name: string | null
  account_type: 'own' | 'competitor'
  profile_url: string | null
  active: boolean
  last_fetched_at: string | null
}

export function useSocialIntel(companyId: string | undefined) {
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!companyId) return
    setLoading(true)

    Promise.all([
      supabase
        .from('social_posts')
        .select('id, platform, handle, account_type, post_url, fetched_at, intelligence, raw_data')
        .eq('company_id', companyId)
        .not('intelligence', 'is', null)
        .order('fetched_at', { ascending: false })
        .limit(100),
      supabase
        .from('social_accounts')
        .select('id, platform, handle, display_name, account_type, profile_url, active, last_fetched_at')
        .eq('company_id', companyId)
        .order('platform'),
    ]).then(([postsRes, accountsRes]) => {
      if (postsRes.error)    setError(postsRes.error.message)
      if (accountsRes.error) setError(accountsRes.error.message)
      setPosts((postsRes.data as SocialPost[]) || [])
      setAccounts((accountsRes.data as SocialAccount[]) || [])
    }).finally(() => setLoading(false))
  }, [companyId])

  // Grouped by platform for easy rendering
  const byPlatform = posts.reduce<Record<string, SocialPost[]>>((acc, p) => {
    acc[p.platform] = acc[p.platform] || []
    acc[p.platform].push(p)
    return acc
  }, {})

  // Grouped by handle for competitor comparison
  const byHandle = posts.reduce<Record<string, SocialPost[]>>((acc, p) => {
    acc[p.handle] = acc[p.handle] || []
    acc[p.handle].push(p)
    return acc
  }, {})

  // Sentiment breakdown
  const sentimentCounts = posts.reduce<Record<string, number>>((acc, p) => {
    const s = p.intelligence?.sentiment || 'unknown'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})

  // Content type breakdown
  const contentTypeCounts = posts.reduce<Record<string, number>>((acc, p) => {
    const c = p.intelligence?.content_type || 'unknown'
    acc[c] = (acc[c] || 0) + 1
    return acc
  }, {})

  return {
    posts,
    accounts,
    byPlatform,
    byHandle,
    sentimentCounts,
    contentTypeCounts,
    loading,
    error,
  }
}
