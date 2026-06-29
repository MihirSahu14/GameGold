import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { DeploymentItem, StorePlatform, BuildPlatform } from '@gamegold/types'

// ─── List all deployment items for a project ────────────────────────────────
export function useDeploymentItems(projectId: string) {
  return useQuery({
    queryKey: ['deployment', projectId],
    queryFn: async () => {
      const res = await api.get<DeploymentItem[]>(`/projects/${projectId}/deployment`)
      return res.data
    },
    enabled: !!projectId,
  })
}

function useGenerateDeploymentItem<TPayload>(projectId: string, path: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: TPayload) => {
      const res = await api.post<DeploymentItem>(`/projects/${projectId}/deployment/${path}`, payload)
      return res.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['deployment', projectId] })
      // Backend advances stage to 'deployment' on first item — refresh project so sidebar unlocks
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
    },
  })
}

// ─── Generate ─────────────────────────────────────────────────────────────────
export function useGenerateStorePage(projectId: string) {
  return useGenerateDeploymentItem<{ platform: StorePlatform }>(projectId, 'store-page')
}

export function useGeneratePressKit(projectId: string) {
  return useGenerateDeploymentItem<Record<string, never>>(projectId, 'press-kit')
}

export function useGenerateBuildGuide(projectId: string) {
  return useGenerateDeploymentItem<{ platform: BuildPlatform }>(projectId, 'build-guide')
}

// ─── Unity guide progress ─────────────────────────────────────────────────────
export function useUpdateDeploymentGuide(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, completed }: { itemId: string; completed: boolean[] }) => {
      const res = await api.patch<DeploymentItem>(
        `/projects/${projectId}/deployment/${itemId}/guide`,
        { completed },
      )
      return res.data
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<DeploymentItem[]>(['deployment', projectId], (prev) =>
        prev?.map((item) => (item._id === updated._id ? updated : item)),
      )
    },
  })
}

// ─── Delete ───────────────────────────────────────────────────────────────────
export function useDeleteDeploymentItem(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (itemId: string) => {
      await api.delete(`/projects/${projectId}/deployment/${itemId}`)
      return itemId
    },
    onSuccess: (itemId) => {
      queryClient.setQueryData<DeploymentItem[]>(['deployment', projectId], (prev) =>
        prev?.filter((item) => item._id !== itemId),
      )
    },
  })
}

// ─── Export bundle ────────────────────────────────────────────────────────────
export function useExportBundle(projectId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await api.get(`/projects/${projectId}/export`, { responseType: 'blob' })
      const disposition = res.headers['content-disposition'] as string | undefined
      const match = disposition?.match(/filename="(.+)"/)
      const filename = match?.[1] ?? 'game_bundle.zip'

      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    },
  })
}
