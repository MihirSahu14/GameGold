import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { GateCheck, GateStatus, Project, PrototypeDecision } from '@gamegold/types'

export function useGates(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'gates'],
    queryFn: async () => {
      const res = await api.get<GateStatus>(`/projects/${projectId}/gates`)
      return res.data
    },
    enabled: !!projectId,
  })
}

// Every stage-flow call returns the updated project: cache it, then refresh
// the project list + gates + summary (all under the ['projects'] prefix).
function useProjectMutation<TVars>(projectId: string, send: (vars: TVars) => Promise<Project>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: send,
    onSuccess: (data) => {
      queryClient.setQueryData(['projects', projectId], data)
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useAdvanceStage(projectId: string) {
  return useProjectMutation<void>(projectId, async () => {
    const res = await api.post<Project>(`/projects/${projectId}/advance`)
    return res.data
  })
}

export function usePrototypeDecision(projectId: string) {
  return useProjectMutation<PrototypeDecision>(projectId, async (decision) => {
    const res = await api.post<Project>(`/projects/${projectId}/decision`, { decision })
    return res.data
  })
}

export function useSetGateCheck(projectId: string) {
  return useProjectMutation<{ key: GateCheck; value: boolean }>(projectId, async (body) => {
    const res = await api.put<Project>(`/projects/${projectId}/checks`, body)
    return res.data
  })
}
