'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/dashboard')
    }
  }, [user, isLoading, router])

  // Show nothing while the session check is in flight — prevents a flash of
  // the login form for users who are already authenticated.
  if (isLoading) return null

  // Redirect is queued — render nothing to avoid a brief login-form flash.
  if (user) return null

  return <>{children}</>
}
