import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { Asset, AssetProposal, ArtStyle, AssetKind, BatchSpriteItem, BatchSpriteResult, ScriptType } from '@gamegold/types'

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
        // Regenerating resets placeholder/replaced/disclosed — the ship gate can flip.
        void queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'gates'] })
      } else {
        void queryClient.invalidateQueries({ queryKey: ['assets', projectId] })
        // Backend advances stage to 'assets' on first asset — refresh project so sidebar unlocks
        void queryClient.invalidateQueries({ queryKey: ['projects', projectId] })
        // A new asset can open/close the ship gate's placeholder check.
        void queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'gates'] })
      }
    },
  })
}

// ─── Generate ─────────────────────────────────────────────────────────────────
export function useGenerateSprite(projectId: string) {
  return useGenerateAsset<
    { name: string; description: string; style: ArtStyle; kind?: AssetKind } & RegenerateFields
  >(projectId, 'sprites')
}

export function useGenerateSpriteBatch(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (items: BatchSpriteItem[]) => {
      const res = await api.post<BatchSpriteResult>(`/projects/${projectId}/assets/sprites/batch`, { items })
      return res.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assets', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'gates'] })
    },
  })
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

// ─── Approve / provenance flags ──────────────────────────────────────────────
type AssetFlags = Partial<Pick<Asset, 'approved' | 'replaced' | 'disclosed'>>

export function useApproveAsset(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ assetId, ...flags }: { assetId: string } & AssetFlags) => {
      const res = await api.patch<Asset>(`/projects/${projectId}/assets/${assetId}`, flags)
      return res.data
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Asset[]>(['assets', projectId], (prev) =>
        prev?.map((a) => (a._id === updated._id ? updated : a)),
      )
      // replaced/disclosed feed the ship gate
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'gates'] })
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
      // Removing an open placeholder (or the last asset) can flip the ship gate.
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'gates'] })
    },
  })
}
