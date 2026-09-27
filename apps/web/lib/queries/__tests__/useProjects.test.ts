import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { api } from '@/lib/api'
import { useUpdateCutList, usePitchInterview } from '@/lib/queries/useProjects'

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

describe('usePitchInterview', () => {
  it('POSTs the interview request and returns the questions', async () => {
    const interview = { questions: ['Why bees?'], options: [], comparables: [] }
    mockApi.post.mockResolvedValueOnce({ data: interview })
    const { result } = renderHook(() => usePitchInterview('p1'), { wrapper: makeWrapper() })
    let out: unknown
    await act(async () => { out = await result.current.mutateAsync() })
    expect(mockApi.post).toHaveBeenCalledWith('/projects/p1/pitch/interview')
    expect(out).toEqual(interview)
  })
})

describe('useUpdateRisk', () => {
  it('PATCHes the riskiest assumption onto the project', async () => {
    const { useUpdateRisk } = await import('@/lib/queries/useProjects')
    mockApi.patch.mockResolvedValueOnce({ data: { _id: 'p1' } })
    const { result } = renderHook(() => useUpdateRisk('p1'), { wrapper: makeWrapper() })
    await act(async () => {
      await result.current.mutateAsync({ riskiestAssumption: 'feel', riskKind: 'feel' })
    })
    expect(mockApi.patch).toHaveBeenCalledWith('/projects/p1', { riskiestAssumption: 'feel', riskKind: 'feel' })
  })
})
