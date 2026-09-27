'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { Sidebar } from '@/components/layout/Sidebar'
import { Toaster } from '@/components/layout/Toaster'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, offline } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login')
    }
  }, [user, isLoading, router])

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: '#07090d', fontFamily: 'var(--font-space-mono), monospace' }}
      >
        <div role="status" style={{ color: offline ? '#eab308' : '#4ea8ff', fontSize: '12px', letterSpacing: '2px' }}>
          {offline ? 'Can’t reach the server — retrying…' : 'LOADING...'}
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="flex min-h-screen" style={{ background: '#07090d' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
      <Toaster />
    </div>
  )
}
