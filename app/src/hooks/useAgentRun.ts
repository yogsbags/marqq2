import { useState, useCallback, useRef, useEffect } from 'react'
import type { Offer } from '@/components/agent/OfferSelector'
import { buildAgentHeaders, buildAgentRunPayload } from '@/lib/agentContext'

export interface ToolCallEvent {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface ToolResultEvent {
  id: string
  name: string
  successful: boolean
  preview: string | null
  error: string | null
}

export interface ToolCallEvent {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface ToolResultEvent {
  id: string
  name: string
  successful: boolean
  preview: string | null
  error: string | null
}

export interface ContractTask {
  task_type: string
  agent_name: string
  description: string
  priority: 'low' | 'medium' | 'high'
}

export interface AgentRunResult {
  streaming: boolean
  text: string
  thinking: string
  toolCalls: Array<{ call: ToolCallEvent; result: ToolResultEvent | null }>
  artifact: Record<string, unknown> | null
  tasksCreated: ContractTask[]
  confidence: number | null
  runId: string | null
  error: string | null
  handoffNotes: string | null
}

const EMPTY_RUN_STATE: AgentRunResult = {
  streaming: false,
  text: '',
  thinking: '',
  toolCalls: [],
  artifact: null,
  tasksCreated: [],
  confidence: null,
  runId: null,
  error: null,
  handoffNotes: null,
}

// Contract keys that appear at the top level of the JSON contract block
const CONTRACT_KEYS = /"(agent|run_id|artifact|tasks_created|contract|confidence)"\s*:/

function stripStreamingContractTail(text: string) {
  if (!text.trim()) return text

  const markers = [
    '\n---CONTRACT---',
    '---CONTRACT---',
    '\nStructured Output (for downstream agents)',
    'Structured Output (for downstream agents)',
    '\nContract Block (required)',
    'Contract Block (required)',
    '\n## Output Contract',
    '## Output Contract',
    '\n**Output Contract',
    '**Output Contract',
    // JSON object starting with any of the known contract keys
    '\n{ "agent":',   '\n{"agent":',   '{"agent":',
    '\n{ "run_id":',  '\n{"run_id":',
    '\n{ "artifact":','\n{"artifact":',
    '\n{\n  "agent":','\n{\n  "run_id":','\n{\n  "artifact":',
  ]

  let cutoff = text.length
  for (const marker of markers) {
    const index = text.indexOf(marker)
    if (index >= 0) cutoff = Math.min(cutoff, index)
  }

  // Fallback: strip any trailing JSON block whose top-level keys look like a contract
  if (cutoff === text.length) {
    const jsonStart = text.lastIndexOf('\n{')
    if (jsonStart > 0 && CONTRACT_KEYS.test(text.slice(jsonStart))) {
      cutoff = jsonStart
    }
  }

  return cutoff === text.length ? text : text.slice(0, cutoff).trimEnd()
}

export function useAgentRun(defaultCompanyId?: string, persistenceKey?: string) {
  const [state, setState] = useState<AgentRunResult>(EMPTY_RUN_STATE)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!persistenceKey) {
      setState(EMPTY_RUN_STATE)
      return
    }

    try {
      const raw = sessionStorage.getItem(persistenceKey)
      if (!raw) {
        setState(EMPTY_RUN_STATE)
        return
      }
      const parsed = JSON.parse(raw) as Partial<AgentRunResult>
      setState({
        streaming: false,
        text: typeof parsed.text === 'string' ? parsed.text : '',
        thinking: typeof parsed.thinking === 'string' ? parsed.thinking : '',
        toolCalls: Array.isArray(parsed.toolCalls) ? parsed.toolCalls : [],
        artifact: parsed.artifact && typeof parsed.artifact === 'object' ? parsed.artifact as Record<string, unknown> : null,
        tasksCreated: Array.isArray(parsed.tasksCreated) ? parsed.tasksCreated : [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
        runId: typeof parsed.runId === 'string' ? parsed.runId : null,
        error: typeof parsed.error === 'string' ? parsed.error : null,
        handoffNotes: typeof (parsed as AgentRunResult).handoffNotes === 'string' ? (parsed as AgentRunResult).handoffNotes : null,
      })
    } catch {
      setState(EMPTY_RUN_STATE)
    }
  }, [persistenceKey])

