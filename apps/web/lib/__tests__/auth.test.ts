import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), setCsrfToken: vi.fn(), refreshSession: vi.fn() }))
vi.mock('@/lib/api', () => ({
  api: { post: mocks.post, get: mocks.get },
  setCsrfToken: mocks.setCsrfToken,
  refreshSession: mocks.refreshSession,
}))

import { exchangeOAuthCode, resolveSession } from '@/lib/auth'

beforeEach(() => vi.clearAllMocks())

describe('exchangeOAuthCode', () => {
  it('redeems the one-time code, then loads the CSRF token like password login', async () => {
    const user = { id: 'u1', email: 'ada@example.com', username: 'ada' }
    mocks.post.mockResolvedValue({ data: user })
    mocks.get.mockResolvedValue({ data: { csrf_token: 'csrf-1' } })

    await expect(exchangeOAuthCode('abc')).resolves.toEqual(user)
    expect(mocks.post).toHaveBeenCalledWith('/auth/oauth/exchange', { code: 'abc' })
    expect(mocks.get).toHaveBeenCalledWith('/auth/csrf')
    expect(mocks.setCsrfToken).toHaveBeenCalledWith('csrf-1')
  })

  it('rejects when the code is refused', async () => {
    mocks.post.mockRejectedValue(new Error('400'))
    await expect(exchangeOAuthCode('bad')).rejects.toThrow()
    expect(mocks.get).not.toHaveBeenCalled()
  })
})

describe('resolveSession (gap 38)', () => {
  const user = { id: 'u1', email: 'ada@example.com', username: 'ada' }
  const httpErr = (status: number) => Object.assign(new Error(String(status)), { response: { status } })
  const netErr = () => new Error('Network Error') // axios: no response
  const wait = vi.fn(async () => {})

  it('returns the user when /auth/me works', async () => {
    mocks.get.mockResolvedValueOnce({ data: user })
    await expect(resolveSession(vi.fn(), wait)).resolves.toEqual(user)
  })

  it('retries (with growing backoff) on network errors and 5xx instead of logging out', async () => {
    const onRetrying = vi.fn()
    mocks.get.mockRejectedValueOnce(netErr()).mockRejectedValueOnce(httpErr(502)).mockResolvedValueOnce({ data: user })
    await expect(resolveSession(onRetrying, wait)).resolves.toEqual(user)
    expect(onRetrying).toHaveBeenCalledWith(true)
    expect(onRetrying).toHaveBeenLastCalledWith(false)
    expect(wait).toHaveBeenCalledTimes(2)
    const [a, b] = wait.mock.calls.map((c) => (c as unknown[])[0] as number)
    expect(b).toBeGreaterThan(a)
  })

  it('refreshes on 401 and retries /auth/me', async () => {
    mocks.get.mockRejectedValueOnce(httpErr(401)).mockResolvedValueOnce({ data: user })
    mocks.refreshSession.mockResolvedValueOnce(undefined)
    await expect(resolveSession(vi.fn(), wait)).resolves.toEqual(user)
  })

  it('logs out (null) only on a 401 whose refresh fails', async () => {
    mocks.get.mockRejectedValueOnce(httpErr(401))
    mocks.refreshSession.mockRejectedValueOnce(httpErr(401))
    await expect(resolveSession(vi.fn(), wait)).resolves.toBeNull()
  })

  it('a refresh that cannot reach the server is retried, not a logout', async () => {
    mocks.get.mockRejectedValueOnce(httpErr(401)).mockResolvedValueOnce({ data: user })
    mocks.refreshSession.mockRejectedValueOnce(netErr())
    await expect(resolveSession(vi.fn(), wait)).resolves.toEqual(user)
  })
})
