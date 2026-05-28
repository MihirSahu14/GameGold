import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { GDD, GDDSections, ConceptCard } from '@gamegold/types'

// ─── Fetch GDD ────────────────────────────────────────────────────────────────
export function useGDD(projectId: string) {
  return useQuery({
    queryKey: ['gdd', projectId],
    queryFn: async () => {
      const res = await api.get<GDD>(`/projects/${projectId}/gdd`)
      return res.data
    },
    enabled: !!projectId,
  })
}

// ─── Generate GDD with Claude ─────────────────────────────────────────────────
export function useGenerateGDD(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (conceptCard: ConceptCard) => {
      const res = await api.post<GDD>(`/projects/${projectId}/gdd/generate`, { conceptCard })
      return res.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['gdd', projectId], data)
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
    },
  })
}
