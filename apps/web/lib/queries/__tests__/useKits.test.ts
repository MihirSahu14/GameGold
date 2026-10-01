import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { Asset, Kit } from '@gamegold/types'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }))

import { api } from '@/lib/api'
import {
  pickEditor, scanEditors, useUnityConnection, executeTool, syncCall, resolveToolArgs, prepareToolArgs, stepSource,
  runtimeOutdated, runtimePath, type UnityEditor,
} from '@/lib/queries/useUnity'

const GRID: Kit = {
  id: 'grid', title: 'Grid', runtimeClass: 'GridPlayer', runtimePath: 'Assets/Scripts/GridPlayer.cs', objectName: 'GameGold Grid',
  dataKind: 'levels', dataPath: 'Assets/Resources/GameGold/levels.json', settingsPath: null, genres: ['puzzle'], available: true, missing: [],
}

function asset(partial: Partial<Asset>): Asset {
  return {
    _id: 'a', projectId: 'p', type: 'data', name: '', description: '', approved: false, placeholder: false, replaced: false,
    disclosed: false, unityGuide: { steps: [], completed: [] }, createdAt: '2026-01-01', ...partial,
  }
}
const LEVELS = asset({ _id: 'd1', name: 'Dockside', kind: 'levels', data: { levels: [{ rows: ['#@$.#'] }] } })

afterEach(() => vi.unstubAllGlobals())

// Bridges answering on the given ports (with these project names); every other port refuses.
function stubBridges(names: Record<number, string>) {
  const fetchMock = vi.fn(async (url: string) => {
    const port = Number(new URL(url).port)
    if (!(port in names)) throw new TypeError('refused')
    return { ok: true, json: async () => (url.endsWith('/status') ? { projectName: names[port], version: '6000.5' } : { success: true, message: `ran on ${port}` }) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('multi-editor port selection', () => {
  const editors: UnityEditor[] = [{ port: 7432, projectName: 'RippleGG' }, { port: 7433, projectName: 'Dockside' }]

  it('picks the editor matching the project, else the first found', () => {
    expect(pickEditor(editors, 'Dockside')?.port).toBe(7433)
    expect(pickEditor(editors, 'Nope')?.port).toBe(7432)
    expect(pickEditor(editors, null)?.port).toBe(7432)
    expect(pickEditor([], 'Dockside')).toBeNull()
  })

  it('scans 7432–7439 and returns only bridges that answered, in port order', async () => {
    const fetchMock = stubBridges({ 7432: 'RippleGG', 7435: 'Dockside' })
    expect(await scanEditors()).toEqual([
      { port: 7432, projectName: 'RippleGG', version: '6000.5' },
      { port: 7435, projectName: 'Dockside', version: '6000.5' },
    ])
    expect(fetchMock.mock.calls.map((c) => new URL(String(c[0])).port)).toEqual(['7432', '7433', '7434', '7435', '7436', '7437', '7438', '7439'])
  })

  it('returns null when no editor is running', async () => {
    stubBridges({})
    expect(await scanEditors()).toBeNull()
  })

  it('executeTool goes to the editor chosen for this project', async () => {
    const fetchMock = stubBridges({ 7432: 'RippleGG', 7434: 'Dockside' })
    const qc = new QueryClient()
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children)
    const { result } = renderHook(() => useUnityConnection('Dockside'), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('connected'))
    expect(result.current.unityInfo?.port).toBe(7434)
    expect(result.current.editors).toHaveLength(2)
    expect((await executeTool('scene.snapshot', {})).message).toBe('ran on 7434')
    expect(fetchMock).toHaveBeenLastCalledWith('http://localhost:7434/tool/scene.snapshot', expect.anything())
  })
})

describe('kit data in Unity', () => {
  it('syncs a data asset to its kit data path, and only when the kit plays that kind', () => {
    const call = syncCall(LEVELS, GRID)
    expect(call?.tool).toBe('asset.createText')
    expect(call?.args.path).toBe(GRID.dataPath)
    expect(JSON.parse(String(call?.args.content))).toEqual(LEVELS.data)
    expect(syncCall(LEVELS, { ...GRID, dataKind: 'arena' })).toBeNull()
    expect(syncCall(LEVELS, null)).toBeNull()
  })

  it('puts every sprite in Sprites/ for non-narrative kits', () => {
    const sprite = asset({ type: 'sprite', name: 'crate/1', kind: 'sprite', url: 'data:image/png;base64,AA' })
    expect(syncCall(sprite, GRID)?.args.path).toBe('Assets/Resources/GameGold/Sprites/crate_1.png')
    expect(syncCall(sprite, null)).toBeNull() // narrative only loads backgrounds/portraits
  })

  it('resolves {data} and {kitSettings} plan args into file contents', () => {
    const r = resolveToolArgs('asset.createText', { data: 'Dockside', path: GRID.dataPath }, [LEVELS])
    expect(r).toEqual({ args: { path: GRID.dataPath, content: JSON.stringify(LEVELS.data, null, 2) } })
    expect(resolveToolArgs('asset.createText', { data: 'Ghost', path: 'x' }, [LEVELS])).toHaveProperty('error')

    const s = resolveToolArgs('asset.createText', { kitSettings: 'platformer', path: 'p.json' }, [], { platformer: { jumpHeight: 3 } })
    expect(s).toEqual({ args: { path: 'p.json', content: JSON.stringify({ jumpHeight: 3 }, null, 2) } })
    expect(resolveToolArgs('asset.createText', { kitSettings: 'fps', path: 'f.json' }, [])).toEqual({ args: { path: 'f.json', content: '{}' } })
  })

  it('records data writes against the data asset', () => {
    expect(stepSource('asset.createText', { data: 'Dockside' }, [LEVELS])).toBe('d1')
    expect(stepSource('asset.createText', { kitSettings: 'grid' }, [])).toBe('kit-settings')
  })

  it('fetches any kit runtime template, and fails cleanly when GameGold ships none', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { code: '// GameGold GridPlayer v1' } })
    expect(await prepareToolArgs('asset.createScript', { className: 'GridPlayer', path: GRID.runtimePath }, [])).toEqual({
      args: { className: 'GridPlayer', path: GRID.runtimePath, code: '// GameGold GridPlayer v1' },
    })
    vi.mocked(api.get).mockRejectedValueOnce({ response: { status: 404 } })
    expect(await prepareToolArgs('asset.createScript', { className: 'Nope', path: 'x' }, [])).toHaveProperty('error')
  })
})

describe('generic runtime banner state', () => {
  const rec = (path: string, version: number) => ({ path, sha256: 'x', source: 'runtime', version, syncedAt: '' })

  it('compares the installed copy of the kit runtime at its own path', () => {
    const path = runtimePath('GridPlayer')
    expect(path).toBe('Assets/Scripts/GridPlayer.cs')
    expect(runtimeOutdated([rec(path, 1)], 2, false, path)).toBe(true)
    expect(runtimeOutdated([rec(path, 2)], 2, false, path)).toBe(false)
    // a DialoguePlayer record says nothing about GridPlayer
    expect(runtimeOutdated([rec(runtimePath('DialoguePlayer'), 1)], 2, false, path)).toBe(false)
  })
})
