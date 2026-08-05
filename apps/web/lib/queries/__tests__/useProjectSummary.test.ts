import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
}))

import { api } from '@/lib/api'
const mockApi = api as { get: ReturnType<typeof vi.fn> }

const PROJECT_ID = 'proj123'

function stage(hasContent: boolean, updatedAt: string | null) {
  return { hasContent, updatedAt }
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useProjectSummary', () => {
  it('fetches summary from correct endpoint', async () => {
    const { useProjectSummary } = await import('@/lib/queries/useProjectSummary')
    const summary = {
      gdd: stage(true, '2024-01-02T00:00:00Z'),
      systems: stage(true, '2024-01-01T00:00:00Z'),
      assets: stage(false, null),
      playtest: stage(false, null),
      unity: stage(false, null),
      deployment: stage(false, null),
    }
    mockApi.get.mockResolvedValueOnce({ data: summary })

    const { result } = renderHook(() => useProjectSummary(PROJECT_ID), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockApi.get).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/summary`)
    expect(result.current.data).toEqual(summary)
  })
})

describe('stalenessMessage', () => {
  it('returns a message when the upstream stage is newer than the current stage', async () => {
    const { stalenessMessage } = await import('@/lib/queries/useProjectSummary')
    const summary = {
      gdd: stage(true, '2024-01-02T00:00:00Z'),
      systems: stage(true, '2024-01-01T00:00:00Z'),
      assets: stage(false, null),
      playtest: stage(false, null),
      unity: stage(false, null),
      deployment: stage(false, null),
    }
    expect(stalenessMessage(summary, 'systems')).toMatch(/GDD changed since/)
  })

  it('returns null when the upstream stage has no content', async () => {
    const { stalenessMessage } = await import('@/lib/queries/useProjectSummary')
    const summary = {
      gdd: stage(false, null),
      systems: stage(true, '2024-01-01T00:00:00Z'),
      assets: stage(false, null),
      playtest: stage(false, null),
      unity: stage(false, null),
      deployment: stage(false, null),
    }
    expect(stalenessMessage(summary, 'systems')).toBeNull()
  })

  it('returns null when the upstream stage is older than the current stage', async () => {
    const { stalenessMessage } = await import('@/lib/queries/useProjectSummary')
    const summary = {
      gdd: stage(true, '2024-01-01T00:00:00Z'),
      systems: stage(true, '2024-01-02T00:00:00Z'),
      assets: stage(false, null),
      playtest: stage(false, null),
      unity: stage(false, null),
      deployment: stage(false, null),
    }
    expect(stalenessMessage(summary, 'systems')).toBeNull()
  })

  it('returns null for gdd since it has no upstream stage', async () => {
    const { stalenessMessage } = await import('@/lib/queries/useProjectSummary')
    const summary = {
      gdd: stage(true, '2024-01-01T00:00:00Z'),
      systems: stage(true, '2024-01-02T00:00:00Z'),
      assets: stage(false, null),
      playtest: stage(false, null),
      unity: stage(false, null),
      deployment: stage(false, null),
    }
    expect(stalenessMessage(summary, 'gdd')).toBeNull()
  })
})
