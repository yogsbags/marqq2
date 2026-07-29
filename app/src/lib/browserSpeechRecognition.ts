type SupportedLanguage = 'en' | 'hi'

type BrowserRecognitionAlternative = {
  transcript: string
}

type BrowserRecognitionResult = {
  isFinal: boolean
  0: BrowserRecognitionAlternative
}

type BrowserRecognitionResultList = {
  length: number
  [index: number]: BrowserRecognitionResult
}

type BrowserSpeechRecognitionEvent = {
  resultIndex: number
  results: BrowserRecognitionResultList
}

type BrowserSpeechRecognitionErrorEvent = {
  error?: string
}

type BrowserSpeechRecognitionInstance = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognitionInstance

export type BrowserSpeechSession = {
  stop: () => Promise<string>
  abort: () => void
}

export type BrowserSpeechOptions = {
  onPartial?: (text: string) => void
}

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionCtor
    webkitSpeechRecognition?: BrowserSpeechRecognitionCtor
  }
}

function getSpeechRecognitionCtor(): BrowserSpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

function mapLanguage(language: SupportedLanguage): string {
  return language === 'hi' ? 'hi-IN' : 'en-IN'
}

function normalizeTranscript(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function mapSpeechError(error: string | undefined): string {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Browser speech recognition permission was denied.'
    case 'no-speech':
      return 'No speech detected.'
    case 'audio-capture':
      return 'No working microphone was detected for browser speech recognition.'
    case 'network':
      return 'Browser speech recognition had a network issue.'
    default:
      return 'Browser speech recognition failed.'
  }
}

export function browserSpeechRecognitionSupported(): boolean {
  return Boolean(getSpeechRecognitionCtor())
}

const STOP_TIMEOUT_MS = 2500

export function startBrowserSpeechRecognition(
  language: SupportedLanguage,
  options: BrowserSpeechOptions = {},
): BrowserSpeechSession | null {
  const SpeechRecognitionCtor = getSpeechRecognitionCtor()
  if (!SpeechRecognitionCtor) return null

  const recognition = new SpeechRecognitionCtor()
  recognition.lang = mapLanguage(language)
  recognition.continuous = true
  recognition.interimResults = true
  recognition.maxAlternatives = 1

  let latestFinal = ''
  let latestInterim = ''
  let latestError = ''
  let stopResolver: ((value: string) => void) | null = null
  let stopRejecter: ((reason?: unknown) => void) | null = null
  let settled = false
  let ended = false

  const currentText = () => normalizeTranscript(`${latestFinal} ${latestInterim}`)

  const finalize = () => {
    if (settled) return
    settled = true
    ended = true
    if (latestError && !latestFinal && !latestInterim) {
      stopRejecter?.(new Error(mapSpeechError(latestError)))
      return
    }
    stopResolver?.(currentText())
  }

  recognition.onresult = (event: BrowserSpeechRecognitionEvent) => {
    let finalText = ''
    let interimText = ''
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index]
      const transcript = result[0]?.transcript || ''
      if (result.isFinal) finalText += ` ${transcript}`
      else interimText += ` ${transcript}`
    }
    if (finalText.trim()) latestFinal = normalizeTranscript(`${latestFinal} ${finalText}`)
    latestInterim = normalizeTranscript(interimText)
    options.onPartial?.(currentText())
  }

  recognition.onerror = (event: BrowserSpeechRecognitionErrorEvent) => {
    latestError = event.error || 'unknown'
  }

  recognition.onend = () => {
    ended = true
    // Only settle the stop() promise once the caller asked to stop (or we already have a resolver).
    if (stopResolver) finalize()
  }

  try {
    recognition.start()
  } catch {
    return null
  }

  return {
    stop: () =>
      new Promise<string>((resolve, reject) => {
        if (settled) {
          resolve(currentText())
          return
        }

        let timer: number | null = null
        stopResolver = (value: string) => {
          if (timer != null) window.clearTimeout(timer)
          resolve(value)
        }
        stopRejecter = (reason?: unknown) => {
          if (timer != null) window.clearTimeout(timer)
          reject(reason)
        }

        if (ended) {
          finalize()
          return
        }

        timer = window.setTimeout(() => {
          if (settled) return
          settled = true
          resolve(currentText())
          try {
            recognition.abort()
          } catch {
            /* ignore */
          }
        }, STOP_TIMEOUT_MS)

        try {
          recognition.stop()
        } catch {
          if (timer != null) window.clearTimeout(timer)
          settled = true
          resolve(currentText())
        }
      }),
    abort: () => {
      try {
        recognition.abort()
      } catch {
        /* ignore */
      }
    },
  }
}
