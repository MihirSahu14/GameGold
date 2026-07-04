'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { getMe, fetchCsrfToken } from '@/lib/auth'

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    async function initAuth() {
      // The session lives in an httpOnly cookie, invisible to JS — just ask
      // the backend who we are and treat a 401 as "not authenticated".
      try {
        const user = await getMe()
        setUser(user)
        // Load CSRF token into memory — cross-origin cookies can't be read
        // via document.cookie, so we fetch the token from the backend.
        await fetchCsrfToken()
      } catch {
        setUser(null)
      } finally {
        setLoading(false)
      }
    }
    void initAuth()
  }, [setUser, setLoading])

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
