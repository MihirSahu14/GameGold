/**
 * Tests for useGenerateGDD interview-mode union handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

import { api } from '@/lib/api'
const mockApi = api as unknown as { post: ReturnType<typeof vi.fn> }

const PROJECT_ID = 'proj123'

import type { ConceptCard } from '@gamegold/types'

const CONCEPT_CARD: ConceptCard = {
  title: 'Gravity Runner',
  tagline: 'flip the world',
  genre: 'platformer',
  platform: 'pc',
  tone: 'lighthearted',
  coreLoop: 'jump',
  uniqueHook: 'gravity flips',
  targetAudience: 'casual',
  estimatedScope: 'jam',
}

const MOCK_GDD = {
  _id: 'gdd1',
  projectId: PROJECT_ID,
  sections: {
    overview: 'o', mechanics: 'm', progression: 'p', levels: 'l',
    characters: 'c', ui: 'u', audio: 'a', visual: 'v',
  },
  version: 1,
  updatedAt: '2024-01-01T00:00:00Z',
}

const NEEDS_INFO = { needsInfo: true, questions: ['What is the win condition?', 'How long is a run?'] }

function makeSetup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { qc, wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useGenerateGDD', () => {
  it('POSTs conceptCard and optional answers to generate endpoint', async () => {
    const { useGenerateGDD } = await import('@/lib/queries/useGDD')
    mockApi.post.mockResolvedValueOnce({ data: MOCK_GDD })
    const { wrapper } = makeSetup()

    const { result } = renderHook(() => useGenerateGDD(PROJECT_ID), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ conceptCard: CONCEPT_CARD, answers: { q: 'a' } })
    })

    expect(mockApi.post).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/gdd/generate`, {
      conceptCard: CONCEPT_CARD,
      answers: { q: 'a' },
    })
  })

  it('updates the gdd cache and invalidates project on a real GDD result', async () => {
    const { useGenerateGDD } = await import('@/lib/queries/useGDD')
    mockApi.post.mockResolvedValueOnce({ data: MOCK_GDD })
    const { qc, wrapper } = makeSetup()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useGenerateGDD(PROJECT_ID), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ conceptCard: CONCEPT_CARD })
    })

    expect(qc.getQueryData(['gdd', PROJECT_ID])).toEqual(MOCK_GDD)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projects', PROJECT_ID] })
  })

  it('does not clobber the gdd cache on a needsInfo result', async () => {
    const { useGenerateGDD } = await import('@/lib/queries/useGDD')
    mockApi.post.mockResolvedValueOnce({ data: NEEDS_INFO })
    const { qc, wrapper } = makeSetup()
    qc.setQueryData(['gdd', PROJECT_ID], MOCK_GDD)
    const invalidate = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useGenerateGDD(PROJECT_ID), { wrapper })
    let returned: unknown
    await act(async () => {
      returned = await result.current.mutateAsync({ conceptCard: CONCEPT_CARD })
    })

    expect(returned).toEqual(NEEDS_INFO)
    expect(qc.getQueryData(['gdd', PROJECT_ID])).toEqual(MOCK_GDD)
    expect(invalidate).not.toHaveBeenCalled()
  })
})
