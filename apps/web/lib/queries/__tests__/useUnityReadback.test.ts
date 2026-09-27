import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { Asset, PlayerSettings, UnitySnapshotFile, UnitySyncRecord } from '@gamegold/types'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() } }))
vi.mock('@/lib/utils', () => ({ downloadBlob: vi.fn() }))
vi.mock('@/lib/rasterize', () => ({ svgToPngDataUri: vi.fn() }))

import { api } from '@/lib/api'
import {
  diffUnity, sha256Hex, recordWrite, stepSource, overwriteTarget, pullFromUnity, settingsFromFile,
  playerSettingsFile, runtimeVersion, runtimeOutdated, useUpdateRuntime, useProposeChange, describeSettingsPatch,
  DIALOGUE_JSON_PATH, PLAYER_SETTINGS_PATH, RUNTIME_PATH,
} from '@/lib/queries/useUnity'

const G = 'Assets/Resources/GameGold'
const file = (path: string, sha256: string): UnitySnapshotFile => ({ path, sha256, length: 1 })
const rec = (path: string, sha256: string, source = 's'): UnitySyncRecord => ({ path, sha256, source, syncedAt: '2026-09-26' })

function asset(partial: Partial<Asset>): Asset {
  return {
    _id: 'a', projectId: 'p', type: 'sprite', name: '', description: '', approved: false,
    unityGuide: { steps: [], completed: [] } as unknown as Asset['unityGuide'],
    createdAt: '2026-01-01', ...partial,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('diffUnity', () => {
  const cases: { name: string; files: UnitySnapshotFile[]; records: UnitySyncRecord[]; want: [string, string][] }[] = [
    { name: 'same hash → in sync', files: [file(`${G}/dialogue.json`, 'h1')], records: [rec(`${G}/dialogue.json`, 'h1')], want: [[`${G}/dialogue.json`, 'in-sync']] },
    { name: 'different hash → changed in Unity', files: [file(`${G}/dialogue.json`, 'h2')], records: [rec(`${G}/dialogue.json`, 'h1')], want: [[`${G}/dialogue.json`, 'changed']] },
    { name: 'record without file → missing in Unity', files: [], records: [rec(`${G}/Backgrounds/a.png`, 'h1')], want: [[`${G}/Backgrounds/a.png`, 'missing']] },
    { name: 'file without record → never synced', files: [file(`${G}/Portraits/b.png`, 'h')], records: [], want: [[`${G}/Portraits/b.png`, 'unsynced']] },
    { name: 'records outside Resources/GameGold (runtime script) are ignored', files: [], records: [rec('Assets/Scripts/DialoguePlayer.cs', 'h')], want: [] },
    {
      name: 'sorted: changed, missing, never synced, in sync',
      files: [file(`${G}/z.json`, 'x'), file(`${G}/b.png`, 'new'), file(`${G}/a.png`, 'same')],
      records: [rec(`${G}/a.png`, 'same'), rec(`${G}/b.png`, 'old'), rec(`${G}/gone.png`, 'h')],
      want: [[`${G}/b.png`, 'changed'], [`${G}/gone.png`, 'missing'], [`${G}/z.json`, 'unsynced'], [`${G}/a.png`, 'in-sync']],
    },
  ]
  it.each(cases)('$name', ({ files, records, want }) => {
    expect(diffUnity(files, records).map((i) => [i.path, i.status])).toEqual(want)
  })
})

describe('recording what was written', () => {
  it('sha256Hex matches the known digest', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('records a createText write with the hash of its UTF-8 content', async () => {
    await recordWrite('p1', 'asset.createText', { path: PLAYER_SETTINGS_PATH, content: 'abc' }, 'settings')
    expect(api.post).toHaveBeenCalledWith('/projects/p1/unity/synced', {
      path: PLAYER_SETTINGS_PATH, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', source: 'settings',
    })
  })

  it('records an importSprite write with the hash of the decoded PNG bytes', async () => {
    await recordWrite('p1', 'asset.importSprite', { path: `${G}/Backgrounds/k.png`, base64: 'data:image/png;base64,' + btoa('abc') }, 'id1')
    expect(vi.mocked(api.post).mock.calls[0][1]).toMatchObject({ sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', source: 'id1' })
  })

  it('records the built-in runtime with its template version, and nothing for other tools', async () => {
    await recordWrite('p1', 'asset.createScript', { path: 'Assets/Scripts/DialoguePlayer.cs', code: '// GameGold DialoguePlayer v7\nclass X {}' }, 'runtime')
    expect(vi.mocked(api.post).mock.calls[0][1]).toMatchObject({ path: 'Assets/Scripts/DialoguePlayer.cs', source: 'runtime', version: 7 })
    vi.mocked(api.post).mockClear()
    await recordWrite('p1', 'gameobject.create', { name: 'x' }, 'plan')
    await recordWrite('p1', 'asset.createScript', { path: 'Assets/Scripts/Mine.cs', code: 'class Mine {}' }, 'plan')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('runtimeVersion reads the header line', () => {
    expect(runtimeVersion('// GameGold DialoguePlayer v12\n...')).toBe(12)
    expect(runtimeVersion('class X {}')).toBeNull()
  })

  it('stepSource maps plan writes to the asset they came from', () => {
    const assets = [asset({ _id: 'd1', type: 'dialogue', name: 'Ripple' }), asset({ _id: 's1', name: 'kitchen' })]
    expect(stepSource('asset.createText', { dialogue: 'Ripple' }, assets)).toBe('d1')
    expect(stepSource('asset.importSprite', { name: 'kitchen' }, assets)).toBe('s1')
    expect(stepSource('asset.createScript', { className: 'DialoguePlayer' }, assets)).toBe('runtime')
    expect(stepSource('scene.new', {}, assets)).toBe('plan')
  })
})

describe('overwriteTarget', () => {
  const bg = asset({ _id: 's1', kind: 'background', name: 'kitchen', url: 'data:image/png;base64,AA' })
  const d1 = asset({ _id: 'd1', type: 'dialogue', name: 'Old', tree: { npcName: '', personality: '', nodes: [] } })
  const d2 = asset({ _id: 'd2', type: 'dialogue', name: 'Ripple', tree: { npcName: '', personality: '', nodes: [] } })
  it('settings file → settings; files → the asset whose sync path matches (record source first)', () => {
    expect(overwriteTarget(PLAYER_SETTINGS_PATH, [bg], undefined)).toBe('settings')
    expect(overwriteTarget(`${G}/Backgrounds/kitchen.png`, [bg], undefined)).toBe(bg)
    expect(overwriteTarget(DIALOGUE_JSON_PATH, [d1, d2], rec(DIALOGUE_JSON_PATH, 'h', 'd2'))).toBe(d2)
    expect(overwriteTarget(`${G}/Backgrounds/other.png`, [bg], undefined)).toBeNull()
  })
})

describe('settingsFromFile', () => {
  it('inverts playerSettingsFile', () => {
    const s = { look: 'duotone' as const, chapterColors: { '1': '#112233' }, textSpeedCps: 50, wordmarkTitle: false, ambience: true, volume: 0.3,
      twoCharacterStaging: false, characterSides: { Avery: 'left' as const, Skyler: 'right' as const }, choiceRipple: false, originalBackgrounds: ['title'] }
    expect(settingsFromFile(JSON.parse(playerSettingsFile(s)))).toEqual(s)
  })

  it('defaults staging on for v1 files', () => {
    expect(settingsFromFile({ look: 'plain', chapterColors: [] })).toMatchObject({ twoCharacterStaging: true, characterSides: {} })
  })
})

describe('pullFromUnity', () => {
  const read = (text: string) => vi.fn().mockResolvedValue({ success: true, message: 'ok', data: { base64: btoa(text) } })

  it('dialogue.json → PUT the tree on the synced asset, then record the new hash', async () => {
    const tree = { npcName: '', personality: '', nodes: [{ id: 'a', text: 'hi', choices: [] }] }
    const exec = read(JSON.stringify(tree))
    vi.mocked(api.put).mockResolvedValue({ data: { _id: 'd2' } })
    const d2 = asset({ _id: 'd2', type: 'dialogue', name: 'Ripple' })
    await pullFromUnity('p1', { path: DIALOGUE_JSON_PATH, status: 'changed', record: rec(DIALOGUE_JSON_PATH, 'h', 'd2') }, [d2], exec)
    expect(exec).toHaveBeenCalledWith('asset.readFile', { path: DIALOGUE_JSON_PATH })
    expect(api.put).toHaveBeenCalledWith('/projects/p1/assets/d2/tree', tree)
    expect(vi.mocked(api.post).mock.calls.at(-1)).toEqual(['/projects/p1/unity/synced', expect.objectContaining({ path: DIALOGUE_JSON_PATH, source: 'd2' })])
  })

  it('dialogue.json with no story in GameGold → imports it', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { _id: 'new' } })
    await pullFromUnity('p1', { path: DIALOGUE_JSON_PATH, status: 'unsynced' }, [], read('{"nodes":[]}'))
    expect(api.post).toHaveBeenCalledWith('/projects/p1/assets/dialogue/import', { name: 'Story from Unity', tree: { nodes: [] } })
  })

  it('player_settings.json → PATCH the project settings', async () => {
    const s = { look: 'plain' as const, chapterColors: {}, textSpeedCps: 40, wordmarkTitle: false, ambience: false, volume: 0.5, twoCharacterStaging: true, characterSides: {}, choiceRipple: true, originalBackgrounds: [] }
    await pullFromUnity('p1', { path: PLAYER_SETTINGS_PATH, status: 'changed' }, [], read(playerSettingsFile(s)))
    expect(api.patch).toHaveBeenCalledWith('/projects/p1', { playerSettings: s })
  })

  it('a PNG → new non-placeholder sprite of the folder kind', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { _id: 'n1' } })
    await pullFromUnity('p1', { path: `${G}/Portraits/portrait_avery.png`, status: 'unsynced' }, [], read('PNGDATA'))
    expect(api.post).toHaveBeenCalledWith('/projects/p1/assets/sprites/upload', {
      name: 'portrait_avery', kind: 'portrait', dataUri: 'data:image/png;base64,' + btoa('PNGDATA'),
    })
  })

  it('fails loudly when the bridge cannot read the file', async () => {
    const exec = vi.fn().mockResolvedValue({ success: false, message: 'No file' })
    await expect(pullFromUnity('p1', { path: DIALOGUE_JSON_PATH, status: 'changed' }, [], exec)).rejects.toThrow('No file')
  })
})

describe('Update runtime (gap 40)', () => {
  const runtimeRec = (version?: number): UnitySyncRecord => ({ ...rec(RUNTIME_PATH, 'h', 'runtime'), version })

  it.each([
    { name: 'same version → current', records: [runtimeRec(2)], served: 2, plan: true, want: false },
    { name: 'older synced version → outdated', records: [runtimeRec(1)], served: 2, plan: true, want: true },
    { name: 'sent by the plan before versions were tracked → outdated', records: [], served: 2, plan: true, want: true },
    { name: 'never sent → nothing to update', records: [], served: 2, plan: false, want: false },
    { name: 'template has no version → never nag', records: [runtimeRec(1)], served: null, plan: true, want: false },
  ])('$name', ({ records, served, plan, want }) => {
    expect(runtimeOutdated(records, served, plan)).toBe(want)
  })

  it('re-sends the built-in DialoguePlayer and records its version', async () => {
    const code = '// GameGold DialoguePlayer v3\nclass DialoguePlayer {}'
    vi.mocked(api.get).mockResolvedValue({ data: { className: 'DialoguePlayer', code, version: 3 } })
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ success: true, message: 'Created' }) })
    vi.stubGlobal('fetch', fetchMock)
    const qc = new QueryClient()
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children)
    const { result } = renderHook(() => useUpdateRuntime('p1'), { wrapper })
    await act(async () => { await result.current.mutateAsync() })
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:7432/tool/asset.createScript')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ className: 'DialoguePlayer', path: RUNTIME_PATH, code })
    expect(api.post).toHaveBeenCalledWith('/projects/p1/unity/synced', expect.objectContaining({ path: RUNTIME_PATH, source: 'runtime', version: 3 }))
    vi.unstubAllGlobals()
  })
})

