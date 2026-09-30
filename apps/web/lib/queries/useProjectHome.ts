import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { BRIDGE_BUSY, executeTool, type ToolResult } from './useUnity'
import type { BridgeJob, Project, ProjectHome, UnitySyncRecord, VcsStatus } from '@gamegold/types'

type Exec = (tool: string, args: Record<string, unknown>) => Promise<ToolResult>

/** Pre-filled Save version message: what GameGold wrote to Unity since the last save. */
export function summarizeChanges(syncs: UnitySyncRecord[], since: string | null, projectTitle: string): string {
  const fresh = syncs.filter((s) => !since || Date.parse(s.syncedAt) > Date.parse(since))
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

export function useVcsStatus(enabled: boolean, exec: Exec = executeTool) {
  return useQuery({
    queryKey: ['vcs-status'],
    queryFn: async () => {
      const r = await exec('vcs.status', {})
      if (!r.success) throw new Error(r.message)
      return r.data as VcsStatus
    },
    enabled,
    refetchInterval: 30000,
  })
}

export const JOB_POLL_MS = 2000

/** Start a bridge job, poll job.status every 2 s until it ends. Main-thread-busy replies are retried indefinitely. */
export async function runBridgeJob(
  tool: string,
  args: Record<string, unknown>,
  exec: Exec = executeTool,
  wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
): Promise<BridgeJob> {
  const start = await exec(tool, args)
  if (!start.success) return { state: 'failed', output: start.message, result: {} }
  const jobId = (start.data as { jobId: string }).jobId
  for (let failures = 0; failures < 10;) {
    await wait(JOB_POLL_MS)
    const r = await exec('job.status', { jobId })
    if (!r.success) {
      if (r.message !== BRIDGE_BUSY) failures++
      continue
    }
    failures = 0
    const job = r.data as BridgeJob
    if (job.state !== 'running') return job
  }
  return { state: 'failed', output: 'Lost contact with Unity — check the Unity Console.', result: {} }
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
