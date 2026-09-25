import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { api } from '@/lib/api'
import { useLogSession, useSynthesizeSessions } from '@/lib/queries/usePlaytest'

const mockApi = api as unknown as Record<'post', ReturnType<typeof vi.fn>>

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('session hooks', () => {
  it('POSTs a human session', async () => {
    const payload = { testers: 4, ring: 'discord' as const, keptPlayingUnprompted: 2, notes: 'x' }
    mockApi.post.mockResolvedValueOnce({ data: { _id: 's1', kind: 'session', ...payload } })
    const { result } = renderHook(() => useLogSession('p1'), { wrapper: makeWrapper() })
    await act(async () => { await result.current.mutateAsync(payload) })
    expect(mockApi.post).toHaveBeenCalledWith('/projects/p1/playtest/sessions', payload)
  })

  it('POSTs a synthesis request and returns the summary text', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { summary: '- dash is hidden' } })
    const { result } = renderHook(() => useSynthesizeSessions('p1'), { wrapper: makeWrapper() })
    let summary = ''
    await act(async () => { summary = await result.current.mutateAsync() })
    expect(mockApi.post).toHaveBeenCalledWith('/projects/p1/playtest/sessions/synthesize')
    expect(summary).toBe('- dash is hidden')
  })
})
