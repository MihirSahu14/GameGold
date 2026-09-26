import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import { api } from '../api'
import { downloadBlob } from '../utils'
import { svgToPngDataUri } from '../rasterize'
import type { Asset, UnityBuildPlan } from '@gamegold/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToolResult = { success: boolean; message: string; data?: unknown }

// DialoguePlayer (the built-in narrative runtime) loads Resources/GameGold/dialogue.
export const DIALOGUE_JSON_PATH = 'Assets/Resources/GameGold/dialogue.json'
// Runtime scripts GameGold ships itself (served by GET /unity/templates/<name>).
const BUILT_IN_SCRIPTS = ['DialoguePlayer']

// The plan never carries file contents — inject them from the stored assets.
// Returns the args to send, or an error message to fail the step with.
export function resolveToolArgs(
  tool: string,
  args: Record<string, unknown>,
  assets: Asset[],
): { args: Record<string, unknown> } | { error: string } {
  if (tool === 'asset.importSprite') {
    const sprite = assets.find((a) => a.type === 'sprite' && a.name === args.name)
    if (!sprite?.url) {
      return { error: `No sprite asset named "${String(args.name)}" found — generate it in the Assets stage first.` }
    }
    // the C# side strips the data: prefix; SVGs are rasterized in prepareToolArgs
    return { args: { ...args, base64: sprite.url } }
  }
  if (tool === 'asset.createText' && typeof args.dialogue === 'string') {
    const { dialogue, ...rest } = args
    const asset = assets.find((a) => a.type === 'dialogue' && a.name === dialogue)
    if (!asset?.tree) {
      return { error: `No dialogue asset named "${dialogue}" found — import or generate it in the Assets stage first.` }
    }
    return { args: { path: DIALOGUE_JSON_PATH, ...rest, content: JSON.stringify(asset.tree, null, 2) } }
  }
  if (tool === 'asset.createScript') {
    const script = findScriptAsset(args, assets)
    if (!script?.code) {
      return { error: `No script asset named "${String(args.className)}" found — generate it in the Assets stage first.` }
    }
    return { args: { ...args, code: script.code } }
  }
  return { args }
}

// resolveToolArgs + the async parts: GameGold's generator makes SVG sprites but the bridge only
// accepts PNG, so rasterize them in the browser before sending.
export async function prepareToolArgs(
  tool: string,
  args: Record<string, unknown>,
  assets: Asset[],
): Promise<{ args: Record<string, unknown> } | { error: string }> {
  if (tool === 'asset.createScript' && BUILT_IN_SCRIPTS.includes(String(args.className)) && !findScriptAsset(args, assets)?.code) {
    const res = await api.get<{ code: string }>(`/unity/templates/${String(args.className)}`)
    return { args: { ...args, code: res.data.code } }
  }
  const resolved = resolveToolArgs(tool, args, assets)
  if ('error' in resolved) return resolved
  const b64 = resolved.args.base64
  if (tool === 'asset.importSprite' && typeof b64 === 'string' && b64.startsWith('data:image/svg')) {
    return { args: { ...resolved.args, base64: await svgToPngDataUri(b64) } }
  }
  return resolved
}

export function findScriptAsset(args: Record<string, unknown>, assets: Asset[]): Asset | undefined {
  return assets.find((a) => a.type === 'script' && a.name === args.className)
}

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
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'summary'] })
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

// ─── Build pack (primary path: Claude Code + a Unity MCP server) ─────────────

export function useExportBuildPack(projectId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await api.get(`/projects/${projectId}/unity/export`, { responseType: 'blob' })
      const match = (res.headers['content-disposition'] as string | undefined)?.match(/filename="(.+)"/)
      downloadBlob(res.data as Blob, match?.[1] ?? 'build_pack.zip')
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
