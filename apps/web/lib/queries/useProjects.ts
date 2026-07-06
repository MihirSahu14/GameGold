import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { Project, ConceptCard } from '@gamegold/types'

// ─── Fetch all projects ───────────────────────────────────────────────────────
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await api.get<Project[]>('/projects')
      return res.data
    },
  })
}

// ─── Fetch single project ─────────────────────────────────────────────────────
export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: async () => {
      const res = await api.get<Project>(`/projects/${id}`)
      return res.data
    },
    enabled: !!id,
  })
}

// ─── Create project ───────────────────────────────────────────────────────────
export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: Partial<Project>) => {
      const res = await api.post<Project>('/projects', data)
      return res.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

// ─── Update concept card ──────────────────────────────────────────────────────
export function useUpdateConceptCard(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (conceptCard: ConceptCard) => {
      const res = await api.patch<Project>(`/projects/${projectId}`, { conceptCard })
      return res.data
    },
    onSuccess: (data) => {
      // Immediately write the saved project into the cache so the GDD page
      // sees conceptCard right away instead of waiting for a background refetch.
      queryClient.setQueryData(['projects', projectId], data)
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

// ─── Advance stage to 'unity' (called from Unity Integration page) ───────────
export function useMarkUnityComplete(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.patch<Project>(`/projects/${projectId}`, { stage: 'unity' })
      return res.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['projects', projectId], data)
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

// ─── Delete project ───────────────────────────────────────────────────────────
export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/projects/${id}`)
      return id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
