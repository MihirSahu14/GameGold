import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { OAuthButtons, oauthErrorMessage, OAUTH_NONCE_KEY } from '@/components/auth/OAuthButtons'
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

describe('OAuthButtons nonce', () => {
  it('on click, stores a fresh random nonce and sends it to the start route', () => {
    sessionStorage.clear()
    render(<OAuthButtons />)
    const link = screen.getByRole('link', { name: /github/i })
    link.addEventListener('click', (e) => e.preventDefault()) // jsdom can't navigate
    fireEvent.click(link)

    const nonce = sessionStorage.getItem(OAUTH_NONCE_KEY)
    expect(nonce).toMatch(/^[0-9a-f]{32}$/)
    expect(link).toHaveAttribute('href', `${API_URL}/auth/oauth/github/start?nonce=${nonce}`)

    fireEvent.click(link)
    expect(sessionStorage.getItem(OAUTH_NONCE_KEY)).not.toBe(nonce)
  })

  it('still navigates when sessionStorage is blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<OAuthButtons />)
    const link = screen.getByRole('link', { name: /google/i })
    link.addEventListener('click', (e) => e.preventDefault())
    expect(() => fireEvent.click(link)).not.toThrow()
    expect(link.getAttribute('href')).toMatch(/\/auth\/oauth\/google\/start\?nonce=[0-9a-f]{32}$/)
    spy.mockRestore()
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
