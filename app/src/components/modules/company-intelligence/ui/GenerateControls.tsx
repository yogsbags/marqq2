import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Bot } from 'lucide-react'
import type { ArtifactRecord } from '../api'

type Props = {
  title: string
  disabled: boolean
  isGenerating: boolean
  artifact: ArtifactRecord | null
  defaultInputs?: Record<string, unknown>
  onGenerate: (inputs: Record<string, unknown>) => Promise<void>
  // New prop for competitor intelligence page
  showMonitoringOption?: boolean
}

export function GenerateControls({ title, disabled, isGenerating, artifact, defaultInputs, onGenerate, showMonitoringOption }: Props) {
  const [goal, setGoal] = useState<string>(String(defaultInputs?.goal || 'Increase qualified leads'))
  const [geo, setGeo] = useState<string>(String(defaultInputs?.geo || 'India'))
  const [timeframe, setTimeframe] = useState<string>(String(defaultInputs?.timeframe || '90 days'))
  const [channels, setChannels] = useState<string>(String((defaultInputs?.channels as any)?.join?.(', ') || 'instagram, linkedin, youtube, whatsapp'))
  const [notes, setNotes] = useState<string>(
    String(defaultInputs?.notes || 'Keep it compliance-safe (no guaranteed returns).')
  )
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [enableMonitoring, setEnableMonitoring] = useState<boolean>(true) // Auto-enable monitoring by default

  const basicInputs = useMemo(() => {
    const channelList = channels
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
    return { goal, geo, timeframe, channels: channelList, notes, enableMonitoring }
  }, [goal, geo, timeframe, channels, notes, enableMonitoring])

  const [advancedJson, setAdvancedJson] = useState<string>(JSON.stringify({ ...basicInputs }, null, 2))

  function syncAdvancedFromBasic() {
    setAdvancedJson(JSON.stringify({ ...basicInputs }, null, 2))
  }

  async function handleGenerate() {
    if (advancedOpen) {
      let parsed: any
      try {
        parsed = advancedJson ? JSON.parse(advancedJson) : {}
      } catch {
        throw new Error('Advanced inputs JSON is invalid')
      }
      await onGenerate(parsed)
      return
    }
    await onGenerate(basicInputs)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1.5">
            <Label>Goal</Label>
            <Input value={goal} onChange={(e) => setGoal(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Geo</Label>
              <Input value={geo} onChange={(e) => setGeo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Timeframe</Label>
              <Input value={timeframe} onChange={(e) => setTimeframe(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Channels (comma separated)</Label>
            <Input value={channels} onChange={(e) => setChannels(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[92px]" />
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                setAdvancedOpen((v) => !v)
                syncAdvancedFromBasic()
              }}
              variant="outline"
              disabled={disabled || isGenerating}
            >
              {advancedOpen ? 'Hide Advanced JSON' : 'Show Advanced JSON'}
            </Button>
            {artifact ? (
              <div className="text-xs text-muted-foreground">Updated: {new Date(artifact.updatedAt).toLocaleString()}</div>
            ) : (
              <div className="text-xs text-muted-foreground">No output yet</div>
            )}
          </div>

          {advancedOpen ? (
            <div className="space-y-1.5">
              <Label>Advanced inputs (JSON)</Label>
              <Textarea value={advancedJson} onChange={(e) => setAdvancedJson(e.target.value)} className="min-h-[180px]" />
            </div>
          ) : null}
        </div>

        {showMonitoringOption && (
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <Checkbox
              id="enable-monitoring"
              checked={enableMonitoring}
              onCheckedChange={(checked) => setEnableMonitoring(!!checked)}
              disabled={disabled || isGenerating}
            />
            <div className="flex-1">
              <Label htmlFor="enable-monitoring" className="cursor-pointer text-sm font-medium flex items-center">
                <Bot className="h-4 w-4 mr-1" /> Enable Automated Monitoring
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Automatically activate n8n workflow to monitor discovered competitors for news, funding, product launches, and pricing changes. Real-time alerts will appear in notifications panel.
              </p>
            </div>
          </div>
        )}

        <Button onClick={handleGenerate} disabled={disabled || isGenerating} className="w-full">
          {isGenerating ? 'Generating…' : 'Generate / Regenerate'}
        </Button>
      </CardContent>
    </Card>
  )
}

