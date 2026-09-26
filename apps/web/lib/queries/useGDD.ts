import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { GDD, GDDSections, GDDGenerateResult, ConceptCard } from '@gamegold/types'

// ─── Fetch GDD ────────────────────────────────────────────────────────────────
export function useGDD(projectId: string) {
  return useQuery({
    queryKey: ['gdd', projectId],
    queryFn: async () => {
      try {
        const res = await api.get<GDD>(`/projects/${projectId}/gdd`)
        return res.data
      } catch (err: unknown) {
        const e = err as { response?: { status?: number } }
        if (e?.response?.status === 404) return null
        throw err
      }
    },
    enabled: !!projectId,
  })
}

// ─── Generate GDD with Claude ─────────────────────────────────────────────────
export function useGenerateGDD(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { conceptCard: ConceptCard; answers?: Record<string, string> }) => {
      const res = await api.post<GDDGenerateResult>(`/projects/${projectId}/gdd/generate`, payload)
      return res.data
    },
    onSuccess: (data) => {
      // Interview mode: needsInfo means no GDD was generated — leave caches untouched
      if ('needsInfo' in data) return
      queryClient.setQueryData(['gdd', projectId], data)
      // Backend advances project stage to 'gdd' on first generation — refresh project so sidebar unlocks
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
    },
  })
}

// ─── Refine a single section with AI ──────────────────────────────────────────
export function useRefineGDDSection(projectId: string) {
  return useMutation({
    mutationFn: async (payload: { section: string; currentContent: string; instructions: string }) => {
      const res = await api.post<{ section: string; content: string }>(
        `/projects/${projectId}/gdd/refine`,
        payload,
      )
      return res.data
    },
  })
}

// ─── Save GDD edits ───────────────────────────────────────────────────────────
export function useSaveGDD(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (sections: Partial<GDDSections>) => {
      const res = await api.patch<GDD>(`/projects/${projectId}/gdd`, { sections })
      return res.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['gdd', projectId], data)
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'summary'] })
    },
  })
}
