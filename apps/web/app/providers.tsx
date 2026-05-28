'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { getMe, getToken } from '@/lib/auth'

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    async function initAuth() {
      if (!getToken()) {
        setLoading(false)
        return
      }
      try {
        const user = await getMe()
        setUser(user)
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