describe('useProposeChange (§3)', () => {
  it('snapshots Unity, drops file hashes, and asks the backend for steps', async () => {
    const snap = { scene: 'Story', objects: [{ name: 'GameGold Dialogue', components: ['DialoguePlayer'], children: [] }], playerSettings: null, files: [{ path: 'x', length: 1, sha256: 'h' }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ success: true, message: 'ok', data: snap }) }))
    vi.mocked(api.post).mockResolvedValue({ data: { summary: 's', steps: [] } })
    const qc = new QueryClient()
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children)
    const { result } = renderHook(() => useProposeChange('p1'), { wrapper })
    await act(async () => { await result.current.mutateAsync('faster text') })
    const { files: _f, ...rest } = snap
    expect(api.post).toHaveBeenCalledWith('/projects/p1/unity/change', { request: 'faster text', snapshot: rest })
    vi.unstubAllGlobals()
  })

  // Gap 44: the panel disables "Run these" using this flag, so it must reflect the fresh snapshot.
  it('carries isPlaying from the snapshot into the returned plan', async () => {
    const snap = { scene: 'Story', isPlaying: true, objects: [], playerSettings: null, files: [] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ success: true, message: 'ok', data: snap }) }))
    vi.mocked(api.post).mockResolvedValue({ data: { summary: 's', steps: [] } })
    const qc = new QueryClient()
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children)
    const { result } = renderHook(() => useProposeChange('p1'), { wrapper })
    let plan
    await act(async () => { plan = await result.current.mutateAsync('faster text') })
    expect(plan).toEqual({ summary: 's', steps: [], isPlaying: true })
    vi.unstubAllGlobals()
  })
})

// ─── Gap 45: describing a Player Settings patch as a readable diff ───────────

describe('describeSettingsPatch', () => {
  const current: PlayerSettings = {
    look: 'plain', chapterColors: { intro: '#2a3f5c' }, textSpeedCps: 40, wordmarkTitle: false, ambience: false, volume: 0.5,
  }

  it('describes a scalar field change', () => {
    expect(describeSettingsPatch(current, { textSpeedCps: 30 })).toEqual(['text speed 40 → 30'])
  })

  it('describes a chapter tint change by chapter id', () => {
    expect(describeSettingsPatch(current, { chapterColors: { intro: '#ff5277' } })).toEqual([
      'chapter tint intro #2a3f5c → #ff5277',
    ])
  })

  it('skips fields that did not actually change', () => {
    expect(describeSettingsPatch(current, { textSpeedCps: 40, ambience: true })).toEqual(['ambience false → true'])
  })

  it('describes several fields at once', () => {
    expect(describeSettingsPatch(current, { textSpeedCps: 30, wordmarkTitle: true })).toEqual([
      'text speed 40 → 30', 'wordmark title false → true',
    ])
  })
})
