import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { api } from '../api'
import { downloadBlob } from '../utils'
import { svgToPngDataUri } from '../rasterize'
import type {
  Asset, AssetKind, PlayerSettings, UnityBuildPlan, UnityDiffItem, UnityDiffStatus, UnitySnapshot,
  UnitySnapshotFile, UnitySyncRecord, UnityChangePlan,
} from '@gamegold/types'

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
type UnityInfo = { version?: string; projectPath?: string }

// One cached status check shared by every page/card (Unity page, Assets page).
export function useUnityConnection() {
  const q = useQuery({
    queryKey: ['unity-mcp-status'],
    queryFn: async (): Promise<UnityInfo | null> => {
      try {
        const res = await fetch(`http://localhost:${MCP_PORT}/status`, { method: 'GET', signal: AbortSignal.timeout(3000) })
        if (res.ok) return await res.json() as UnityInfo
      } catch {
        /* Unity not running or MCP package not installed */
      }
      return null
    },
    retry: false,
    staleTime: 30_000,
    // Unity restarts the bridge on every script reload — keep polling so GameGold reconnects by itself
    // (fast while down, slow while up so a dropped Editor is still noticed).
    refetchInterval: (query) => (query.state.data ? 15_000 : 4_000),
    refetchIntervalInBackground: true,
  })
  // Background polls keep the last result instead of flashing "checking" / hiding connected-only panels.
  const status: ConnectionStatus = q.data ? 'connected' : q.isFetching ? 'checking' : q.isFetched ? 'disconnected' : 'idle'
  const { refetch } = q
  const check = useCallback(async () => !!(await refetch()).data, [refetch])
  return { status, unityInfo: q.data ?? null, check }
}

