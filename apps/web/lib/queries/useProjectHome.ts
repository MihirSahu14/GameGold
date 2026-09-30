import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { BRIDGE_BUSY, executeTool, parseServerTime, type ToolResult } from './useUnity'
import type { BridgeJob, Project, ProjectHome, UnitySyncRecord, VcsStatus } from '@gamegold/types'

type Exec = (tool: string, args: Record<string, unknown>) => Promise<ToolResult>

/** Pre-filled Save version message: what GameGold wrote to Unity since the last save. */
export function summarizeChanges(syncs: UnitySyncRecord[], since: string | null, projectTitle: string): string {
  const fresh = syncs.filter((s) => !since || parseServerTime(s.syncedAt) > parseServerTime(since))
  const parts: string[] = []
  if (fresh.some((s) => s.path.endsWith('/dialogue.json'))) parts.push('story')
  const sprites = fresh
    .filter((s) => /\/(Backgrounds|Portraits)\/[^/]+\.png$/.test(s.path))
    .map((s) => (s.path.split('/').pop() ?? '').replace(/\.png$/, ''))
  if (sprites.length) parts.push(`sprites: ${sprites.join(', ')}`)
  if (fresh.some((s) => s.path.endsWith('/player_settings.json'))) parts.push('player settings')
  const runtime = fresh.find((s) => s.source === 'runtime')
  if (runtime) parts.push(runtime.version ? `runtime v${runtime.version}` : 'runtime')
  return `${projectTitle}: ${parts.length ? parts.join(' · ') : 'update'}`
}

export function useUpdateHome(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (home: Partial<Pick<ProjectHome, 'repoUrl' | 'publishTarget' | 'itchTarget'>>) =>
      (await api.patch<Project>(`/projects/${projectId}`, { home })).data,
    onSuccess: (p) => qc.setQueryData(['projects', projectId], p),
  })
}

/** vcs.status runs git on Unity's main thread, so no polling: it refetches on window focus, and
 *  connect/save invalidate ['vcs-status']. */
export function useVcsStatus(enabled: boolean, exec: Exec = executeTool) {
  return useQuery({
    queryKey: ['vcs-status'],
    queryFn: async () => {
      const r = await exec('vcs.status', {})
      if (!r.success) throw new Error(r.message)
      return r.data as VcsStatus
    },
    enabled,
  })
}

export const JOB_POLL_MS = 2000
export const JOB_MAX_BUSY = 300 // consecutive main-thread-busy replies (~10 min at 2 s)
export const START_BUSY_OUTPUT = 'Unity was busy — it may still have started. Check Unity, then press again.'

const failed = (output: string): BridgeJob => ({ state: 'failed', output, result: {} })

/** Start a bridge job, poll job.status every 2 s until it ends. Stops once `signal` aborts (unmount). */
export async function runBridgeJob(
  tool: string,
  args: Record<string, unknown>,
  exec: Exec = executeTool,
  signal?: AbortSignal,
  wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
): Promise<BridgeJob> {
  const start = await exec(tool, args)
  // busy on START: the job may have been queued anyway — don't guess; the developer checks Unity and retries
  if (!start.success) return failed(start.message === BRIDGE_BUSY ? START_BUSY_OUTPUT : start.message)
  const jobId = (start.data as { jobId: string }).jobId
  for (let failures = 0, busy = 0; failures < 10 && busy < JOB_MAX_BUSY;) {
    await wait(JOB_POLL_MS)
    if (signal?.aborted) return failed('Cancelled')
    const r = await exec('job.status', { jobId })
    if (!r.success) {
      if (r.message === BRIDGE_BUSY) busy++
      else failures++
      continue
    }
    failures = busy = 0
    const job = r.data as BridgeJob
    if (job.state !== 'running') return job
  }
  return failed('Lost contact with Unity — check the Unity Console.')
}

/** Ref to an AbortSignal that fires on unmount (made in the effect, so StrictMode's remount gets a fresh one). */
export function useUnmountSignal() {
  const ref = useRef<AbortController | null>(null)
  useEffect(() => {
    const c = new AbortController()
    ref.current = c
    return () => c.abort()
  }, [])
  return ref
}

export function useRecordSaved(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (commit: string) => (await api.post<Project>(`/projects/${projectId}/home/saved`, { commit })).data,
    onSuccess: (p) => qc.setQueryData(['projects', projectId], p),
  })
}

export function useRecordPublished(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (url: string) => (await api.post<Project>(`/projects/${projectId}/home/published`, { url })).data,
    onSuccess: (p) => qc.setQueryData(['projects', projectId], p),
  })
}
