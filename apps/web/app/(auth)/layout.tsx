'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (user) {
      router.replace('/dashboard')
    }
  }, [user, router])

  // Render the form immediately — the session check can take 30s+ on a
  // Render cold start, and blanking the page for it left visitors staring
  // at a black screen. Logged-in users may glimpse the form before the
  // redirect; that's the cheaper trade.
  if (user) return null

  return <>{children}</>
}
