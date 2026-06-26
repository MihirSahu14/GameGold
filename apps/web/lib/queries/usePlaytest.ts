import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { PlaytestReport, PlaytestPersona, Bug, BugSeverity, BugStatus } from '@gamegold/types'

// ─── Playtest reports ─────────────────────────────────────────────────────────

export function usePlaytestReports(projectId: string) {
  return useQuery({
    queryKey: ['playtests', projectId],
    queryFn: async () => {
      const res = await api.get<PlaytestReport[]>(`/projects/${projectId}/playtest`)
      return res.data
    },
    enabled: !!projectId,
  })
}

export function useRunPlaytest(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (persona: PlaytestPersona) => {
      const res = await api.post<PlaytestReport>(`/projects/${projectId}/playtest/run`, {
        persona,
      })
      return res.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['playtests', projectId] })
      // Backend advances stage to 'playtesting' on first run — refresh project so sidebar unlocks
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
    },
  })
}

export function useDeleteReport(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (reportId: string) => {
      await api.delete(`/projects/${projectId}/playtest/${reportId}`)
      return reportId
    },
    onSuccess: (reportId) => {
      queryClient.setQueryData<PlaytestReport[]>(['playtests', projectId], (prev) =>
        prev?.filter((r) => r._id !== reportId),
      )
    },
  })
}

// ─── Bug tracker ──────────────────────────────────────────────────────────────

export function useBugs(projectId: string) {
  return useQuery({
    queryKey: ['bugs', projectId],
    queryFn: async () => {
      const res = await api.get<Bug[]>(`/projects/${projectId}/bugs`)
      return res.data
    },
    enabled: !!projectId,
  })
}

export function useCreateBug(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      title: string
      description?: string
      severity?: BugSeverity
      gddSection?: string
    }) => {
      const res = await api.post<Bug>(`/projects/${projectId}/bugs`, payload)
      return res.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bugs', projectId] })
    },
  })
}

export function useUpdateBug(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      bugId,
      ...payload
    }: {
      bugId: string
      status?: BugStatus
      severity?: BugSeverity
      title?: string
      description?: string
    }) => {
      const res = await api.patch<Bug>(`/projects/${projectId}/bugs/${bugId}`, payload)
      return res.data
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Bug[]>(['bugs', projectId], (prev) =>
        prev?.map((b) => (b._id === updated._id ? updated : b)),
      )
    },
  })
}

export function useDeleteBug(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (bugId: string) => {
      await api.delete(`/projects/${projectId}/bugs/${bugId}`)
      return bugId
    },
    onSuccess: (bugId) => {
      queryClient.setQueryData<Bug[]>(['bugs', projectId], (prev) =>
        prev?.filter((b) => b._id !== bugId),
      )
    },
  })
}
