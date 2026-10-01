import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { downloadBlob } from '../utils'
import { svgToPngDataUri } from '../rasterize'
import type {
  Asset, AssetKind, Kit, KitId, Project, ProjectKit, PlayerSettings, StageSide, UnityBuildPlan, UnityDiffItem, UnityDiffStatus, UnitySnapshot,
  UnitySnapshotFile, UnitySyncRecord, UnityChangePlan,
} from '@gamegold/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToolResult = { success: boolean; message: string; data?: unknown }

// DialoguePlayer (the built-in narrative runtime) loads Resources/GameGold/dialogue.
export const DIALOGUE_JSON_PATH = 'Assets/Resources/GameGold/dialogue.json'

type KitSettings = Project['kitSettings']

// The plan never carries file contents — inject them from the stored assets (and the project's kit settings).
// Returns the args to send, or an error message to fail the step with.
export function resolveToolArgs(
  tool: string,
  args: Record<string, unknown>,
  assets: Asset[],
  kitSettings?: KitSettings,
  kitDataKind?: string | null,
): { args: Record<string, unknown> } | { error: string } {
  if (tool === 'asset.createText' && typeof args.data === 'string') {
    const { data, ...rest } = args
    // prefer the kit's own data kind: a levels file and an arena file can share a name
    const named = assets.filter((a) => a.type === 'data' && a.name === data)
    const asset = named.find((a) => a.kind === kitDataKind) ?? named[0]
    if (!asset?.data) {
      return { error: `No game data asset named "${data}" found — import it on the Assets page (Game data tab) first.` }
    }
    return { args: { ...rest, content: JSON.stringify(asset.data, null, 2) } }
  }
  if (tool === 'asset.createText' && typeof args.kitSettings === 'string') {
    const { kitSettings: kitId, ...rest } = args
    // {} = no settings saved yet; the runtime keeps its defaults
    return { args: { ...rest, content: JSON.stringify(kitSettings?.[kitId as KitId] ?? {}, null, 2) } }
  }
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
  kitSettings?: KitSettings,
  kitDataKind?: string | null,
): Promise<{ args: Record<string, unknown> } | { error: string }> {
  if (tool === 'asset.createScript' && !findScriptAsset(args, assets)?.code) {
    // No stored script: maybe a runtime GameGold ships (any kit's, served by GET /unity/templates/<name>).
    const code = await templateCode(String(args.className))
    if (code !== null) return { args: { ...args, code } }
  }
  const resolved = resolveToolArgs(tool, args, assets, kitSettings, kitDataKind)
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

// Built-in runtime source, or null when GameGold ships no template by that name (404).
async function templateCode(className: string): Promise<string | null> {
  try {
    return (await api.get<{ code: string }>(`/unity/templates/${className}`)).data.code
  } catch (err) {
    if ((err as { response?: { status?: number } })?.response?.status === 404) return null
    throw err
  }
}

// ─── Genre kits ───────────────────────────────────────────────────────────────

export function useProjectKit(projectId: string) {
  return useQuery({
    queryKey: ['unity-kit', projectId],
    queryFn: async () => (await api.get<ProjectKit>(`/projects/${projectId}/unity/kit`)).data,
    enabled: !!projectId,
  })
}

export function useKits() {
  return useQuery({
    queryKey: ['unity-kits'],
    queryFn: async () => (await api.get<Kit[]>('/unity/kits')).data,
    staleTime: 5 * 60_000,
  })
}

export function useKitSample(kitId: KitId | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['unity-kit-sample', kitId],
    queryFn: async () => (await api.get<Record<string, unknown>>(`/unity/kits/${kitId}/sample`)).data,
    enabled: !!kitId && enabled,
    staleTime: Infinity,
    retry: false,
  })
}

// ─── Bridge ports: each Unity editor's bridge takes the first free port in 7432–7439 ──

