'use client'

// Outside the (auth) route group on purpose: that layout bounces signed-in users
// to /dashboard, which would race this page's own redirect.
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { exchangeOAuthCode } from '@/lib/auth'
import { OAUTH_NONCE_KEY } from '@/components/auth/OAuthButtons'
import { useAuthStore } from '@/store/authStore'

export default function OAuthCallbackPage() {
  const router = useRouter()
  const { setUser, isLoading } = useAuthStore()
  const started = useRef(false) // the code is single-use; StrictMode runs effects twice

  useEffect(() => {
    // Wait for the app's initial session check to settle, or its "signed out"
    // result could land after ours and bounce the dashboard back to /login.
    if (isLoading || started.current) return
    started.current = true
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    // Only redeem a code for a sign-in this tab started — otherwise an attacker could
    // log the victim into the attacker's account with a link (login CSRF).
    let expected: string | null = null
    try {
      expected = sessionStorage.getItem(OAUTH_NONCE_KEY)
      sessionStorage.removeItem(OAUTH_NONCE_KEY)
    } catch {
      // storage blocked → expected stays null → rejected below
    }
    const nonce = params.get('nonce')
    if (!nonce || nonce !== expected) {
      router.replace('/login?error=oauth_state')
      return
    }
    void (async () => {
      try {
        if (!code) throw new Error('missing code')
        setUser(await exchangeOAuthCode(code))
        router.replace('/dashboard')
      } catch {
        router.replace('/login?error=oauth_failed')
      }
    })()
  }, [isLoading, setUser, router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07090d] text-[12px] tracking-[2px] text-[#4ea8ff] [font-family:var(--font-space-mono),monospace]">
      SIGNING IN...
    </div>
  )
}
