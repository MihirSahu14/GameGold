import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), setCsrfToken: vi.fn() }))
vi.mock('@/lib/api', () => ({
  api: { post: mocks.post, get: mocks.get },
  setCsrfToken: mocks.setCsrfToken,
}))

import { exchangeOAuthCode } from '@/lib/auth'

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
