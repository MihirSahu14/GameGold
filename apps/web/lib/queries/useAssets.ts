import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { Asset, AssetProposal, ArtStyle, ScriptType } from '@gamegold/types'

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

/** Optional regeneration fields accepted by all three generate endpoints */
export type RegenerateFields = { regenerateOf?: string; note?: string }

function useGenerateAsset<TPayload extends RegenerateFields>(projectId: string, path: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: TPayload) => {
      const res = await api.post<Asset>(`/projects/${projectId}/assets/${path}`, payload)
      return res.data
    },
    onSuccess: (asset, variables) => {
      if (variables.regenerateOf) {
        // Regeneration keeps the same _id — replace the asset in place
        queryClient.setQueryData<Asset[]>(['assets', projectId], (prev) =>
          prev?.map((a) => (a._id === asset._id ? asset : a)),
        )
      } else {
        void queryClient.invalidateQueries({ queryKey: ['assets', projectId] })
        // Backend advances stage to 'assets' on first asset — refresh project so sidebar unlocks
        void queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
      }
    },
  })
}

// ─── Generate ─────────────────────────────────────────────────────────────────
export function useGenerateSprite(projectId: string) {
  return useGenerateAsset<
    { name: string; description: string; style: ArtStyle } & RegenerateFields
  >(projectId, 'sprites')
}

export function useGenerateScript(projectId: string) {
  return useGenerateAsset<
    { name: string; scriptType: ScriptType; description: string } & RegenerateFields
  >(projectId, 'scripts')
}

export function useGenerateDialogue(projectId: string) {
  return useGenerateAsset<{ npcName: string; personality: string } & RegenerateFields>(
    projectId,
    'dialogue',
  )
}

// ─── Suggest from GDD ─────────────────────────────────────────────────────────
export function useSuggestAssets(projectId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ proposals: AssetProposal[] }>(
        `/projects/${projectId}/assets/suggest`,
      )
      return res.data.proposals
    },
  })
}

// ─── Approve ──────────────────────────────────────────────────────────────────
export function useApproveAsset(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ assetId, approved }: { assetId: string; approved: boolean }) => {
      const res = await api.patch<Asset>(`/projects/${projectId}/assets/${assetId}`, { approved })
      return res.data
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Asset[]>(['assets', projectId], (prev) =>
        prev?.map((a) => (a._id === updated._id ? updated : a)),
      )
    },
  })
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
