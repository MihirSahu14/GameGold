import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { Asset, ArtStyle, ScriptType } from '@gamegold/types'

// ─── List all assets for a project ───────────────────────────────────────────
export function useAssets(projectId: string) {
  return useQuery({
    queryKey: ['assets', projectId],
    queryFn: async () => {
      const res = await api.get<Asset[]>(`/projects/${projectId}/assets`)
      return res.data
    },
    enabled: !!projectId,
  })
}

function useGenerateAsset<TPayload>(projectId: string, path: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: TPayload) => {
      const res = await api.post<Asset>(`/projects/${projectId}/assets/${path}`, payload)
      return res.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assets', projectId] })
      // Backend advances stage to 'assets' on first asset — refresh project so sidebar unlocks
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
    },
  })
}

// ─── Generate ─────────────────────────────────────────────────────────────────
export function useGenerateSprite(projectId: string) {
  return useGenerateAsset<{ name: string; description: string; style: ArtStyle }>(
    projectId,
    'sprites',
  )
}

export function useGenerateScript(projectId: string) {
  return useGenerateAsset<{ name: string; scriptType: ScriptType; description: string }>(
    projectId,
    'scripts',
  )
}

export function useGenerateDialogue(projectId: string) {
  return useGenerateAsset<{ npcName: string; personality: string }>(projectId, 'dialogue')
}

// ─── Unity guide progress ─────────────────────────────────────────────────────
export function useUpdateGuide(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ assetId, completed }: { assetId: string; completed: boolean[] }) => {
      const res = await api.patch<Asset>(
        `/projects/${projectId}/assets/${assetId}/guide`,
        { completed },
      )
      return res.data
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Asset[]>(['assets', projectId], (prev) =>
        prev?.map((a) => (a._id === updated._id ? updated : a)),
      )
    },
  })
}

// ─── Delete ───────────────────────────────────────────────────────────────────
export function useDeleteAsset(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (assetId: string) => {
      await api.delete(`/projects/${projectId}/assets/${assetId}`)
      return assetId
    },
    onSuccess: (assetId) => {
      queryClient.setQueryData<Asset[]>(['assets', projectId], (prev) =>
        prev?.filter((a) => a._id !== assetId),
      )
    },
  })
}
