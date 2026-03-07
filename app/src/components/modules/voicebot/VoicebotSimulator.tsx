import { useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

type DialogueResponse = {
  sessionId: string
  assistantText: string
  citations?: Array<{ fileId: string; fileName: string }>
}

async function blobToBase64(blob: Blob) {
  const arrayBuffer = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(arrayBuffer)
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return window.btoa(binary)
}

export function VoicebotSimulator() {
  const [language, setLanguage] = useState<'en' | 'hi'>('en')
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('female')
  const [sessionId, setSessionId] = useState<string>('')

  const [recording, setRecording] = useState(false)
  const [working, setWorking] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const [transcript, setTranscript] = useState('')
  const [assistantText, setAssistantText] = useState('')
  const [citations, setCitations] = useState<Array<{ fileId: string; fileName: string }>>([])
  const [manualText, setManualText] = useState('')

  const canUseMediaRecorder = useMemo(() => typeof window !== 'undefined' && 'MediaRecorder' in window, [])

  async function startRecording() {
    if (!canUseMediaRecorder) {
      toast.error('MediaRecorder not supported in this browser')
      return
    }
    setTranscript('')
    setAssistantText('')
    setCitations([])
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mr
      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
      }
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
      }
      mr.start()
      setRecording(true)
      toast.success('Recording… click Stop when done')
    } catch (err: any) {
      toast.error(err?.message || 'Mic permission failed')
    }
  }

  async function stopRecording() {
    const mr = mediaRecorderRef.current
    if (!mr) return
    setRecording(false)
    mr.stop()
    await new Promise((r) => setTimeout(r, 250))
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    await runSttAndRespond(blob)
  }

  async function runSttAndRespond(blob: Blob) {
    setWorking(true)
    try {
      const audioBase64 = await blobToBase64(blob)
      const sttResp = await fetch('/api/voicebot/stt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType: blob.type || 'audio/webm',
          language
        })
      })
      const sttJson = await sttResp.json().catch(() => ({}))
      if (!sttResp.ok) throw new Error(sttJson?.error || sttJson?.details || 'STT failed')
      const text = String(sttJson?.transcript || '').trim()
      setTranscript(text)
      if (!text) throw new Error('No transcript detected')

      const dlg = await fetch('/api/voicebot/dialogue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId || undefined, userText: text, language, voiceGender })
      })
      const dlgJson = (await dlg.json().catch(() => ({}))) as DialogueResponse & { error?: string; details?: string }
      if (!dlg.ok) throw new Error(dlgJson?.error || dlgJson?.details || 'Dialogue failed')

      setSessionId(dlgJson.sessionId)
      setAssistantText(dlgJson.assistantText)
      setCitations(Array.isArray(dlgJson.citations) ? dlgJson.citations : [])

      const tts = await fetch('/api/voicebot/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: dlgJson.assistantText, language, gender: voiceGender })
      })
      const ttsJson = await tts.json().catch(() => ({}))
      if (!tts.ok) throw new Error(ttsJson?.error || ttsJson?.message || 'TTS failed')
      const returnedAudioBase64 = ttsJson?.audioBase64
      if (!returnedAudioBase64) throw new Error('No audio returned')
      const audio = new Audio(`data:${ttsJson?.mimeType || 'audio/mpeg'};base64,${returnedAudioBase64}`)
      await audio.play()
    } catch (err: any) {
      toast.error(err?.message || 'Voicebot simulator failed')
    } finally {
      setWorking(false)
    }
  }

  async function submitManualText() {
    const text = manualText.trim()
    if (!text) return
    setWorking(true)
    setTranscript(text)
    setAssistantText('')
    setCitations([])
    try {
      const dlg = await fetch('/api/voicebot/dialogue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId || undefined, userText: text, language, voiceGender })
      })
      const dlgJson = (await dlg.json().catch(() => ({}))) as DialogueResponse & { error?: string; details?: string }
      if (!dlg.ok) throw new Error(dlgJson?.error || dlgJson?.details || 'Dialogue failed')

      setSessionId(dlgJson.sessionId)
      setAssistantText(dlgJson.assistantText)
      setCitations(Array.isArray(dlgJson.citations) ? dlgJson.citations : [])

      const tts = await fetch('/api/voicebot/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: dlgJson.assistantText, language, gender: voiceGender })
      })
      const ttsJson = await tts.json().catch(() => ({}))
      if (!tts.ok) throw new Error(ttsJson?.error || ttsJson?.message || 'TTS failed')
      const audioBase64 = ttsJson?.audioBase64
      if (!audioBase64) throw new Error('No audio returned')
      const audio = new Audio(`data:${ttsJson?.mimeType || 'audio/mpeg'};base64,${audioBase64}`)
      await audio.play()
      setManualText('')
    } catch (err: any) {
      toast.error(err?.message || 'Send failed')
    } finally {
      setWorking(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Voicebot Simulator (Sarvam + Groq)</CardTitle>
        <CardDescription className="text-sm">
          Test the same workflow steps, but with real STT/TTS + dialogue + KB tool calling.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value === 'hi' ? 'hi' : 'en')}
            className="px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm text-gray-800"
          >
            <option value="en">English</option>
            <option value="hi">Hindi</option>
          </select>
          <select
            value={voiceGender}
            onChange={(e) => setVoiceGender(e.target.value === 'male' ? 'male' : 'female')}
            className="px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-sm text-gray-800"
          >
            <option value="female">Female (Sarvam)</option>
            <option value="male">Male (Sarvam)</option>
          </select>
          <Badge className="bg-gray-100 text-gray-800">Session: {sessionId ? sessionId.slice(0, 8) : 'new'}</Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          {!recording ? (
            <Button onClick={startRecording} disabled={working}>
              Start recording
            </Button>
          ) : (
            <Button variant="destructive" onClick={stopRecording} disabled={working}>
              Stop
            </Button>
          )}
          <Badge className={canUseMediaRecorder ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-900'}>
            {canUseMediaRecorder ? 'Mic ready' : 'Mic unsupported'}
          </Badge>
          {working ? <Badge className="bg-orange-100 text-orange-800">Working…</Badge> : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="text-xs text-gray-600">Transcript</div>
            <div className="border rounded-md p-3 text-sm min-h-[92px] bg-white">{transcript || '—'}</div>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-gray-600">Assistant</div>
            <div className="border rounded-md p-3 text-sm min-h-[92px] bg-white">{assistantText || '—'}</div>
          </div>
        </div>

        {citations.length ? (
          <div className="text-xs text-gray-700">
            Used KB: {citations.map((c) => c.fileName).join(', ')}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="text-xs text-gray-600">Manual text (skip STT)</div>
          <Textarea value={manualText} onChange={(e) => setManualText(e.target.value)} className="min-h-[80px]" />
          <Button variant="outline" onClick={submitManualText} disabled={working || !manualText.trim()}>
            Send
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
