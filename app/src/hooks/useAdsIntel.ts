import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface CompetitorAd {
  id: string
  competitor_name: string
  platform: 'linkedin' | 'facebook' | 'google'
  ad_id: string
  advertiser: string | null
  headline: string | null
  body: string | null
  cta_text: string | null
  destination_url: string | null
  media_type: string | null
  media_url: string | null
  targeting: Record<string, unknown> | null
  impressions_min: number | null
  impressions_max: number | null
  spend_min: number | null
  spend_max: number | null
  currency: string
  is_active: boolean | null
  start_date: string | null
  end_date: string | null
  scraped_at: string
}

export function useAdsIntel(companyId: string | undefined) {
  const [ads, setAds] = useState<CompetitorAd[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    supabase
      .from('competitor_ads')
      .select('id,competitor_name,platform,ad_id,advertiser,headline,body,cta_text,destination_url,media_type,media_url,targeting,impressions_min,impressions_max,spend_min,spend_max,currency,is_active,start_date,end_date,scraped_at')
      .eq('company_id', companyId)
      .order('scraped_at', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) setError(error.message)
        setAds((data as CompetitorAd[]) || [])
      })
      .finally(() => setLoading(false))
  }, [companyId])

  const byCompetitor = ads.reduce<Record<string, CompetitorAd[]>>((acc, ad) => {
    acc[ad.competitor_name] = acc[ad.competitor_name] || []
    acc[ad.competitor_name].push(ad)
    return acc
  }, {})

  const byPlatform = ads.reduce<Record<string, CompetitorAd[]>>((acc, ad) => {
    acc[ad.platform] = acc[ad.platform] || []
    acc[ad.platform].push(ad)
    return acc
  }, {})

  const competitors = [...new Set(ads.map(a => a.competitor_name))]

  return { ads, byCompetitor, byPlatform, competitors, loading, error }
}
