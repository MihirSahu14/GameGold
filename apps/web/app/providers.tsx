'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { resolveSession, fetchCsrfToken } from '@/lib/auth'

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading, setOffline } = useAuthStore()

  useEffect(() => {
    async function initAuth() {
      // The session lives in an httpOnly cookie, invisible to JS — ask the backend who we are.
      const user = await resolveSession(setOffline)
      setUser(user)
      setLoading(false)
      // Load CSRF token into memory — cross-origin cookies can't be read
      // via document.cookie, so we fetch the token from the backend.
      if (user) await fetchCsrfToken()
    }
    void initAuth()
  }, [setUser, setLoading, setOffline])

  return <>{children}</>
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
}
