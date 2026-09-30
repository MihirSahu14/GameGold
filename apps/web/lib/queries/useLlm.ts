import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { LlmConfig, LlmConfigUpdate } from '@gamegold/types'

const KEY = ['me', 'llm']

// ─── Current model + key status (and today's trial budget) ───────────────────
export function useLlmConfig() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const res = await api.get<LlmConfig>('/me/llm')
      return res.data
    },
  })
}

// ─── Save own key (server makes one test call first) ─────────────────────────
export function useSaveLlmConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: LlmConfigUpdate) => {
      const res = await api.put<LlmConfig>('/me/llm', data)
      return res.data
    },
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
  })
}

// ─── Remove own key → back to the free trial ─────────────────────────────────
export function useClearLlmConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.delete<LlmConfig>('/me/llm')
      return res.data
    },
    onSuccess: (data) => queryClient.setQueryData(KEY, data),
  })
}
