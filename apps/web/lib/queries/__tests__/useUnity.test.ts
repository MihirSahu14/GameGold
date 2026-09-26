import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { Asset } from '@gamegold/types'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }))
vi.mock('@/lib/utils', () => ({ downloadBlob: vi.fn() }))
vi.mock('@/lib/rasterize', () => ({ svgToPngDataUri: vi.fn() }))

import { api } from '@/lib/api'
import { downloadBlob } from '@/lib/utils'
import { svgToPngDataUri } from '@/lib/rasterize'
import { resolveToolArgs, prepareToolArgs, useExportBuildPack, syncCall, useUnityConnection, playerSettingsFile, PLAYER_SETTINGS_PATH, runQueue } from '@/lib/queries/useUnity'

function asset(partial: Partial<Asset>): Asset {
  return {
    _id: 'a', projectId: 'p', type: 'script', name: '', description: '', approved: false,
    unityGuide: { steps: [], completed: [] } as unknown as Asset['unityGuide'],
    createdAt: '2026-01-01', ...partial,
  }
}

const ASSETS = [
  asset({ type: 'script', name: 'PlayerController', code: 'class PlayerController {}' }),
  asset({ type: 'sprite', name: 'Hero', url: 'data:image/png;base64,AAA' }),
  asset({ type: 'sprite', name: 'Coin', url: 'data:image/svg+xml;base64,BBB' }),
  asset({ type: 'dialogue', name: 'Ripple', tree: { npcName: '', personality: '', nodes: [{ id: 'a', speaker: 'Avery', text: 'Hi', choices: [], ending: 'good' }] } }),
]

describe('resolveToolArgs', () => {
  it('injects script code into asset.createScript by className', () => {
    const r = resolveToolArgs('asset.createScript', { className: 'PlayerController', path: 'Assets/Scripts/PlayerController.cs' }, ASSETS)
    expect(r).toEqual({ args: { className: 'PlayerController', path: 'Assets/Scripts/PlayerController.cs', code: 'class PlayerController {}' } })
  })

  it('fails createScript when no matching script asset exists', () => {
    const r = resolveToolArgs('asset.createScript', { className: 'Missing', path: 'x' }, ASSETS)
    expect(r).toHaveProperty('error', expect.stringContaining('Missing'))
  })

  it('injects the PNG data URI into asset.importSprite', () => {
    expect(resolveToolArgs('asset.importSprite', { name: 'Hero' }, ASSETS)).toEqual({
      args: { name: 'Hero', base64: 'data:image/png;base64,AAA' },
    })
  })

  it('passes SVG sprites through for prepareToolArgs to rasterize', () => {
    expect(resolveToolArgs('asset.importSprite', { name: 'Coin' }, ASSETS)).toEqual({
      args: { name: 'Coin', base64: 'data:image/svg+xml;base64,BBB' },
    })
  })

  it('prepareToolArgs rasterizes SVG sprites to PNG before sending', async () => {
    vi.mocked(svgToPngDataUri).mockResolvedValue('data:image/png;base64,PNG')
    expect(await prepareToolArgs('asset.importSprite', { name: 'Coin' }, ASSETS)).toEqual({
      args: { name: 'Coin', base64: 'data:image/png;base64,PNG' },
    })
    expect(svgToPngDataUri).toHaveBeenCalledWith('data:image/svg+xml;base64,BBB')
  })

  it('prepareToolArgs leaves PNG sprites alone', async () => {
    vi.mocked(svgToPngDataUri).mockClear()
    expect(await prepareToolArgs('asset.importSprite', { name: 'Hero' }, ASSETS)).toEqual({
      args: { name: 'Hero', base64: 'data:image/png;base64,AAA' },
    })
    expect(svgToPngDataUri).not.toHaveBeenCalled()
  })

  it('injects the dialogue tree JSON into asset.createText with a Resources default path', () => {
    const r = resolveToolArgs('asset.createText', { dialogue: 'Ripple' }, ASSETS)
    expect(r).toHaveProperty('args.path', 'Assets/Resources/GameGold/dialogue.json')
    const args = (r as { args: { content: string; dialogue?: string } }).args
    expect(JSON.parse(args.content).nodes[0].ending).toBe('good')
    expect(args.dialogue).toBeUndefined()
  })

  it('fails createText when the dialogue asset is missing', () => {
    expect(resolveToolArgs('asset.createText', { dialogue: 'Nope' }, ASSETS)).toHaveProperty('error', expect.stringContaining('Nope'))
  })

  it('prepareToolArgs fetches the built-in DialoguePlayer when no script asset exists', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { className: 'DialoguePlayer', code: 'class DialoguePlayer {}' } })
    expect(await prepareToolArgs('asset.createScript', { className: 'DialoguePlayer', path: 'Assets/Scripts/DialoguePlayer.cs' }, ASSETS)).toEqual({
      args: { className: 'DialoguePlayer', path: 'Assets/Scripts/DialoguePlayer.cs', code: 'class DialoguePlayer {}' },
    })
    expect(api.get).toHaveBeenCalledWith('/unity/templates/DialoguePlayer')
  })

  it('prepareToolArgs prefers a stored DialoguePlayer script asset over the built-in one', async () => {
    vi.mocked(api.get).mockClear()
    const own = [...ASSETS, asset({ type: 'script', name: 'DialoguePlayer', code: 'mine' })]
    expect(await prepareToolArgs('asset.createScript', { className: 'DialoguePlayer' }, own)).toEqual({
      args: { className: 'DialoguePlayer', code: 'mine' },
    })
    expect(api.get).not.toHaveBeenCalled()
  })

  it('passes other tools through untouched', () => {
    expect(resolveToolArgs('scene.new', { name: 'Main' }, ASSETS)).toEqual({ args: { name: 'Main' } })
  })
})

