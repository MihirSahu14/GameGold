import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { Project, ProjectCreate, ConceptCard, PitchInterview, RiskKind } from '@gamegold/types'

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
    mutationFn: async (data: ProjectCreate) => {
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

// ─── Update cut list ──────────────────────────────────────────────────────────
export function useUpdateCutList(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (cutList: string[]) => {
      const res = await api.patch<Project>(`/projects/${projectId}`, { cutList })
      return res.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['projects', projectId], data)
    },
  })
}

// ─── Riskiest assumption (Prototype entry) ───────────────────────────────────
export function useUpdateRisk(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (risk: { riskiestAssumption: string; riskKind: RiskKind | null }) => {
      const res = await api.patch<Project>(`/projects/${projectId}`, risk)
      return res.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['projects', projectId], data)
    },
  })
}

// ─── Pitch interview (asks; never writes the pitch) ──────────────────────────
export function usePitchInterview(projectId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<PitchInterview>(`/projects/${projectId}/pitch/interview`)
      return res.data
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
