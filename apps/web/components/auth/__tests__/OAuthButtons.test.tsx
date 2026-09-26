import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { OAuthButtons, oauthErrorMessage } from '@/components/auth/OAuthButtons'
import { API_URL } from '@/lib/api'

describe('OAuthButtons', () => {
  it('links each provider to its backend start route (full-page navigation)', () => {
    render(<OAuthButtons />)
    expect(screen.getByRole('link', { name: /google/i })).toHaveAttribute(
      'href',
      `${API_URL}/auth/oauth/google/start`,
    )
    expect(screen.getByRole('link', { name: /github/i })).toHaveAttribute(
      'href',
      `${API_URL}/auth/oauth/github/start`,
    )
  })
})

describe('oauthErrorMessage', () => {
  it('maps each known error code to a readable message', () => {
    for (const code of ['oauth_state', 'oauth_email', 'oauth_failed', 'oauth_conflict']) {
      const msg = oauthErrorMessage(code)
      expect(msg).toBeTruthy()
      expect(msg).not.toContain(code)
    }
    expect(oauthErrorMessage('oauth_email')).toMatch(/verified email/i)
  })

  it('ignores missing or unknown codes', () => {
    expect(oauthErrorMessage(null)).toBeNull()
    expect(oauthErrorMessage('<script>')).toBeNull()
  })
})
