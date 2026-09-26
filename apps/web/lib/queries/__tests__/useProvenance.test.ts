import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }))
vi.mock('@/lib/utils', () => ({ downloadBlob: vi.fn() }))

import { api } from '@/lib/api'
import { downloadBlob } from '@/lib/utils'
import { useExportProvenance } from '@/lib/queries/useDeployment'

describe('useExportProvenance', () => {
  it('downloads AI_DISCLOSURE.md and refreshes the gates', async () => {
    const blob = new Blob(['# disclosure'])
    ;(api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: blob, headers: {} })
    const qc = new QueryClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children)
    const { result } = renderHook(() => useExportProvenance('p1'), { wrapper })

    await act(async () => { await result.current.mutateAsync() })
    expect(api.get).toHaveBeenCalledWith('/projects/p1/export/provenance', { responseType: 'blob' })
    expect(downloadBlob).toHaveBeenCalledWith(blob, 'AI_DISCLOSURE.md')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projects', 'p1', 'gates'] })
  })
})
