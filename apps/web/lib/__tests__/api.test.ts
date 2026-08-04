/**
 * Tests for the api.ts response interceptor's 429 handling.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useToastStore } from '@/store/toastStore'

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
})

describe('handleResponseError', () => {
  it('turns a 429 with Retry-After into a toast containing the wait', async () => {
    const { handleResponseError } = await import('@/lib/api')

    await expect(
      handleResponseError({
        config: { url: '/projects/1/gdd/generate' },
        response: { status: 429, headers: { 'retry-after': '12' } },
      }),
    ).rejects.toBeDefined()

    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toContain('12')
    expect(toasts[0].kind).toBe('error')
  })

  it('handles a 429 with no Retry-After without throwing', async () => {
    const { handleResponseError } = await import('@/lib/api')

    await expect(
      handleResponseError({
        config: { url: '/projects/1/gdd/generate' },
        response: { status: 429, headers: {} },
      }),
    ).rejects.toBeDefined()

    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('Rate limited. Try again shortly.')
  })

  it('does not push a toast for non-429 errors', async () => {
    const { handleResponseError } = await import('@/lib/api')

    await expect(
      handleResponseError({
        config: { url: '/projects/1/gdd' },
        response: { status: 500, headers: {} },
      }),
    ).rejects.toBeDefined()

    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})