  useEffect(() => {
    if (!persistenceKey) return
    if (state.streaming) return

    try {
      if (!state.text && !state.artifact && !state.error) {
        sessionStorage.removeItem(persistenceKey)
        return
      }
      sessionStorage.setItem(persistenceKey, JSON.stringify({
        text: state.text,
        artifact: state.artifact,
        confidence: state.confidence,
        runId: state.runId,
        error: state.error,
        handoffNotes: state.handoffNotes,
      }))
    } catch {
      // ignore storage issues
    }
  }, [persistenceKey, state])

  const run = useCallback(
    async (agentName: string, query: string, taskType?: string, companyId?: string, offer?: Offer | null, tags?: string[], conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>, moduleId?: string) => {
      abortRef.current?.abort()
      const abort = new AbortController()
      abortRef.current = abort
      setState({ ...EMPTY_RUN_STATE, streaming: true })

      try {
        const res = await fetch(`/api/agents/${agentName}/run`, {
          method: 'POST',
          headers: buildAgentHeaders(),
          body: JSON.stringify(buildAgentRunPayload({
            query,
            company_id: companyId ?? defaultCompanyId ?? undefined,
            task_type: taskType,
            ...(moduleId ? { module_id: moduleId } : {}),
            offer_focus: offer ?? undefined,
            ...(tags?.length ? { tags } : {}),
            conversation_history: conversationHistory ?? [],
          })),
          signal: abort.signal,
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error((err as any).error || `Agent returned ${res.status}`)
        }

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const payload = line.slice(6).trim()
            if (payload === '[DONE]') continue
            try {
              const parsed = JSON.parse(payload)
              if (typeof parsed.text === 'string') {
                setState(s => ({ ...s, text: stripStreamingContractTail(s.text + parsed.text) }))
              }
              if (typeof parsed.thinking === 'string') {
                setState(s => ({ ...s, thinking: s.thinking + parsed.thinking }))
              }
              if (parsed.tool_call) {
                const call = parsed.tool_call as ToolCallEvent
                setState(s => ({
                  ...s,
                  toolCalls: [...s.toolCalls, { call, result: null }],
                }))
              }
              if (parsed.tool_result) {
                const result = parsed.tool_result as ToolResultEvent
                setState(s => ({
                  ...s,
                  toolCalls: s.toolCalls.map(tc =>
                    tc.call.id === result.id ? { ...tc, result } : tc
                  ),
                }))
              }
              if (parsed.contract) {
                // Merge automation_results into artifact.data so images, emails, videos surface in UI
                const artifactData: Record<string, unknown> = (parsed.contract.artifact?.data as Record<string, unknown>) ?? {}
                const automationResults = parsed.contract.automation_results as Array<{ automation_id: string; status: string; result: Record<string, unknown> }> | undefined
                if (automationResults?.length) {
                  for (const ar of automationResults) {
                    if (ar.status === 'success' && ar.result) {
                      artifactData[ar.automation_id] = ar.result
                    } else if (ar.status === 'error') {
                      artifactData[`${ar.automation_id}_error`] = ar.result?.error ?? 'Automation failed'
                    }
                  }
                }
                // Extract handoff_notes — may be a string or an array of strings
                const rawHandoffNotes = parsed.contract.handoff_notes
                let handoffNotes: string | null = null
                if (typeof rawHandoffNotes === 'string' && rawHandoffNotes.trim()) {
                  handoffNotes = rawHandoffNotes.trim()
                } else if (Array.isArray(rawHandoffNotes) && rawHandoffNotes.length > 0) {
                  handoffNotes = rawHandoffNotes.filter((n: unknown) => typeof n === 'string').join('\n').trim() || null
                }
                setState(s => ({
                  ...s,
                  artifact: Object.keys(artifactData).length ? artifactData : null,
                  tasksCreated: Array.isArray(parsed.contract.tasks_created) ? parsed.contract.tasks_created : [],
                  confidence: parsed.contract.artifact?.confidence ?? null,
                  runId: parsed.contract.run_id ?? null,
                  handoffNotes,
                }))
              }
              if (parsed.error) throw new Error(parsed.error)
            } catch (parseErr: any) {
              if (parseErr.message && !parseErr.message.startsWith('Unexpected token')) throw parseErr
            }
          }
        }

        setState(s => ({ ...s, streaming: false }))
      } catch (err: any) {
        if (err.name === 'AbortError') return
        setState(s => ({ ...s, streaming: false, error: err.message || 'Agent run failed' }))
      }
    },
    [defaultCompanyId]
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    if (persistenceKey) {
      try {
        sessionStorage.removeItem(persistenceKey)
      } catch {
        // ignore storage issues
      }
    }
    setState(EMPTY_RUN_STATE)
  }, [persistenceKey])

  return { ...state, run, reset }
}
