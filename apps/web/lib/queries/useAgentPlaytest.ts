import { useCallback, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../api'
import { executeTool, type ToolResult } from './useUnity'
import { useUnmountSignal } from './useProjectHome'
import type {
  AgentPersona, AgentPlayReport, AgentRun, AgentRunCreate, AgentStep, AgentStepCreate, PlaytestFrame,
} from '@gamegold/types'

type Exec = (tool: string, args: Record<string, unknown>) => Promise<ToolResult>

export const LOCAL_BUILD_URL = 'http://localhost:7432/play/index.html'
export const VIEWPORT = { width: 1280, height: 720 }
export const WAIT_MS = 1500
// Mirrors the server's limits (it enforces them; these only drive the estimate + trial note).
export const TRIAL_LIMITS = { agents: 1, steps: 15 }
export const OWN_KEY_STEPS = 40

export const AGENT_PERSONAS: { id: Exclude<AgentPersona, 'custom'>; label: string; icon: string }[] = [
  { id: 'first_timer', label: 'First-timer', icon: '🐣' },
  { id: 'impatient', label: 'Impatient', icon: '⏩' },
  { id: 'poker', label: 'Poker', icon: '👉' },
]
export const AGENT_LABELS: Record<AgentPersona, string> = {
  first_timer: '🐣 First-timer', impatient: '⏩ Impatient', poker: '👉 Poker', custom: '✏️ Custom',
}

export type AgentPlaytestApi = {
  createRun: (body: AgentRunCreate) => Promise<AgentRun>
  step: (runId: string, body: AgentStepCreate) => Promise<AgentStep>
  finish: (runId: string, agent: AgentPersona) => Promise<AgentPlayReport>
}

export type AgentProgress = { agent: AgentPersona; n: number; maxSteps: number; jpegBase64?: string; note?: string }

export type AgentPlaytestResult = { reports: AgentPlayReport[]; messages: string[] }

export function agentPlaytestApi(projectId: string): AgentPlaytestApi {
  const base = `/projects/${projectId}/playtest/agent-runs`
  return {
    createRun: async (body) => (await api.post<AgentRun>(base, body)).data,
    step: async (runId, body) => (await api.post<AgentStep>(`${base}/${runId}/steps`, body)).data,
    finish: async (runId, agent) => (await api.post<AgentPlayReport>(`${base}/${runId}/agents/${agent}/finish`)).data,
  }
}

/**
 * The whole agent playthrough: one run, then for each agent the server allowed:
 * browser.open → (screenshot → POST step → click/key/wait) until stop / step cap / abort / bridge error
 * (e.g. the game navigated off-site) → finish (report) → browser.close (always).
 * An abort (user Stop) stops the loop; the current agent still gets its report from the steps it took.
 */
export async function runAgentPlaytest(
  body: AgentRunCreate,
  deps: {
    api: AgentPlaytestApi
    exec?: Exec
    signal?: AbortSignal
    onProgress?: (p: AgentProgress) => void
    wait?: (ms: number) => Promise<void>
  },
): Promise<AgentPlaytestResult> {
  const { api: backend, exec = executeTool, signal, onProgress } = deps
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const reports: AgentPlayReport[] = []
  const messages: string[] = []
  try {
    const run = await backend.createRun(body)
    for (const agent of run.agents) {
      if (signal?.aborted) break
      const open = await exec('browser.open', { url: body.url, ...VIEWPORT })
      if (!open.success) {
        messages.push(`Couldn't open the game: ${open.message}`)
        break // same browser/URL for every agent — the next one would fail too
      }
      const sessionId = (open.data as { sessionId: string }).sessionId
      let taken = 0
      try {
        for (let n = 1; n <= run.maxSteps && !signal?.aborted; n++) {
          onProgress?.({ agent, n, maxSteps: run.maxSteps })
          const shot = await exec('browser.screenshot', { sessionId })
          if (!shot.success) {
            messages.push(`${AGENT_LABELS[agent]} stopped: ${shot.message}`)
            break
          }
          const s = shot.data as { jpegBase64: string; width: number; height: number; url: string }
          const step = await backend.step(run.runId, {
            agent, n, jpegBase64: s.jpegBase64, pageUrl: s.url,
            screenWidth: s.width, screenHeight: s.height,
            viewportWidth: VIEWPORT.width, viewportHeight: VIEWPORT.height,
          })
          taken = n
          onProgress?.({ agent, n, maxSteps: run.maxSteps, jpegBase64: s.jpegBase64, note: step.note })
          if (step.action === 'stop' || signal?.aborted) break
          if (step.action === 'wait') {
            await wait(WAIT_MS)
            continue
          }
          const act = step.action === 'click'
            ? await exec('browser.click', { sessionId, x: step.x, y: step.y })
            : await exec('browser.key', { sessionId, key: step.key })
          if (!act.success) {
            messages.push(`${AGENT_LABELS[agent]} stopped: ${act.message}`)
            break
          }
        }
        if (taken > 0) reports.push(await backend.finish(run.runId, agent))
      } finally {
        await exec('browser.close', { sessionId })
      }
    }
  } catch (err) {
    messages.push(apiErrorMessage(err, 'The agent playtest failed.'))
  }
  return { reports, messages }
}

export function useAgentPlaytest(projectId: string, exec: Exec = executeTool) {
  const qc = useQueryClient()
  const unmount = useUnmountSignal()
  const controller = useRef<AbortController | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<AgentProgress | null>(null)
  const [result, setResult] = useState<AgentPlaytestResult | null>(null)

  const start = useCallback(async (body: AgentRunCreate) => {
    const c = new AbortController()
    controller.current = c
    unmount.current?.signal.addEventListener('abort', () => c.abort())
    setRunning(true)
    setResult(null)
    setProgress(null)
    const res = await runAgentPlaytest(body, {
      api: agentPlaytestApi(projectId), exec, signal: c.signal,
      // keep the last thumbnail while the next screenshot is on its way
      onProgress: (p) => setProgress((prev) => (p.jpegBase64 || prev?.agent !== p.agent ? p : { ...prev, n: p.n })),
    })
    if (unmount.current?.signal.aborted) return res
    setRunning(false)
    setResult(res)
    void qc.invalidateQueries({ queryKey: ['playtests', projectId] })
    return res
  }, [projectId, exec, qc, unmount])

  const stop = useCallback(() => controller.current?.abort(), [])

  return { start, stop, running, progress, result }
}

export function useAgentEstimate(projectId: string, agents: number, steps: number) {
  return useQuery({
    queryKey: ['agent-estimate', projectId, agents, steps],
    queryFn: async () =>
      (await api.get<{ usd: number | null }>(`/projects/${projectId}/playtest/agent-runs/estimate`, { params: { agents, steps } })).data,
    enabled: !!projectId && agents > 0,
    staleTime: 5 * 60_000,
  })
}

/** Screenshot strip for a finished agent report — fetched only when asked for. */
export function usePlaytestFrames(projectId: string, reportId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['playtest-frames', projectId, reportId],
    queryFn: async () => (await api.get<PlaytestFrame[]>(`/projects/${projectId}/playtest/${reportId}/frames`)).data,
    enabled,
    staleTime: Infinity,
  })
}
