'use client'

import Link from 'next/link'
import { useToastStore } from '@/store/toastStore'

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismissToast = useToastStore((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className={
            'flex items-center gap-3 rounded-lg px-4 py-2 text-xs shadow-lg ' +
            (toast.kind === 'error'
              ? 'bg-red-950 text-red-200 border border-red-800'
              : 'bg-zinc-800 text-zinc-100 border border-zinc-700')
          }
        >
          <span>{toast.message}</span>
          {toast.href && (
            <Link href={toast.href} className="font-semibold underline">
              Settings →
            </Link>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismissToast(toast.id)}
            className="opacity-60 hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
