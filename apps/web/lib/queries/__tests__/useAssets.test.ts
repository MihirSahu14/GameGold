/**
 * Tests for the GDD-driven asset hooks: suggest, approve, regenerate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { Asset } from '@gamegold/types'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from '@/lib/api'
const mockApi = api as unknown as {
  post: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

const PROJECT_ID = 'proj123'

const SCRIPT_ASSET: Asset = {
  _id: 'asset1',
  projectId: PROJECT_ID,
  type: 'script',
  name: 'PlayerController',
  description: 'movement',
  approved: false,
  unityGuide: { steps: ['Attach to Player'], completed: [false] },
  createdAt: '2024-01-01T00:00:00Z',
  code: 'public class PlayerController {}',
  scriptType: 'PlayerController2D',
}

function makeSetup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { qc, wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useSuggestAssets', () => {
  it('POSTs to the suggest endpoint and returns the proposals array', async () => {
    const { useSuggestAssets } = await import('@/lib/queries/useAssets')
    const proposals = [
      { type: 'sprite', name: 'Knight_Idle', description: 'idle knight', reason: 'main character' },
    ]
    mockApi.post.mockResolvedValueOnce({ data: { proposals } })
    const { wrapper } = makeSetup()

    const { result } = renderHook(() => useSuggestAssets(PROJECT_ID), { wrapper })
    let returned: unknown
    await act(async () => {
      returned = await result.current.mutateAsync()
    })

    expect(mockApi.post).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/assets/suggest`)
    expect(returned).toEqual(proposals)
  })
})

describe('useApproveAsset', () => {
  it('PATCHes approved and replaces the asset in the cache by _id', async () => {
    const { useApproveAsset } = await import('@/lib/queries/useAssets')
    const approved = { ...SCRIPT_ASSET, approved: true }
    mockApi.patch.mockResolvedValueOnce({ data: approved })
    const { qc, wrapper } = makeSetup()
    qc.setQueryData(['assets', PROJECT_ID], [SCRIPT_ASSET])

    const { result } = renderHook(() => useApproveAsset(PROJECT_ID), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ assetId: 'asset1', approved: true })
    })

    expect(mockApi.patch).toHaveBeenCalledWith(
      `/projects/${PROJECT_ID}/assets/asset1`,
      { approved: true },
    )
    expect(qc.getQueryData(['assets', PROJECT_ID])).toEqual([approved])
  })
})

describe('generate hooks with regenerateOf', () => {
  it('replaces the matching asset in the cache instead of appending', async () => {
    const { useGenerateScript } = await import('@/lib/queries/useAssets')
    const regenerated = { ...SCRIPT_ASSET, code: 'public class PlayerController { /* v2 */ }' }
    mockApi.post.mockResolvedValueOnce({ data: regenerated })
    const { qc, wrapper } = makeSetup()
    const other: Asset = { ...SCRIPT_ASSET, _id: 'asset2', name: 'EnemyAI' }
    qc.setQueryData(['assets', PROJECT_ID], [SCRIPT_ASSET, other])
    const invalidate = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useGenerateScript(PROJECT_ID), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        name: 'PlayerController',
        scriptType: 'PlayerController2D',
        description: 'movement',
        regenerateOf: 'asset1',
        note: 'add coyote time',
      })
    })

    expect(mockApi.post).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/assets/scripts`, {
      name: 'PlayerController',
      scriptType: 'PlayerController2D',
      description: 'movement',
      regenerateOf: 'asset1',
      note: 'add coyote time',
    })
    expect(qc.getQueryData(['assets', PROJECT_ID])).toEqual([regenerated, other])
    // Regenerating resets placeholder/replaced/disclosed, so gates (not the assets list) refresh.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projects', PROJECT_ID, 'gates'] })
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['assets', PROJECT_ID] })
  })

  it('invalidates the assets list on a plain (non-regenerate) generate', async () => {
    const { useGenerateScript } = await import('@/lib/queries/useAssets')
    mockApi.post.mockResolvedValueOnce({ data: SCRIPT_ASSET })
    const { qc, wrapper } = makeSetup()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useGenerateScript(PROJECT_ID), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        name: 'PlayerController',
        scriptType: 'PlayerController2D',
        description: 'movement',
      })
    })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['assets', PROJECT_ID] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projects', PROJECT_ID, 'gates'] })
  })

  it('invalidates gates when a regenerate resets placeholder/replaced/disclosed', async () => {
    const { useGenerateScript } = await import('@/lib/queries/useAssets')
    mockApi.post.mockResolvedValueOnce({ data: { ...SCRIPT_ASSET, placeholder: true } })
    const { qc, wrapper } = makeSetup()
    qc.setQueryData(['assets', PROJECT_ID], [SCRIPT_ASSET])
    const invalidate = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useGenerateScript(PROJECT_ID), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        name: 'PlayerController',
        scriptType: 'PlayerController2D',
        description: 'movement',
        regenerateOf: 'asset1',
      })
    })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projects', PROJECT_ID, 'gates'] })
  })
})

describe('useGenerateSprite', () => {
  it('POSTs the kind field along with the sprite payload', async () => {
    const { useGenerateSprite } = await import('@/lib/queries/useAssets')
    const SPRITE_ASSET: Asset = {
      ...SCRIPT_ASSET,
      _id: 'asset3',
      type: 'sprite',
      code: undefined,
      scriptType: undefined,
      url: 'data:image/svg+xml;base64,abc',
      style: 'illustrated',
      kind: 'background',
    }
    mockApi.post.mockResolvedValueOnce({ data: SPRITE_ASSET })
    const { wrapper } = makeSetup()

    const { result } = renderHook(() => useGenerateSprite(PROJECT_ID), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        name: 'Forest',
        description: 'a lush forest',
        style: 'illustrated',
        kind: 'background',
      })
    })

    expect(mockApi.post).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/assets/sprites`, {
      name: 'Forest',
      description: 'a lush forest',
      style: 'illustrated',
      kind: 'background',
    })
  })
})

describe('useDeleteAsset', () => {
  it('invalidates gates after deleting an asset', async () => {
    const { useDeleteAsset } = await import('@/lib/queries/useAssets')
    mockApi.delete.mockResolvedValueOnce({})
    const { qc, wrapper } = makeSetup()
    qc.setQueryData(['assets', PROJECT_ID], [SCRIPT_ASSET])
    const invalidate = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteAsset(PROJECT_ID), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('asset1')
    })

    expect(qc.getQueryData(['assets', PROJECT_ID])).toEqual([])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projects', PROJECT_ID, 'gates'] })
  })
})