export async function executeTool(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const res = await fetch(`http://localhost:${MCP_PORT}/tool/${tool}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(15000),
    })
    return await res.json() as ToolResult
  } catch (err) {
    return { success: false, message: `Failed to reach Unity MCP server: ${String(err)}` }
  }
}

export function useUnityMCP() {
  return { ...useUnityConnection(), executeTool }
}

// ─── Sync one asset to Unity (Assets page) ────────────────────────────────────

const SPRITE_FOLDERS: Partial<Record<string, string>> = { background: 'Backgrounds', portrait: 'Portraits' }

// Where DialoguePlayer expects this asset; null = nothing it would load. Mirrors unity_service.narrative_plan.
export function syncCall(asset: Asset): { tool: string; args: Record<string, unknown> } | null {
  if (asset.type === 'dialogue' && asset.tree) {
    return { tool: 'asset.createText', args: { path: DIALOGUE_JSON_PATH, content: JSON.stringify(asset.tree, null, 2) } }
  }
  const folder = SPRITE_FOLDERS[asset.kind ?? 'sprite']
  if (asset.type === 'sprite' && asset.url && folder) {
    const file = asset.name.replace(/[^\w\- ]/g, '_')
    return { tool: 'asset.importSprite', args: { name: asset.name, path: `Assets/Resources/GameGold/${folder}/${file}.png`, base64: asset.url } }
  }
  return null
}

export function useSyncToUnity(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (asset: Asset) => {
      const call = syncCall(asset)
      if (!call) throw new Error(`Nothing to sync for "${asset.name}".`)
      const b64 = call.args.base64 // the bridge only takes PNG — rasterize SVG sprites first
      const args = typeof b64 === 'string' && b64.startsWith('data:image/svg')
        ? { ...call.args, base64: await svgToPngDataUri(b64) }
        : call.args
      const result = await executeTool(call.tool, args)
      if (!result.success) throw new Error(result.message)
      // ponytail: a lost record only makes the next "Check Unity" show this file as changed — not worth failing the sync
      await recordWrite(projectId, call.tool, args, asset._id).catch(() => {})
      return result
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['unity-syncs', projectId] }),
  })
}

// ─── Player settings file (read by DialoguePlayer at start) ───────────────────

export const PLAYER_SETTINGS_PATH = 'Assets/Resources/GameGold/player_settings.json'

// JsonUtility can't read dictionaries, so chapter colours go over as a list.
export function playerSettingsFile(s: PlayerSettings): string {
  const { chapterColors, ...rest } = s
  return JSON.stringify({ ...rest, chapterColors: Object.entries(chapterColors).map(([chapter, color]) => ({ chapter, color })) }, null, 2)
}

// ─── Run all (plan) ───────────────────────────────────────────────────────────

// One step at a time (a slow step must finish and be marked before the next); stops on the first failure.
export async function runQueue<T extends { completed: boolean }>(
  steps: T[],
  run: (step: T) => Promise<boolean>,
  onProgress?: (done: number, total: number) => void,
): Promise<boolean> {
  const todo = steps.filter((s) => !s.completed)
  for (let i = 0; i < todo.length; i++) {
    onProgress?.(i, todo.length)
    if (!(await run(todo[i]))) return false
  }
  onProgress?.(todo.length, todo.length)
  return true
}

// ─── Read-back from Unity (edit through GameGold §4) ─────────────────────────

export const GAMEGOLD_FOLDER = 'Assets/Resources/GameGold'
const RUNTIME_HEADER = /^\/\/ GameGold DialoguePlayer v(\d+)/

export function runtimeVersion(code: string): number | null {
  const m = RUNTIME_HEADER.exec(code)
  return m ? Number(m[1]) : null
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function base64Bytes(b64: string): Uint8Array {
  const bin = atob(b64.slice(b64.indexOf(',') + 1)) // tolerates a data: prefix, like the bridge
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

// The exact bytes the bridge writes for this call (File.WriteAllText = UTF-8, no BOM); null = not a file write we track.
function bytesWritten(tool: string, args: Record<string, unknown>): Uint8Array | null {
  if (tool === 'asset.createText' && typeof args.content === 'string') return new TextEncoder().encode(args.content)
  if (tool === 'asset.importSprite' && typeof args.base64 === 'string') return base64Bytes(args.base64)
  if (tool === 'asset.createScript' && typeof args.code === 'string' && runtimeVersion(args.code) !== null) {
    return new TextEncoder().encode(args.code)
  }
  return null
}

// After a successful write, tell GameGold what it put at that path so "Check Unity for changes" can diff.
export async function recordWrite(projectId: string, tool: string, args: Record<string, unknown>, source: string): Promise<void> {
  const bytes = bytesWritten(tool, args)
  if (!bytes || typeof args.path !== 'string') return
  const version = tool === 'asset.createScript' ? runtimeVersion(String(args.code)) : null
  await api.post(`/projects/${projectId}/unity/synced`, {
    path: args.path, sha256: await sha256Hex(bytes), source, ...(version !== null ? { version } : {}),
  })
}

// Which GameGold item a plan step's write came from.
export function stepSource(tool: string, args: Record<string, unknown>, assets: Asset[]): string {
  if (tool === 'asset.createText' && typeof args.dialogue === 'string') {
    return assets.find((a) => a.type === 'dialogue' && a.name === args.dialogue)?._id ?? 'plan'
  }
  if (tool === 'asset.importSprite') return assets.find((a) => a.type === 'sprite' && a.name === args.name)?._id ?? 'plan'
  if (tool === 'asset.createScript') return 'runtime'
  return 'plan'
}

const STATUS_ORDER: Record<UnityDiffStatus, number> = { changed: 0, missing: 1, unsynced: 2, 'in-sync': 3 }

// Unity's files vs what GameGold last wrote there (only Resources/GameGold — the runtime script is tracked separately).
export function diffUnity(files: UnitySnapshotFile[], records: UnitySyncRecord[]): UnityDiffItem[] {
  const tracked = records.filter((r) => r.path.startsWith(`${GAMEGOLD_FOLDER}/`))
  const byPath = new Map(tracked.map((r) => [r.path, r]))
  const items: UnityDiffItem[] = files.map((file) => {
    const record = byPath.get(file.path)
    const status: UnityDiffStatus = !record ? 'unsynced' : record.sha256 === file.sha256 ? 'in-sync' : 'changed'
    return { path: file.path, status, file, record }
  })
  const present = new Set(files.map((f) => f.path))
  for (const record of tracked) if (!present.has(record.path)) items.push({ path: record.path, status: 'missing', record })
  return items.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.path.localeCompare(b.path))
}

// What "Overwrite from GameGold" re-sends for this path: the settings, the asset that syncs there, or nothing.
export function overwriteTarget(path: string, assets: Asset[], record: UnitySyncRecord | undefined): Asset | 'settings' | null {
  if (path === PLAYER_SETTINGS_PATH) return 'settings'
  const matches = assets.filter((a) => syncCall(a)?.args.path === path)
  return matches.find((a) => a._id === record?.source) ?? matches[0] ?? null
}

// Inverse of playerSettingsFile.
export function settingsFromFile(file: Record<string, unknown>): PlayerSettings {
  const { chapterColors, ...rest } = file as Omit<PlayerSettings, 'chapterColors'> & { chapterColors?: { chapter: string; color: string }[] }
  return { ...rest, chapterColors: Object.fromEntries((chapterColors ?? []).map((c) => [c.chapter, c.color])) }
}

const PULL_KINDS: Record<string, AssetKind> = { Backgrounds: 'background', Portraits: 'portrait' }

// "Pull into GameGold": read the Unity file and store it as GameGold's copy, then record its hash.
export async function pullFromUnity(
  projectId: string,
  item: UnityDiffItem,
  assets: Asset[],
  exec: (tool: string, args: Record<string, unknown>) => Promise<ToolResult> = executeTool,
): Promise<void> {
  const read = await exec('asset.readFile', { path: item.path })
  if (!read.success) throw new Error(read.message)
  const b64 = (read.data as { base64: string }).base64
  const bytes = base64Bytes(b64)
  let source: string
  if (item.path === DIALOGUE_JSON_PATH || item.path === PLAYER_SETTINGS_PATH) {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
    } catch {
      throw new Error(`${item.path} in Unity is not valid JSON.`)
    }
    if (item.path === PLAYER_SETTINGS_PATH) {
      await api.patch(`/projects/${projectId}`, { playerSettings: settingsFromFile(parsed) })
      source = 'settings'
    } else {
      const stories = assets.filter((a) => a.type === 'dialogue')
      const target = stories.find((a) => a._id === item.record?.source) ?? stories.find((a) => a.placeholder === false) ?? stories[0]
      const res = target
        ? await api.put<Asset>(`/projects/${projectId}/assets/${target._id}/tree`, parsed)
        : await api.post<Asset>(`/projects/${projectId}/assets/dialogue/import`, { name: 'Story from Unity', tree: parsed })
      source = res.data._id
    }
  } else if (item.path.toLowerCase().endsWith('.png')) {
    const parts = item.path.split('/')
    const res = await api.post<Asset>(`/projects/${projectId}/assets/sprites/upload`, {
      name: parts[parts.length - 1].replace(/\.png$/i, ''),
      kind: PULL_KINDS[parts[parts.length - 2]] ?? 'sprite',
      dataUri: `data:image/png;base64,${b64}`,
    })
    source = res.data._id
  } else {
    throw new Error('GameGold can only pull the story, player settings and PNG images.')
  }
  await api.post(`/projects/${projectId}/unity/synced`, { path: item.path, sha256: await sha256Hex(bytes), source })
}

export async function snapshotUnity(): Promise<UnitySnapshot> {
  const r = await executeTool('scene.snapshot', {})
  if (!r.success) throw new Error(r.message)
  return r.data as UnitySnapshot
}

export function useUnitySyncs(projectId: string) {
  return useQuery({
    queryKey: ['unity-syncs', projectId],
    queryFn: async () => (await api.get<UnitySyncRecord[]>(`/projects/${projectId}/unity/synced`)).data,
    enabled: !!projectId,
  })
}

export function usePullFromUnity(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ item, assets }: { item: UnityDiffItem; assets: Asset[] }) => pullFromUnity(projectId, item, assets),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['assets', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['unity-syncs', projectId] })
    },
  })
}

// ─── Update runtime (gap 40): re-send GameGold's DialoguePlayer without touching plan steps ──

export const RUNTIME_PATH = 'Assets/Scripts/DialoguePlayer.cs'

export function useRuntimeTemplate() {
  return useQuery({
    queryKey: ['unity-template', 'DialoguePlayer'],
    queryFn: async () => (await api.get<{ code: string; version: number | null }>('/unity/templates/DialoguePlayer')).data,
    staleTime: 5 * 60_000,
  })
}

// true = Unity has an older (or unknown) DialoguePlayer than the one GameGold serves now.
export function runtimeOutdated(records: UnitySyncRecord[], served: number | null | undefined, planSentRuntime: boolean): boolean {
  if (served == null) return false
  const record = records.find((r) => r.path === RUNTIME_PATH)
  return record ? record.version !== served : planSentRuntime
}

export function useUpdateRuntime(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { code } = (await api.get<{ code: string }>('/unity/templates/DialoguePlayer')).data
      const args = { className: 'DialoguePlayer', path: RUNTIME_PATH, code }
      const result = await executeTool('asset.createScript', args)
      if (!result.success) throw new Error(result.message)
      await recordWrite(projectId, 'asset.createScript', args, 'runtime')
      return result
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['unity-syncs', projectId] }),
  })
}

// ─── "Change something" (§3): words → scene steps, run through the same queue; never saved as the plan ──

// The LLM needs names/components/fields, not file hashes; the server trims to ~6k chars as well.
export function changeSnapshot(s: UnitySnapshot): Omit<UnitySnapshot, 'files'> {
  return { scene: s.scene, objects: s.objects, playerSettings: s.playerSettings }
}

export function useProposeChange(projectId: string) {
  return useMutation({
    mutationFn: async (request: string) => {
      const snapshot = changeSnapshot(await snapshotUnity())
      const res = await api.post<UnityChangePlan>(`/projects/${projectId}/unity/change`, { request, snapshot })
      return res.data
    },
  })
}