describe('useExportBuildPack', () => {
  it('downloads the build pack zip with the server filename', async () => {
    const blob = new Blob(['zip'])
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: blob,
      headers: { 'content-disposition': 'attachment; filename="Bees_build_pack.zip"' },
    })
    const qc = new QueryClient()
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children)
    const { result } = renderHook(() => useExportBuildPack('p1'), { wrapper })

    await act(async () => { await result.current.mutateAsync() })
    expect(api.get).toHaveBeenCalledWith('/projects/p1/unity/export', { responseType: 'blob' })
    expect(downloadBlob).toHaveBeenCalledWith(blob, 'Bees_build_pack.zip')
  })
})

describe('syncCall', () => {
  it('writes a dialogue tree to the Resources story path', () => {
    const d = ASSETS[3]
    expect(syncCall(d)).toEqual({ tool: 'asset.createText', args: { path: 'Assets/Resources/GameGold/dialogue.json', content: JSON.stringify(d.tree, null, 2) } })
  })

  it('imports backgrounds and portraits into their Resources folders', () => {
    expect(syncCall(asset({ type: 'sprite', name: 'cafe night!', kind: 'background', url: 'x' })))
      .toEqual({ tool: 'asset.importSprite', args: { name: 'cafe night!', path: 'Assets/Resources/GameGold/Backgrounds/cafe night_.png', base64: 'x' } })
    expect(syncCall(asset({ type: 'sprite', name: 'Avery', kind: 'portrait', url: 'x' }))?.args.path)
      .toBe('Assets/Resources/GameGold/Portraits/Avery.png')
  })

  it('has nothing to sync for plain sprites and scripts', () => {
    expect(syncCall(asset({ type: 'sprite', name: 'Coin', kind: 'sprite', url: 'x' }))).toBeNull()
    expect(syncCall(ASSETS[0])).toBeNull()
  })
})

describe('useUnityConnection', () => {
  it('shares one status check between components', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '6000.5' }) })
    vi.stubGlobal('fetch', fetchMock)
    const qc = new QueryClient()
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children)
    const a = renderHook(() => useUnityConnection(), { wrapper })
    const b = renderHook(() => useUnityConnection(), { wrapper })
    await waitFor(() => expect(a.result.current.status).toBe('connected'))
    expect(b.result.current.status).toBe('connected')
    expect(b.result.current.unityInfo?.version).toBe('6000.5')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:7432/status')
    vi.unstubAllGlobals()
  })

  it('reports disconnected when the bridge is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('refused')))
    const qc = new QueryClient()
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children)
    const { result } = renderHook(() => useUnityConnection(), { wrapper })
    await waitFor(() => expect(result.current.status).toBe('disconnected'))
    vi.unstubAllGlobals()
  })
})

describe('playerSettingsFile', () => {
  it('turns chapter colours into a JsonUtility-friendly list', () => {
    const json = JSON.parse(playerSettingsFile({ look: 'halftone', chapterColors: { '1': '#112233', '2': '#445566' }, textSpeedCps: 60, wordmarkTitle: true, ambience: true, volume: 0.4 }))
    expect(json).toEqual({
      look: 'halftone', textSpeedCps: 60, wordmarkTitle: true, ambience: true, volume: 0.4,
      chapterColors: [{ chapter: '1', color: '#112233' }, { chapter: '2', color: '#445566' }],
    })
    expect(PLAYER_SETTINGS_PATH).toBe('Assets/Resources/GameGold/player_settings.json')
  })
})

describe('runQueue', () => {
  const steps = [1, 2, 3, 4].map((n) => ({ stepNumber: n, completed: n === 2 }))

  it('runs the not-done steps in order and reports progress', async () => {
    const ran: number[] = []
    const progress: string[] = []
    const ok = await runQueue(steps, async (s) => { ran.push(s.stepNumber); return true }, (d, t) => progress.push(`${d}/${t}`))
    expect(ok).toBe(true)
    expect(ran).toEqual([1, 3, 4])
    expect(progress).toEqual(['0/3', '1/3', '2/3', '3/3'])
  })

  it('stops on the first failure', async () => {
    const ran: number[] = []
    const ok = await runQueue(steps, async (s) => { ran.push(s.stepNumber); return s.stepNumber !== 3 })
    expect(ok).toBe(false)
    expect(ran).toEqual([1, 3])
  })
})
