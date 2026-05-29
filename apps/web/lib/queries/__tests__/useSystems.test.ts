/**
 * Tests for useSystems query hooks.
 * All tests fail until apps/web/lib/queries/useSystems.ts is implemented.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// Mock the API module — no real HTTP calls in unit tests
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import { api } from '@/lib/api'
const mockApi = api as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> }

const PROJECT_ID = 'proj123'

const MOCK_SYSTEM = {
  _id: 'sys1',
  projectId: PROJECT_ID,
  nodes: [{ id: 'n1', type: 'entity', label: 'Player', data: {}, position: { x: 0, y: 0 } }],
  edges: [],
  analysisCache: null,
  updatedAt: '2024-01-01T00:00:00Z',
}

const MOCK_ANALYSIS = {
  exploits: ['infinite gold loop'],
  powerCreep: [],
  dominantStrategies: ['rush sword'],
  suggestions: ['cap gold drop rate'],
  analyzedAt: '2024-01-01T00:00:00Z',
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── useGameSystem ────────────────────────────────────────────────────────────

describe('useGameSystem', () => {
  it('fetches system from correct endpoint', async () => {
    const { useGameSystem } = await import('@/lib/queries/useSystems')
    mockApi.get.mockResolvedValueOnce({ data: MOCK_SYSTEM })

    const { result } = renderHook(() => useGameSystem(PROJECT_ID), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi.get).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/systems`)
    expect(result.current.data).toEqual(MOCK_SYSTEM)
  })

  it('is disabled when projectId is empty', async () => {
    const { useGameSystem } = await import('@/lib/queries/useSystems')

    const { result } = renderHook(() => useGameSystem(''), { wrapper: makeWrapper() })

    expect(result.current.fetchStatus).toBe('idle')
    expect(mockApi.get).not.toHaveBeenCalled()
  })

  it('returns undefined data on 404 without crashing', async () => {
    const { useGameSystem } = await import('@/lib/queries/useSystems')
    mockApi.get.mockRejectedValueOnce({ response: { status: 404 } })

    const { result } = renderHook(() => useGameSystem(PROJECT_ID), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})

// ─── useSaveSystem ────────────────────────────────────────────────────────────

describe('useSaveSystem', () => {
  it('POSTs nodes and edges to correct endpoint', async () => {
    const { useSaveSystem } = await import('@/lib/queries/useSystems')
    mockApi.post.mockResolvedValueOnce({ data: MOCK_SYSTEM })

    const { result } = renderHook(() => useSaveSystem(PROJECT_ID), { wrapper: makeWrapper() })

    await act(async () => {
      await result.current.mutateAsync({ nodes: MOCK_SYSTEM.nodes, edges: [] })
    })

    expect(mockApi.post).toHaveBeenCalledWith(
      `/projects/${PROJECT_ID}/systems/save`,
      { nodes: MOCK_SYSTEM.nodes, edges: [] }
    )
  })

  it('updates query cache on success', async () => {
    const { useSaveSystem, useGameSystem } = await import('@/lib/queries/useSystems')
    // Keep get silent so it doesn't interfere with cache-set check
    mockApi.get.mockRejectedValueOnce({ response: { status: 404 } })
    mockApi.post.mockResolvedValueOnce({ data: MOCK_SYSTEM })

    const wrapper = makeWrapper()
    const save = renderHook(() => useSaveSystem(PROJECT_ID), { wrapper })
    const get = renderHook(() => useGameSystem(PROJECT_ID), { wrapper })

    await act(async () => {
      await save.result.current.mutateAsync({ nodes: MOCK_SYSTEM.nodes, edges: [] })
    })

    await waitFor(() => expect(get.result.current.data).toEqual(MOCK_SYSTEM))
  })
})

// ─── useAnalyzeBalance ────────────────────────────────────────────────────────

describe('useAnalyzeBalance', () => {
  it('POSTs to analyze endpoint', async () => {
    const { useAnalyzeBalance } = await import('@/lib/queries/useSystems')
    mockApi.post.mockResolvedValueOnce({ data: MOCK_ANALYSIS })

    const { result } = renderHook(() => useAnalyzeBalance(PROJECT_ID), { wrapper: makeWrapper() })

    await act(async () => {
      await result.current.mutateAsync({ nodes: MOCK_SYSTEM.nodes, edges: [] })
    })

    expect(mockApi.post).toHaveBeenCalledWith(
      `/projects/${PROJECT_ID}/systems/analyze`,
      { nodes: MOCK_SYSTEM.nodes, edges: [] }
    )
  })

  it('returns analysis data on success', async () => {
    const { useAnalyzeBalance } = await import('@/lib/queries/useSystems')
    mockApi.post.mockResolvedValueOnce({ data: MOCK_ANALYSIS })

    const { result } = renderHook(() => useAnalyzeBalance(PROJECT_ID), { wrapper: makeWrapper() })

    let returned: typeof MOCK_ANALYSIS | undefined
    await act(async () => {
      returned = await result.current.mutateAsync({ nodes: MOCK_SYSTEM.nodes, edges: [] })
    })

    expect(returned).toEqual(MOCK_ANALYSIS)
  })
})
