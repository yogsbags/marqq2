import { useEffect, useMemo, useState } from 'react'
import { LiveKitRoom, RoomAudioRenderer, ControlBar, AudioConference } from '@livekit/components-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

type LiveKitConfig = {
  livekitUrl: string | null
  configured: boolean
  providers?: any
}

type TokenResponse = {
  livekitUrl: string
  roomName: string
  identity: string
  participantName: string
  token: string
}

export function LiveKitVoiceSession() {
  const [config, setConfig] = useState<LiveKitConfig | null>(null)
  const [roomName, setRoomName] = useState('voicebot-demo')
  const [participantName, setParticipantName] = useState('User')
  const [token, setToken] = useState<TokenResponse | null>(null)
  const [language, setLanguage] = useState<'en' | 'hi'>('en')
  const [gender, setGender] = useState<'male' | 'female'>('female')
  const [dispatching, setDispatching] = useState(false)

  const canConnect = useMemo(() => Boolean(token?.token && token?.livekitUrl), [token])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const resp = await fetch('/api/voicebot/livekit/config')
        const json = (await resp.json()) as LiveKitConfig
        if (cancelled) return
        setConfig(json)
      } catch {
        if (cancelled) return
        setConfig(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function mintToken() {
    setToken(null)
    try {
      const resp = await fetch('/api/voicebot/livekit/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roomName, participantName, publish: true })
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(json?.error || json?.details || 'Failed to mint token')
      setToken(json as TokenResponse)
      toast.success('LiveKit token ready')
    } catch (err: any) {
      toast.error(err?.message || 'Token request failed')
    }
  }

  async function dispatchAgent() {
    if (!roomName.trim()) return
    setDispatching(true)
    try {
      const resp = await fetch('/api/voicebot/livekit/dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roomName, language, gender })
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(json?.error || json?.details || 'Dispatch failed')
      toast.success('Agent dispatched to room')
    } catch (err: any) {
      toast.error(err?.message || 'Dispatch failed')
    } finally {
      setDispatching(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">LiveKit Realtime Session</CardTitle>
          <Badge className={config?.configured ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-900'}>
            {config?.configured ? 'configured' : 'needs env vars'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <div className="text-xs text-gray-600 mb-1">Room</div>
              <Input value={roomName} onChange={(e) => setRoomName(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Participant name</div>
              <Input value={participantName} onChange={(e) => setParticipantName(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={mintToken} disabled={!config?.configured}>
                Create session
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <div className="text-xs text-gray-600 mb-1">Agent language</div>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value === 'hi' ? 'hi' : 'en')}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm text-gray-800"
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
              </select>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Agent voice</div>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value === 'male' ? 'male' : 'female')}
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm text-gray-800"
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="w-full" onClick={dispatchAgent} disabled={!config?.configured || !canConnect || dispatching}>
                {dispatching ? 'Dispatching…' : 'Start Agent'}
              </Button>
            </div>
          </div>

          <div className="text-xs text-gray-600">
            LiveKit URL: <span className="font-mono">{config?.livekitUrl || '—'}</span>
          </div>
          <div className="text-xs text-gray-600">
            Providers: STT Deepgram ({config?.providers?.stt?.configured ? 'ok' : 'missing'}) • TTS Cartesia • LLM OpenAI (
            {config?.providers?.llm?.configured ? 'ok' : 'missing'})
          </div>
        </CardContent>
      </Card>

      {canConnect ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">In-room Audio</CardTitle>
          </CardHeader>
          <CardContent>
            <LiveKitRoom
              token={token!.token}
              serverUrl={token!.livekitUrl}
              connect={true}
              audio={true}
              video={false}
              data-lk-theme="default"
              style={{ height: 420 }}
            >
              <RoomAudioRenderer />
              <AudioConference />
              <div className="mt-3">
                <ControlBar controls={{ camera: false, screenShare: false }} />
              </div>
            </LiveKitRoom>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
