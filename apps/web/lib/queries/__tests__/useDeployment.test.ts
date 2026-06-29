/**
 * Tests for useDeployment query hooks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from '@/lib/api'
const mockApi = api as {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

const PROJECT_ID = 'proj123'

const MOCK_STORE_PAGE = {
  _id: 'dep1',
  projectId: PROJECT_ID,
  type: 'storePage',
  createdAt: '2024-01-01T00:00:00Z',
  platform: 'steam',
  title: 'Test Game',
  shortDescription: 'A hook.',
  longDescription: 'A longer description.',
  tags: ['rpg'],
  bullets: ['Deep combat'],
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useDeploymentItems', () => {
  it('fetches deployment items from correct endpoint', async () => {
    const { useDeploymentItems } = await import('@/lib/queries/useDeployment')
    mockApi.get.mockResolvedValueOnce({ data: [MOCK_STORE_PAGE] })

    const { result } = renderHook(() => useDeploymentItems(PROJECT_ID), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi.get).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/deployment`)
    expect(result.current.data).toEqual([MOCK_STORE_PAGE])
  })

  it('is disabled when projectId is empty', async () => {
    const { useDeploymentItems } = await import('@/lib/queries/useDeployment')
    const { result } = renderHook(() => useDeploymentItems(''), { wrapper: makeWrapper() })
    expect(result.current.fetchStatus).toBe('idle')
    expect(mockApi.get).not.toHaveBeenCalled()
  })
})

describe('useGenerateStorePage', () => {
  it('POSTs to the store-page endpoint', async () => {
    const { useGenerateStorePage } = await import('@/lib/queries/useDeployment')
    mockApi.post.mockResolvedValueOnce({ data: MOCK_STORE_PAGE })

    const { result } = renderHook(() => useGenerateStorePage(PROJECT_ID), {
      wrapper: makeWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({ platform: 'steam' })
    })

    expect(mockApi.post).toHaveBeenCalledWith(
      `/projects/${PROJECT_ID}/deployment/store-page`,
      { platform: 'steam' },
    )
  })

  it('invalidates deployment and project caches on success', async () => {
    const { useGenerateStorePage, useDeploymentItems } = await import(
      '@/lib/queries/useDeployment'
    )
    mockApi.get.mockRejectedValueOnce({ response: { status: 404 } })
    mockApi.post.mockResolvedValueOnce({ data: MOCK_STORE_PAGE })

    const wrapper = makeWrapper()
    const generate = renderHook(() => useGenerateStorePage(PROJECT_ID), { wrapper })
    renderHook(() => useDeploymentItems(PROJECT_ID), { wrapper })

    await act(async () => {
      await generate.result.current.mutateAsync({ platform: 'steam' })
    })

    expect(mockApi.get).toHaveBeenCalledTimes(2)
  })
})

describe('useUpdateDeploymentGuide', () => {
  it('PATCHes the guide endpoint', async () => {
    const { useUpdateDeploymentGuide } = await import('@/lib/queries/useDeployment')
    mockApi.patch.mockResolvedValueOnce({ data: { ...MOCK_STORE_PAGE, type: 'buildGuide' } })

    const { result } = renderHook(() => useUpdateDeploymentGuide(PROJECT_ID), {
      wrapper: makeWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync({ itemId: 'dep1', completed: [true] })
    })

    expect(mockApi.patch).toHaveBeenCalledWith(
      `/projects/${PROJECT_ID}/deployment/dep1/guide`,
      { completed: [true] },
    )
  })
})

describe('useDeleteDeploymentItem', () => {
  it('DELETEs the correct endpoint', async () => {
    const { useDeleteDeploymentItem } = await import('@/lib/queries/useDeployment')
    mockApi.delete.mockResolvedValueOnce({})

    const { result } = renderHook(() => useDeleteDeploymentItem(PROJECT_ID), {
      wrapper: makeWrapper(),
    })

    await act(async () => {
      await result.current.mutateAsync('dep1')
    })

    expect(mockApi.delete).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/deployment/dep1`)
  })
})
