import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

import { api } from '@/lib/api'
import { useGates, useAdvanceStage, usePrototypeDecision, useSetGateCheck } from '@/lib/queries/useGates'

const mockApi = api as unknown as Record<'get' | 'post' | 'put', ReturnType<typeof vi.fn>>
const PROJECT = { _id: 'p1', stage: 'prototype' }

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useGates', () => {
  it('GETs the gate status for the project', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { stage: 'pitch', met: false, missing: ['Write your hook'], total: 4 } })
    const { result } = renderHook(() => useGates('p1'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi.get).toHaveBeenCalledWith('/projects/p1/gates')
    expect(result.current.data?.missing).toEqual(['Write your hook'])
  })
})

describe('stage mutations', () => {
  it('POSTs /advance', async () => {
    mockApi.post.mockResolvedValueOnce({ data: PROJECT })
    const { result } = renderHook(() => useAdvanceStage('p1'), { wrapper: makeWrapper() })
    await act(async () => { await result.current.mutateAsync() })
    expect(mockApi.post).toHaveBeenCalledWith('/projects/p1/advance')
  })

  it('POSTs the prototype decision', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { ...PROJECT, stage: 'killed' } })
    const { result } = renderHook(() => usePrototypeDecision('p1'), { wrapper: makeWrapper() })
    await act(async () => { await result.current.mutateAsync('kill') })
    expect(mockApi.post).toHaveBeenCalledWith('/projects/p1/decision', { decision: 'kill' })
  })

  it('PUTs a manual gate check', async () => {
    mockApi.put.mockResolvedValueOnce({ data: PROJECT })
    const { result } = renderHook(() => useSetGateCheck('p1'), { wrapper: makeWrapper() })
    await act(async () => { await result.current.mutateAsync({ key: 'alpha_feature_lock', value: true }) })
    expect(mockApi.put).toHaveBeenCalledWith('/projects/p1/checks', { key: 'alpha_feature_lock', value: true })
  })
})
