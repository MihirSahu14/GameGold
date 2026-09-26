import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'

vi.mock('@/lib/api', () => ({ api: { patch: vi.fn() } }))
vi.mock('../../api', () => ({ api: { patch: vi.fn() } }))

import { api } from '../../api'
import { useUpdateGenre } from '../useProjects'

describe('useUpdateGenre', () => {
  it('PATCHes the genre and writes the project into the cache', async () => {
    const client = new QueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children)
    vi.mocked(api.patch).mockResolvedValue({ data: { _id: 'p1', genre: 'narrative' } })
    const { result } = renderHook(() => useUpdateGenre('p1'), { wrapper })
    result.current.mutate('narrative')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.patch).toHaveBeenCalledWith('/projects/p1', { genre: 'narrative' })
    expect(client.getQueryData(['projects', 'p1'])).toEqual({ _id: 'p1', genre: 'narrative' })
  })
})
