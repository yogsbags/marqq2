import { useCallback, useEffect, useState } from 'react'

export interface AdsAnalysis {
  channel_gaps: Array<{
    channel: string
    insight: string
    competitors_active: string[]
    recommendation: string
  }>
  messaging_themes: Array<{
    theme: string
    competitors: string[]
    example_copy: string
    angle: string
  }>
  competitor_summary: Array<{
    name: string
    primary_message: string
    icp_signal: string
    ad_intensity: 'high' | 'medium' | 'low' | 'none'
  }>
  white_space: Array<{
    opportunity: string
    rationale: string
  }>
  recommended_angles: Array<{
    headline: string
    body: string
    platform: string
    why: string
  }>
  generated_at?: string
}

export function useAdsAnalysis(companyId: string | undefined) {
  const [analysis, setAnalysis] = useState<AdsAnalysis | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    fetch(`/api/ads-intel/${companyId}/analysis`)
      .then(r => r.json())
      .then(({ analysis, updated_at }) => {
        setAnalysis(analysis || null)
        setUpdatedAt(updated_at || null)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [companyId])

  const runAnalysis = useCallback(async () => {
    if (!companyId) return
    setAnalyzing(true)
    setError(null)
    try {
      const resp = await fetch(`/api/ads-intel/${companyId}/analyze`, { method: 'POST' })
      const data = await resp.json()
      if (data.error) throw new Error(data.error)
      setAnalysis(data.analysis)
      setUpdatedAt(data.analysis?.generated_at || new Date().toISOString())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAnalyzing(false)
    }
  }, [companyId])

  return { analysis, updatedAt, loading, analyzing, error, runAnalysis }
}
