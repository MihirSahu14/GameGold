import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { api } from '@/lib/api'
import { useUpdateCutList } from '@/lib/queries/useProjects'

const mockApi = api as unknown as Record<'get' | 'post' | 'patch', ReturnType<typeof vi.fn>>

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useUpdateCutList', () => {
  it('PATCHes the cut list onto the project', async () => {
    mockApi.patch.mockResolvedValueOnce({ data: { _id: 'p1', cutList: ['Co-op'] } })
    const { result } = renderHook(() => useUpdateCutList('p1'), { wrapper: makeWrapper() })
    await act(async () => { await result.current.mutateAsync(['Co-op']) })
    expect(mockApi.patch).toHaveBeenCalledWith('/projects/p1', { cutList: ['Co-op'] })
  })
})
