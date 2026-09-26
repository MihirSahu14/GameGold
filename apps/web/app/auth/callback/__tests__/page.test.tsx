import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import React from 'react'
import { useAuthStore } from '@/store/authStore'

const mocks = vi.hoisted(() => ({ replace: vi.fn(), exchange: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('@/lib/auth', () => ({ exchangeOAuthCode: mocks.exchange }))

import OAuthCallbackPage from '@/app/auth/callback/page'

const NONCE = 'n0nce-n0nce-n0nce-1234'
const USER = { id: 'u1', email: 'ada@example.com', username: 'ada', plan: 'free', createdAt: '2026-01-01' }

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: null, isLoading: false })
  sessionStorage.setItem('gg_oauth_nonce', NONCE)
  window.history.replaceState({}, '', `/auth/callback?code=abc&nonce=${NONCE}`)
})

describe('OAuth callback page', () => {
  it('exchanges the code once, stores the user, and goes to the dashboard', async () => {
    mocks.exchange.mockResolvedValue(USER)
    render(<OAuthCallbackPage />)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/dashboard'))
    expect(mocks.exchange).toHaveBeenCalledTimes(1)
    expect(mocks.exchange).toHaveBeenCalledWith('abc')
    expect(useAuthStore.getState().user).toEqual(USER)
  })

  it('sends a refused code back to login with an error', async () => {
    mocks.exchange.mockRejectedValue(new Error('400'))
    render(<OAuthCallbackPage />)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login?error=oauth_failed'))
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('treats a missing code as a failure without calling the API', async () => {
    window.history.replaceState({}, '', `/auth/callback?nonce=${NONCE}`)
    render(<OAuthCallbackPage />)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login?error=oauth_failed'))
    expect(mocks.exchange).not.toHaveBeenCalled()
  })

  it.each([
    ['missing from the URL', `/auth/callback?code=abc`],
    ['different from the one this browser started with', `/auth/callback?code=abc&nonce=someone-elses-nonce`],
  ])('rejects a nonce %s without exchanging (login CSRF)', async (_label, url) => {
    window.history.replaceState({}, '', url)
    render(<OAuthCallbackPage />)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login?error=oauth_state'))
    expect(mocks.exchange).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('gg_oauth_nonce')).toBeNull()
  })

  it('rejects when this browser never started a sign-in', async () => {
    sessionStorage.clear()
    render(<OAuthCallbackPage />)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login?error=oauth_state'))
    expect(mocks.exchange).not.toHaveBeenCalled()
  })

  it('clears the stored nonce after a successful sign-in', async () => {
    mocks.exchange.mockResolvedValue(USER)
    render(<OAuthCallbackPage />)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/dashboard'))
    expect(sessionStorage.getItem('gg_oauth_nonce')).toBeNull()
  })

  it('waits for the initial session check so it cannot be overwritten', async () => {
    useAuthStore.setState({ isLoading: true })
    mocks.exchange.mockResolvedValue(USER)
    render(<OAuthCallbackPage />)
    expect(mocks.exchange).not.toHaveBeenCalled()
    act(() => useAuthStore.setState({ isLoading: false }))
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/dashboard'))
  })
})
