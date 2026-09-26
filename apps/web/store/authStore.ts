import { create } from 'zustand'
import type { User } from '@gamegold/types'

interface AuthState {
  user: User | null
  isLoading: boolean
  offline: boolean // server unreachable while checking the session — retrying (gap 38)
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  setOffline: (offline: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  offline: false,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  setOffline: (offline) => set({ offline }),
}))
