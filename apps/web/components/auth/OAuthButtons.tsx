'use client'

import { API_URL } from '@/lib/api'

// Per-tab proof that this browser started the sign-in: the backend echoes it on
// the /auth/callback redirect and the callback page compares (login-CSRF guard).
export const OAUTH_NONCE_KEY = 'gg_oauth_nonce'

const PROVIDERS = [
  { id: 'google', label: 'CONTINUE WITH GOOGLE' },
  { id: 'github', label: 'CONTINUE WITH GITHUB' },
] as const

const OAUTH_ERRORS: Record<string, string> = {
  oauth_state: 'Sign-in session expired or was tampered with. Please try again.',
  oauth_email: 'That account has no verified email address. Verify one with the provider, or sign up with email.',
  oauth_failed: 'Could not complete sign-in with that provider. Please try again.',
  oauth_conflict:
    'That email already belongs to an account linked to a different login with this provider. Sign in with that one instead.',
}

export function oauthErrorMessage(code: string | null): string | null {
  return (code && Object.hasOwn(OAUTH_ERRORS, code) && OAUTH_ERRORS[code]) || null
}

function startWithNonce(e: React.MouseEvent<HTMLAnchorElement>, provider: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  try {
    sessionStorage.setItem(OAUTH_NONCE_KEY, nonce)
  } catch {
    // Storage blocked: the callback page will reject with oauth_state — fail closed.
  }
  // Rewritten before the default navigation runs, so the click follows the new href.
  e.currentTarget.href = `${API_URL}/auth/oauth/${provider}/start?nonce=${nonce}`
}

// Plain anchors, not fetch: the OAuth dance needs full-page navigation.
export function OAuthButtons() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-[11px] tracking-[2px] text-[#3a4757]">
        <span className="h-px flex-1 bg-[#1b2533]" />
        OR
        <span className="h-px flex-1 bg-[#1b2533]" />
      </div>
      {PROVIDERS.map((p) => (
        <a
          key={p.id}
          href={`${API_URL}/auth/oauth/${p.id}/start`}
          onClick={(e) => startWithNonce(e, p.id)}
          className="block border border-[#1b2533] bg-[#07090d] p-3 text-center text-[11px] tracking-[1px] text-[#c8d4e2] no-underline transition-colors hover:border-[#4ea8ff] hover:text-[#4ea8ff] [font-family:var(--font-pixel),monospace]"
        >
          {p.label}
        </a>
      ))}
    </div>
  )
}
