import { API_URL } from '@/lib/api'

const PROVIDERS = [
  { id: 'google', label: 'CONTINUE WITH GOOGLE' },
  { id: 'github', label: 'CONTINUE WITH GITHUB' },
] as const

const OAUTH_ERRORS: Record<string, string> = {
  oauth_state: 'Sign-in session expired or was tampered with. Please try again.',
  oauth_email: 'That account has no verified email address. Verify one with the provider, or sign up with email.',
  oauth_failed: 'Could not complete sign-in with that provider. Please try again.',
}

export function oauthErrorMessage(code: string | null): string | null {
  return (code && Object.hasOwn(OAUTH_ERRORS, code) && OAUTH_ERRORS[code]) || null
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
          className="block border border-[#1b2533] bg-[#07090d] p-3 text-center text-[11px] tracking-[1px] text-[#c8d4e2] no-underline transition-colors hover:border-[#4ea8ff] hover:text-[#4ea8ff] [font-family:var(--font-pixel),monospace]"
        >
          {p.label}
        </a>
      ))}
    </div>
  )
}
