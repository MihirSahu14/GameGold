import { useCallback, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiErrorMessage } from '../api'
import { executeTool, type ToolResult } from './useUnity'
import { useUnmountSignal } from './useProjectHome'
import type {
  AgentFinishCreate, AgentInputAction, AgentPersona, AgentPlayReport, AgentRun, AgentRunCreate, AgentStep, AgentStepCreate, PlaytestFrame,
} from '@gamegold/types'

type Exec = (tool: string, args: Record<string, unknown>) => Promise<ToolResult>

export const LOCAL_BUILD_URL = 'http://localhost:7432/play/index.html'
export const VIEWPORT = { width: 1280, height: 720 }
export const WAIT_MS = 1500
// After each input, let text finish typing / animations land before the next screenshot (gap 73).
export const SETTLE_MS = 600
// maxSteps counts acting steps only (click/key/act); waits are free up to this many total steps (server mirrors it).
export const TOTAL_STEPS_FACTOR = 2
export const STOPPED_BY_YOU = 'Stopped by you'
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
  finish: (runId: string, agent: AgentPersona, body?: AgentFinishCreate) => Promise<AgentPlayReport>
}

/** turns = acting steps used so far (what maxSteps limits); n = the step number incl. waits. */
export type AgentProgress = {
  agent: AgentPersona; n: number; turns: number; maxSteps: number; jpegBase64?: string; note?: string
}

/** Drops nulls the API sends for unused fields, so the bridge only sees what each input uses. */
function bridgeActions(actions: AgentInputAction[]) {
  return actions.map((a) => Object.fromEntries(Object.entries(a).filter(([, v]) => v != null)))
}

export type AgentPlaytestResult = { reports: AgentPlayReport[]; messages: string[] }

export function agentPlaytestApi(projectId: string): AgentPlaytestApi {
  const base = `/projects/${projectId}/playtest/agent-runs`
  return {
    createRun: async (body) => (await api.post<AgentRun>(base, body)).data,
    step: async (runId, body) => (await api.post<AgentStep>(`${base}/${runId}/steps`, body)).data,
    finish: async (runId, agent, body) => (await api.post<AgentPlayReport>(`${base}/${runId}/agents/${agent}/finish`, body)).data,
  }
}

/**
 * The whole agent playthrough: one run, then for each agent the server allowed:
 * browser.open (stepMode → the game freezes between turns) → (screenshot → POST step → click/key/act + settle, or wait)
 * until stop / turn cap (waits are free up to 2× maxSteps total steps) / abort / bridge error
 * (e.g. the game navigated off-site) / backend error → finish (report) → browser.close (always).
 * An abort (user Stop) stops the loop; the current agent still gets its report from the steps it took.
 * finish gets the stop reason unless the model stopped itself or hit the step cap (the server knows those).
 * A 402 (trial budget used up) also stops the agents after this one.
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
      const open = await exec('browser.open', { url: body.url, ...VIEWPORT, stepMode: !!body.stepMode })
      if (!open.success) {
        messages.push(`Couldn't open the game: ${open.message}`)
        break // same browser/URL for every agent — the next one would fail too
      }
      const sessionId = (open.data as { sessionId: string }).sessionId
      let taken = 0
      let turns = 0 // acting steps — only these count toward maxSteps
      let stopReason: string | undefined
      let outOfBudget = false
      try {
        for (let n = 1; n <= run.maxSteps * TOTAL_STEPS_FACTOR && turns < run.maxSteps; n++) {
          if (signal?.aborted) {
            stopReason = STOPPED_BY_YOU
            break
          }
          onProgress?.({ agent, n, turns, maxSteps: run.maxSteps })
          const shot = await exec('browser.screenshot', { sessionId })
          if (!shot.success) {
            stopReason = shot.message
            messages.push(`${AGENT_LABELS[agent]} stopped: ${shot.message}`)
            break
          }
          const s = shot.data as {
            jpegBase64: string; width: number; height: number; imageWidth?: number; imageHeight?: number; url: string
          }
          let step: AgentStep
          try {
            step = await backend.step(run.runId, {
              agent, n, jpegBase64: s.jpegBase64, pageUrl: s.url,
              // the JPEG is scaled down from the viewport; the model sees (and answers in) image pixels
              screenWidth: s.imageWidth ?? s.width, screenHeight: s.imageHeight ?? s.height,
              viewportWidth: VIEWPORT.width, viewportHeight: VIEWPORT.height,
            })
          } catch (err) {
            stopReason = apiErrorMessage(err, 'The agent step failed.')
            messages.push(stopReason)
            outOfBudget = (err as { response?: { status?: number } } | undefined)?.response?.status === 402
            break
          }
          taken = n
          if (step.action !== 'wait' && step.action !== 'stop') turns++
          onProgress?.({ agent, n, turns, maxSteps: run.maxSteps, jpegBase64: s.jpegBase64, note: step.note })
          if (step.action === 'stop') break
          if (signal?.aborted) {
            stopReason = STOPPED_BY_YOU
            break
          }
          if (step.action === 'wait') {
            await wait(WAIT_MS)
            continue
          }
          const act = step.action === 'click'
            ? await exec('browser.click', { sessionId, x: step.x, y: step.y })
            : step.action === 'act'
              ? await exec('browser.act', { sessionId, actions: bridgeActions(step.actions ?? []) })
              : await exec('browser.key', { sessionId, key: step.key })
          if (!act.success) {
            stopReason = act.message
            messages.push(`${AGENT_LABELS[agent]} stopped: ${act.message}`)
            break
          }
          await wait(SETTLE_MS)
        }
        if (taken > 0) {
          reports.push(await backend.finish(run.runId, agent, stopReason ? { stopReason: stopReason.slice(0, 300) } : undefined))
        }
      } finally {
        await exec('browser.close', { sessionId })
      }
      if (outOfBudget) break
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
      onProgress: (p) => setProgress((prev) => (p.jpegBase64 || prev?.agent !== p.agent ? p : { ...prev, n: p.n, turns: p.turns })),
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
