import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import React from 'react'
import { useAuthStore } from '@/store/authStore'

const mocks = vi.hoisted(() => ({ replace: vi.fn(), exchange: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('@/lib/auth', () => ({ exchangeOAuthCode: mocks.exchange }))

import OAuthCallbackPage from '@/app/auth/callback/page'

const USER = { id: 'u1', email: 'ada@example.com', username: 'ada', plan: 'free', createdAt: '2026-01-01' }

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ user: null, isLoading: false })
  window.history.replaceState({}, '', '/auth/callback?code=abc')
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
    window.history.replaceState({}, '', '/auth/callback')
    render(<OAuthCallbackPage />)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login?error=oauth_failed'))
    expect(mocks.exchange).not.toHaveBeenCalled()
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