export const MCP_PORTS = [7432, 7433, 7434, 7435, 7436, 7437, 7438, 7439]
// ponytail: one active bridge per tab. executeTool and friends pick it at call time from the latest scan and the
// project the page asked for, so a call never sees a port an effect hasn't caught up with.
let lastEditors: UnityEditor[] = []
let wantedProject: string | null | undefined
/** The port tools go to; null = this project's editor isn't running (another project's is). */
export function activePort(): number | null {
  if (!lastEditors.length) return MCP_PORTS[0] // nothing scanned/found yet: the default port fails on its own
  return pickEditor(lastEditors, wantedProject)?.port ?? null
}

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
export type UnityEditor = { port: number; version?: string; projectPath?: string; projectName?: string }

// Every running editor's bridge, in port order; null = none (keeps the fast reconnect poll below).
export async function scanEditors(): Promise<UnityEditor[] | null> {
  const found = await Promise.all(MCP_PORTS.map(async (port): Promise<UnityEditor | null> => {
    try {
      const res = await fetch(`http://localhost:${port}/status`, { method: 'GET', signal: AbortSignal.timeout(3000) })
      if (res.ok) return { ...(await res.json() as Omit<UnityEditor, 'port'>), port }
    } catch {
      /* nothing on this port (Unity not running or MCP package not installed) */
    }
    return null
  }))
  const editors = found.filter((e): e is UnityEditor => e !== null)
  lastEditors = editors
  return editors.length ? editors : null
}

// The editor whose project matches this GameGold project's unityProjectName (null if that one isn't running —
// never silently another project's), else the only one open when no name is set. With several open and no
// name, nothing is picked: the page asks which editor is this project's (Save version could otherwise
// commit another game's project).
export function pickEditor(editors: UnityEditor[], unityProjectName?: string | null): UnityEditor | null {
  if (unityProjectName) return editors.find((e) => e.projectName === unityProjectName) ?? null
  return editors.length === 1 ? editors[0] : null
}

// One cached scan shared by every page/card (Unity page, Assets page). Pass the project's unityProjectName
// so tools go to that editor when several are open.
export function useUnityConnection(unityProjectName?: string | null) {
  const q = useQuery({
    queryKey: ['unity-mcp-status'],
    queryFn: scanEditors,
    retry: false,
    staleTime: 30_000,
    // Unity restarts the bridge on every script reload — keep polling so GameGold reconnects by itself
    // (fast while down, slow while up so a dropped Editor is still noticed).
    refetchInterval: (query) => (query.state.data ? 15_000 : 4_000),
    refetchIntervalInBackground: true,
  })
  wantedProject = unityProjectName
  const editors = q.data ?? []
  const chosen = pickEditor(editors, unityProjectName)
  // Background polls keep the last result instead of flashing "checking" / hiding connected-only panels.
  const status: ConnectionStatus = q.data ? (chosen ? 'connected' : 'disconnected') : q.isFetching ? 'checking' : q.isFetched ? 'disconnected' : 'idle'
  const { refetch } = q
  const check = useCallback(async () => {
    const editors = (await refetch()).data
    return !!editors && !!pickEditor(editors, unityProjectName)
  }, [refetch, unityProjectName])
  // Editors are open but not this project's: the page says "Open <name> in Unity".
  const missingProject = q.data && !chosen ? unityProjectName ?? null : null
  return { status, unityInfo: chosen, editors, missingProject, check }
}

// Writing the same file / ensuring the same package / saving again changes nothing — safe to retry when busy.
const IDEMPOTENT_TOOLS = new Set(['editor.awaitCompile', 'editor.compileErrors', 'packages.ensure', 'asset.createScript',
  'asset.createText', 'asset.importSprite', 'scene.save', 'scene.snapshot', 'build.status'])
const COMPILE_WAIT_MS = 180_000
const COMPILE_POLL_MS = 3_000

/** Runs a plan step's tool, riding out Unity's script reloads: writing a script makes Unity recompile and restart
 *  the bridge, so the next step can find nobody listening ("Failed to reach…" — the request never arrived, so a
 *  retry is safe for every tool). editor.awaitCompile is also retried while Unity reports "Still compiling" or is
 *  busy; other tools are not retried on a busy reply, since the call may already have run. */
