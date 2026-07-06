import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import { api } from '../api'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UnityBuildStep {
  stepNumber: number
  description: string
  tool: string
  args: Record<string, unknown>
  category: 'scene' | 'gameobject' | 'component' | 'asset' | 'playmode'
  completed: boolean
}

export interface UnityBuildPlan {
  _id: string
  projectId: string
  steps: UnityBuildStep[]
  summary: string
  generatedAt: string
}

export type ToolResult = { success: boolean; message: string; data?: unknown }

// ─── MCP server default port ──────────────────────────────────────────────────

const MCP_PORT = 7432

// ─── Build plan (backend) ─────────────────────────────────────────────────────

export function useUnityPlan(projectId: string) {
  return useQuery({
    queryKey: ['unity-plan', projectId],
    queryFn: async () => {
      try {
        const res = await api.get<UnityBuildPlan>(`/projects/${projectId}/unity/plan`)
        return res.data
      } catch (err: unknown) {
        const e = err as { response?: { status?: number } }
        if (e?.response?.status === 404) return null
        throw err
      }
    },
    enabled: !!projectId,
  })
}

export function useGeneratePlan(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<UnityBuildPlan>(`/projects/${projectId}/unity/plan/generate`)
      return res.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['unity-plan', projectId], data)
    },
  })
}

export function useMarkStep(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ stepNumber, completed }: { stepNumber: number; completed: boolean }) => {
      const res = await api.patch<UnityBuildPlan>(`/projects/${projectId}/unity/plan/step`, {
        stepNumber,
        completed,
      })
      return res.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['unity-plan', projectId], data)
    },
  })
}

// ─── Local Unity MCP connection (browser → localhost:7432) ───────────────────

export type ConnectionStatus = 'idle' | 'checking' | 'connected' | 'disconnected'

export function useUnityMCP() {
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [unityInfo, setUnityInfo] = useState<{ version?: string; projectPath?: string } | null>(null)

  const check = useCallback(async () => {
    setStatus('checking')
    try {
      const res = await fetch(`http://localhost:${MCP_PORT}/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) {
        const data = await res.json() as { version?: string; projectPath?: string }
        setUnityInfo(data)
        setStatus('connected')
        return true
      }
    } catch {
      /* Unity not running or MCP package not installed */
    }
    setStatus('disconnected')
    return false
  }, [])

  const executeTool = useCallback(
    async (tool: string, args: Record<string, unknown>): Promise<ToolResult> => {
      try {
        const res = await fetch(`http://localhost:${MCP_PORT}/tool/${tool}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
          signal: AbortSignal.timeout(15000),
        })
        const data = await res.json() as ToolResult
        return data
      } catch (err) {
        return { success: false, message: `Failed to reach Unity MCP server: ${String(err)}` }
      }
    },
    []
  )

  return { status, unityInfo, check, executeTool }
}
