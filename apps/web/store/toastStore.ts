import { create } from 'zustand'

export type ToastKind = 'error' | 'info'

export interface Toast {
  id: string
  message: string
  kind: ToastKind
  /** Optional in-app link shown after the message (e.g. /settings on a 402). */
  href?: string
}

interface ToastState {
  toasts: Toast[]
  pushToast: (message: string, kind: ToastKind, href?: string) => void
  dismissToast: (id: string) => void
}

const AUTO_DISMISS_MS = 6000

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  pushToast: (message, kind, href) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    set((state) => ({ toasts: [...state.toasts, { id, message, kind, href }] }))
    setTimeout(() => get().dismissToast(id), AUTO_DISMISS_MS)
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))
