import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { GameSystem, BalanceAnalysis, SystemNode, SystemEdge } from '@gamegold/types'

export function useGameSystem(projectId: string) {
  return useQuery({
    queryKey: ['systems', projectId],
    queryFn: async () => {
      const res = await api.get<GameSystem>(`/projects/${projectId}/systems`)
      return res.data
    },
    enabled: !!projectId,
    retry: false,
  })
}

export function useSaveSystem(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { nodes: SystemNode[]; edges: SystemEdge[] }) => {
      const res = await api.post<GameSystem>(`/projects/${projectId}/systems/save`, data)
      return res.data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['systems', projectId], data)
    },
  })
}

export function useAnalyzeBalance(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { nodes: SystemNode[]; edges: SystemEdge[] }) => {
      const res = await api.post<BalanceAnalysis>(`/projects/${projectId}/systems/analyze`, data)
      return res.data
    },
    onSuccess: (analysis) => {
      queryClient.setQueryData(['balance', projectId], analysis)
    },
  })
}
