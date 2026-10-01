import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { Asset, Kit } from '@gamegold/types'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }))

import { api } from '@/lib/api'
import { KitDataImportPanel, KitDataJson } from '@/components/assets/KitDataJson'

const GRID: Kit = {
  id: 'grid', title: 'Grid', runtimeClass: 'GridPlayer', runtimePath: 'Assets/Scripts/GridPlayer.cs', objectName: 'GameGold Grid',
  dataKind: 'levels', dataPath: 'Assets/Resources/GameGold/levels.json', settingsPath: null, genres: ['puzzle'], available: true, missing: [],
}
const DATA = { levels: [{ rows: ['#@$.#'] }] }
const ASSET = {
  _id: 'd1', projectId: 'p1', type: 'data', name: 'Dockside', kind: 'levels', data: DATA, description: '',
  approved: false, placeholder: false, replaced: false, disclosed: false, unityGuide: { steps: [], completed: [] }, createdAt: '2026-01-01',
} as Asset

function renderWith(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
})
afterEach(() => vi.unstubAllGlobals())

describe('KitDataImportPanel', () => {
  it('starts from the kit sample and imports with the kit data kind', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: DATA })
    vi.mocked(api.post).mockResolvedValueOnce({ data: ASSET })
    renderWith(<KitDataImportPanel projectId="p1" kit={GRID} />)
    fireEvent.click(await screen.findByText('Start from sample'))
    expect(api.get).toHaveBeenCalledWith('/unity/kits/grid/sample')
    fireEvent.change(screen.getByLabelText('Data name'), { target: { value: 'Dockside' } })
    fireEvent.click(screen.getByText('Import'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/projects/p1/assets/data/import', { name: 'Dockside', kind: 'levels', data: DATA }))
  })

  it('rejects non-object JSON inline without calling the API', () => {
    renderWith(<KitDataImportPanel projectId="p1" kit={{ ...GRID, available: false }} />)
    fireEvent.change(screen.getByLabelText('Data name'), { target: { value: 'D' } })
    fireEvent.change(screen.getByLabelText('Data JSON'), { target: { value: '[1, 2]' } })
    fireEvent.click(screen.getByText('Import'))
    expect(screen.getByRole('alert').textContent).toMatch(/object/)
    expect(api.post).not.toHaveBeenCalled()
  })
})

describe('KitDataJson', () => {
  it('shows the kit validator errors from a 422 on Save', async () => {
    vi.mocked(api.put).mockRejectedValueOnce({ response: { status: 422, data: { detail: ['level 1: no player', 'level 1: unsolvable'] } } })
    renderWith(<KitDataJson projectId="p1" asset={ASSET} kit={GRID} />)
    const area = screen.getByLabelText('Dockside JSON') as HTMLTextAreaElement
    expect(JSON.parse(area.value)).toEqual(DATA)
    fireEvent.change(area, { target: { value: '{"levels": []}' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('unsolvable'))
    expect(api.put).toHaveBeenCalledWith('/projects/p1/assets/d1/data', { levels: [] })
  })

  it('syncs the saved JSON to the kit data path', async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.endsWith('/status') ? { projectName: 'Dockside' } : { success: true, message: 'Wrote' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    vi.mocked(api.post).mockResolvedValue({ data: {} })
    renderWith(<KitDataJson projectId="p1" asset={ASSET} kit={GRID} unityProjectName="Dockside" />)
    const sync = screen.getByRole('button', { name: /sync to unity/i })
    await waitFor(() => expect(sync).toBeEnabled())
    fireEvent.click(sync)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('http://localhost:7432/tool/asset.createText', expect.anything()))
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/tool/'))!
    const body = JSON.parse((call as unknown as [string, { body: string }])[1].body)
    expect(body.path).toBe(GRID.dataPath)
    expect(JSON.parse(body.content)).toEqual(DATA)
    expect(await screen.findByText(/Synced to/)).toBeInTheDocument()
  })

  it('cannot sync unsaved edits or data the kit does not play', () => {
    const { unmount } = renderWith(<KitDataJson projectId="p1" asset={ASSET} kit={{ ...GRID, dataKind: 'arena' }} />)
    expect(screen.getByText(/doesn.t play levels data/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sync to unity/i })).toBeDisabled()
    unmount()
    renderWith(<KitDataJson projectId="p1" asset={ASSET} kit={GRID} />)
    fireEvent.change(screen.getByLabelText('Dockside JSON'), { target: { value: '{}' } })
    expect(screen.getByRole('button', { name: /sync to unity/i })).toHaveAttribute('title', expect.stringMatching(/Save first/))
  })
})
