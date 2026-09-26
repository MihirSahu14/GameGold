'use client'

import { API_URL } from '@/lib/api'

// Per-tab proof that this browser started the sign-in: the backend echoes it on
// the /auth/callback redirect and the callback page compares (login-CSRF guard).
export const OAUTH_NONCE_KEY = 'gg_oauth_nonce'

// Official brand marks (Google "G" and GitHub Invertocat), inline so no asset requests.
const GoogleIcon = () => (
  <svg viewBox="0 0 48 48" className="h-4 w-4 shrink-0" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
)

const GitHubIcon = () => (
  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
)

const PROVIDERS = [
  { id: 'google', label: 'CONTINUE WITH GOOGLE', Icon: GoogleIcon },
  { id: 'github', label: 'CONTINUE WITH GITHUB', Icon: GitHubIcon },
] as const

const OAUTH_ERRORS: Record<string, string> = {
  oauth_state: 'Sign-in session expired or was tampered with. Please try again.',
  oauth_email: 'That account has no verified email address. Verify one with the provider, or sign up with email.',
  oauth_failed: 'Could not complete sign-in with that provider. Please try again.',
  oauth_conflict:
    'That email already belongs to an account linked to a different login with this provider. Sign in with that one instead.',
  oauth_unconfigured: "Google/GitHub sign-in isn't set up yet — use email and password.",
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
          className="flex items-center justify-center gap-3 border border-[#1b2533] bg-[#07090d] p-3 text-center text-[11px] tracking-[1px] text-[#c8d4e2] no-underline transition-colors hover:border-[#4ea8ff] hover:text-[#4ea8ff] [font-family:var(--font-pixel),monospace]"
        >
          <p.Icon />
          {p.label}
        </a>
      ))}
    </div>
  )
}
