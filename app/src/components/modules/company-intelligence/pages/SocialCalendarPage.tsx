import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { ArtifactRecord } from '../api'
import { useGtmContext } from '@/lib/gtmContext'
import { GtmContextBanner } from '@/components/ui/gtm-context-banner'

type Props = {
  artifact: ArtifactRecord | null
}

function asObj(data: unknown): any {
  return data && typeof data === 'object' ? (data as any) : null
}

function csvEscape(value: unknown) {
  const s = String(value ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function SocialCalendarPage({ artifact }: Props) {
  const { context: gtmCtx, dismiss: dismissGtm } = useGtmContext('company_intel_social_calendar')
  const data = asObj(artifact?.data)
  const [filterChannel, setFilterChannel] = useState('')
  const [filterFormat, setFilterFormat] = useState('')

  const items: any[] = Array.isArray(data?.items) ? data.items : []

  const channels = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) if (it?.channel) set.add(String(it.channel))
    return Array.from(set).sort()
  }, [items])

  const formats = useMemo(() => {
    const set = new Set<string>()
    for (const it of items) if (it?.format) set.add(String(it.format))
    return Array.from(set).sort()
  }, [items])

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filterChannel && String(it?.channel || '') !== filterChannel) return false
      if (filterFormat && String(it?.format || '') !== filterFormat) return false
      return true
    })
  }, [items, filterChannel, filterFormat])

  function downloadCsv() {
    const header = [
      'date',
      'channel',
      'format',
      'pillar',
      'hook',
      'captionBrief',
      'cta',
      'assetNotes',
      'complianceNote'
    ]
    const rows = filtered.map((it) => [
      it?.date,
      it?.channel,
      it?.format,
      it?.pillar,
      it?.hook,
      it?.captionBrief,
      it?.cta,
      it?.assetNotes,
      it?.complianceNote
    ])
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'social-calendar.csv'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  if (!artifact || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No calendar yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-700">Generate to get a multi-week content calendar with hooks, CTAs, and asset notes.</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {gtmCtx && <GtmContextBanner context={gtmCtx} onDismiss={dismissGtm} />}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Calendar Items</CardTitle>
            <Button variant="outline" size="sm" onClick={downloadCsv}>
              Export CSV
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="md:col-span-1">
                <div className="text-xs text-gray-600 mb-1">Channel</div>
                <select
                  value={filterChannel}
                  onChange={(e) => setFilterChannel(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm text-gray-800"
                >
                  <option value="">All</option>
                  {channels.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-1">
                <div className="text-xs text-gray-600 mb-1">Format</div>
                <select
                  value={filterFormat}
                  onChange={(e) => setFilterFormat(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm text-gray-800"
                >
                  <option value="">All</option>
                  {formats.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-1">
                <div className="text-xs text-gray-600 mb-1">Quick search (hook/pillar)</div>
                <Input
                  placeholder="Optional (client-side)"
                  onChange={(e) => {
                    const q = e.target.value.toLowerCase()
                    if (!q) return
                    // No stateful search yet; keep lightweight.
                  }}
                  disabled
                />
              </div>
            </div>

            <div className="space-y-2 max-h-[520px] overflow-auto">
              {filtered.map((it, idx) => (
                <div key={idx} className="border rounded-md p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-sm">{String(it?.date || '—')}</div>
                    <div className="text-xs text-gray-600">
                      {String(it?.channel || '—')} • {String(it?.format || '—')}
                    </div>
                  </div>
                  <div className="text-sm text-gray-900 mt-2">{String(it?.hook || '')}</div>
                  <div className="text-xs text-gray-700 mt-1">Pillar: {String(it?.pillar || '—')}</div>
                  <div className="text-xs text-gray-700 mt-1">CTA: {String(it?.cta || '—')}</div>
                  <div className="text-xs text-gray-600 mt-2">{String(it?.assetNotes || '')}</div>
                  <div className="text-xs text-gray-600 mt-1">{String(it?.complianceNote || '')}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Calendar Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>Timezone: {String(data.timezone || '—')}</div>
            <div>Start date: {String(data.startDate || '—')}</div>
            <div>Weeks: {String(data.weeks || '—')}</div>
            <div>Channels: {(Array.isArray(data.channels) ? data.channels : []).join(', ') || '—'}</div>
            <div>Cadence: {String(data.cadence?.postsPerWeek || '—')} posts/week</div>
            <div className="mt-2 text-xs text-gray-600">
              Themes: {(Array.isArray(data.themes) ? data.themes : []).slice(0, 8).join(' • ') || '—'}
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  )
}