export async function executeStepTool(tool: string, args: Record<string, unknown>,
  exec: typeof executeTool = executeTool, wait = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<ToolResult> {
  const deadline = Date.now() + COMPILE_WAIT_MS
  for (;;) {
    const r = await exec(tool, args)
    const unreachable = !r.success && /Failed to reach/.test(r.message)
    const compiling = tool === 'editor.awaitCompile' && !r.success && /^Still compiling/.test(r.message)
    // A busy reply means the call may already have run — retry only tools that are safe to repeat.
    const busyRetry = !r.success && r.message === BRIDGE_BUSY && IDEMPOTENT_TOOLS.has(tool)
    if (!(unreachable || compiling || busyRetry) || Date.now() > deadline) return r
    await wait(COMPILE_POLL_MS)
  }
}

export async function executeTool(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
  const port = activePort()
  if (port === null) return { success: false, message: wantedProject
    ? `Open ${wantedProject} in Unity — its editor isn't running`
    : 'Several Unity editors are open — connect this project to its editor first' }
  try {
    const res = await fetch(`http://localhost:${port}/tool/${tool}`, {
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

export function useUnityMCP(unityProjectName?: string | null) {
  return { ...useUnityConnection(unityProjectName), executeTool }
}

// ─── Sync one asset to Unity (Assets page) ────────────────────────────────────

const SPRITE_FOLDERS: Partial<Record<string, string>> = { background: 'Backgrounds', portrait: 'Portraits' }

// Where the project's runtime expects this asset; null = nothing it would load. Mirrors unity_service.runtime_plan:
// narrative (or no kit) sorts sprites into Backgrounds/Portraits, other kits load every sprite from Sprites/.
export function syncCall(asset: Asset, kit?: Kit | null): { tool: string; args: Record<string, unknown> } | null {
  if (asset.type === 'dialogue' && asset.tree) {
    return { tool: 'asset.createText', args: { path: DIALOGUE_JSON_PATH, content: JSON.stringify(asset.tree, null, 2) } }
  }
  if (asset.type === 'data' && asset.data && kit && kit.dataKind === asset.kind) {
    return { tool: 'asset.createText', args: { path: kit.dataPath, content: JSON.stringify(asset.data, null, 2) } }
  }
  const folder = kit && kit.id !== 'narrative' ? 'Sprites' : SPRITE_FOLDERS[asset.kind ?? 'sprite']
  if (asset.type === 'sprite' && asset.url && folder) {
    const file = asset.name.replace(/[^\w\- ]/g, '_')
    return { tool: 'asset.importSprite', args: { name: asset.name, path: `Assets/Resources/GameGold/${folder}/${file}.png`, base64: asset.url } }
  }
  return null
}

export function useSyncToUnity(projectId: string, kit?: Kit | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (asset: Asset) => {
      const call = syncCall(asset, kit)
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

// JsonUtility can't read dictionaries, so chapter colours and character sides go over as lists.
export function playerSettingsFile(s: PlayerSettings): string {
  const { chapterColors, characterSides, ...rest } = s
  return JSON.stringify({
    ...rest,
    chapterColors: Object.entries(chapterColors).map(([chapter, color]) => ({ chapter, color })),
    characterSides: Object.entries(characterSides).map(([speaker, side]) => ({ speaker, side })),
  }, null, 2)
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
const RUNTIME_HEADER = /^\/\/ GameGold \w+ v(\d+)/ // every built-in runtime's first line

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
export function stepSource(tool: string, args: Record<string, unknown>, assets: Asset[], kitDataKind?: string | null): string {
  if (tool === 'asset.createText' && typeof args.dialogue === 'string') {
    return assets.find((a) => a.type === 'dialogue' && a.name === args.dialogue)?._id ?? 'plan'
  }
  if (tool === 'asset.createText' && typeof args.data === 'string') {
    const named = assets.filter((a) => a.type === 'data' && a.name === args.data)
    return (named.find((a) => a.kind === kitDataKind) ?? named[0])?._id ?? 'plan'
  }
  if (tool === 'asset.createText' && typeof args.kitSettings === 'string') return 'kit-settings'
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
export function overwriteTarget(path: string, assets: Asset[], record: UnitySyncRecord | undefined, kit?: Kit | null): Asset | 'settings' | null {
  if (path === PLAYER_SETTINGS_PATH) return 'settings'
  const matches = assets.filter((a) => syncCall(a, kit)?.args.path === path)
  return matches.find((a) => a._id === record?.source) ?? matches[0] ?? null
}

// Inverse of playerSettingsFile.
export function settingsFromFile(file: Record<string, unknown>): PlayerSettings {
  const { chapterColors, characterSides, twoCharacterStaging, choiceRipple, originalBackgrounds, ...rest } = file as Omit<PlayerSettings, 'chapterColors' | 'characterSides'> & {
    chapterColors?: { chapter: string; color: string }[]
    characterSides?: { speaker: string; side: StageSide }[]
  }
  return {
    ...rest,
    twoCharacterStaging: twoCharacterStaging ?? true, // v1 files predate staging
    choiceRipple: choiceRipple ?? true, // v1/v2 files predate the ripple cue
    originalBackgrounds: originalBackgrounds ?? [], // v1–v3 files predate original-art backgrounds
    chapterColors: Object.fromEntries((chapterColors ?? []).map((c) => [c.chapter, c.color])),
    characterSides: Object.fromEntries((characterSides ?? []).map((c) => [c.speaker, c.side])),
  }
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

// ─── Update runtime (gap 40): re-send the project's kit runtime without touching plan steps ──

export const DEFAULT_RUNTIME = 'DialoguePlayer'
export const runtimePath = (runtimeClass: string) => `Assets/Scripts/${runtimeClass}.cs`
export const RUNTIME_PATH = runtimePath(DEFAULT_RUNTIME)

export function useRuntimeTemplate(runtimeClass: string = DEFAULT_RUNTIME) {
  return useQuery({
    queryKey: ['unity-template', runtimeClass],
    queryFn: async () => (await api.get<{ code: string; version: number | null }>(`/unity/templates/${runtimeClass}`)).data,
    staleTime: 5 * 60_000,
  })
}

// true = Unity has an older (or unknown) copy of the runtime at `path` than the one GameGold serves now.
export function runtimeOutdated(
  records: UnitySyncRecord[], served: number | null | undefined, planSentRuntime: boolean, path: string = RUNTIME_PATH,
): boolean {
  if (served == null) return false
  const record = records.find((r) => r.path === path)
  return record ? record.version !== served : planSentRuntime
}

export function useUpdateRuntime(projectId: string, runtimeClass: string = DEFAULT_RUNTIME) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { code } = (await api.get<{ code: string }>(`/unity/templates/${runtimeClass}`)).data
      const args = { className: runtimeClass, path: runtimePath(runtimeClass), code }
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
  return { scene: s.scene, isPlaying: s.isPlaying, objects: s.objects, playerSettings: s.playerSettings }
}

export function useProposeChange(projectId: string) {
  return useMutation({
    mutationFn: async (request: string) => {
      const full = await snapshotUnity()
      const res = await api.post<UnityChangePlan>(`/projects/${projectId}/unity/change`, {
        request, snapshot: changeSnapshot(full),
      })
      // gap 44: the panel needs to know if Unity was playing when this was planned, to gate "Run these".
      return { ...res.data, isPlaying: !!full.isPlaying }
    },
  })
}

// ─── Gap 45: Player Settings patch from "Change something" ───────────────────

const SETTINGS_FIELD_LABELS: Record<keyof PlayerSettings, string> = {
  look: 'look',
  textSpeedCps: 'text speed',
  wordmarkTitle: 'wordmark title',
  ambience: 'ambience',
  volume: 'volume',
  chapterColors: 'chapter tint',
  twoCharacterStaging: 'two-character staging',
  characterSides: 'character sides',
  choiceRipple: 'choice ripple cue',
  originalBackgrounds: 'original-art backgrounds',
}

// One line per changed key, e.g. "text speed 40 → 30" or "chapter tint intro #2a3f5c → #ff5277".
export function describeSettingsPatch(current: PlayerSettings, patch: Partial<PlayerSettings>): string[] {
  const lines: string[] = []
  for (const key of Object.keys(patch) as (keyof PlayerSettings)[]) {
    const label = SETTINGS_FIELD_LABELS[key] ?? key
    if (key === 'chapterColors') {
      const next = patch.chapterColors ?? {}
      for (const [chapter, color] of Object.entries(next)) {
        if (current.chapterColors[chapter] !== color) lines.push(`${label} ${chapter} ${current.chapterColors[chapter] ?? '(none)'} → ${color}`)
      }
      continue
    }
    const before = current[key]
    const after = patch[key]
    if (before !== after) lines.push(`${label} ${String(before)} → ${String(after)}`)
  }
  return lines
}

// ─── Build for web (gap 66): bridge build.webgl, then poll build.status ───────

export type WebBuildState = 'idle' | 'building' | 'succeeded' | 'failed'
export type WebBuildStatus = { state: WebBuildState; message: string; outputPath: string; sizeMb: number; seconds: number }

export const BUILD_POLL_MS = 3000
export const BUILD_POLL_MAX_FAILURES = 10
// The bridge answers this while Unity's main thread is busy building — contact is fine, keep waiting.
export const BRIDGE_BUSY = 'Tool timed out'

/** The backend stores naive UTC datetimes and serializes them without an offset — read those as UTC, not local time. */
export function parseServerTime(s: string): number {
  return Date.parse(/(Z|[+-]\d\d:?\d\d)$/i.test(s) ? s : `${s}Z`)
}

export function useWebBuild(
  exec: (tool: string, args: Record<string, unknown>) => Promise<ToolResult> = executeTool,
  connected = false,
) {
  const [status, setStatus] = useState<WebBuildStatus | null>(null)
  const [startedAt, setStartedAt] = useState(0)
  const [now, setNow] = useState(0)
  // when the successful build was STARTED — changes synced after that aren't in it (stale-build check)
  const [builtFrom, setBuiltFrom] = useState<number | null>(null)
  const building = status?.state === 'building'

  const start = useCallback(async () => {
    const t = Date.now()
    const res = await exec('build.webgl', {})
    setStartedAt(t)
    setNow(t)
    setStatus({ state: res.success ? 'building' : 'failed', message: res.message, outputPath: '', sizeMb: 0, seconds: 0 })
  }, [exec])

  // On open, pick up a build Unity already finished (or is still running) — the bridge remembers it
  // for the Editor session, so reopening the page doesn't force a rebuild before publishing.
  const [checked, setChecked] = useState(false)
  useEffect(() => {
    if (!connected || checked || status) return
    let cancelled = false
    void exec('build.status', {}).then((res) => {
      if (cancelled) return
      setChecked(true)
      const data = res.data as WebBuildStatus | undefined
      if (!res.success || !data || data.state === 'idle') return
      if (data.state === 'building') { const t = Date.now(); setStartedAt(t); setNow(t) }
      setStatus(data) // builtFrom stays null: we don't know when that build started, so no stale warning
    })
    return () => { cancelled = true }
  }, [connected, checked, status, exec])

  useEffect(() => {
    if (!building) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let failures = 0
    const fail = (message: string) => setStatus({ state: 'failed', message, outputPath: '', sizeMb: 0, seconds: 0 })
    const poll = async () => {
      const res = await exec('build.status', {})
      if (cancelled) return
      const data = res.data as WebBuildStatus | undefined
      failures = res.success || res.message === BRIDGE_BUSY ? 0 : failures + 1
      if (failures >= BUILD_POLL_MAX_FAILURES) fail('Lost contact with Unity during the build — check the Unity Console.')
      // idle after building: SessionState was wiped, so Unity restarted mid-build
      else if (res.success && data?.state === 'idle') fail('The build was interrupted (Unity restarted).')
      else if (res.success && data && data.state !== 'building') {
        setStatus(data)
        setBuiltFrom(data.state === 'succeeded' ? startedAt : null)
      }
      else timer = setTimeout(() => void poll(), BUILD_POLL_MS)
    }
    timer = setTimeout(() => void poll(), BUILD_POLL_MS)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => { cancelled = true; clearTimeout(timer); clearInterval(tick) }
  }, [building, exec, startedAt])

  return { status, elapsed: building ? Math.round((now - startedAt) / 1000) : 0, start, builtFrom }
}
