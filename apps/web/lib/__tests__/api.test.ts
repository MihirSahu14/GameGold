/**
 * Tests for the api.ts response interceptor's 429 and 401 handling.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import axios from 'axios'
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

  it('retries the original request after a successful /auth/refresh', async () => {
    const { handleResponseError, api } = await import('@/lib/api')
    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({ status: 200, data: {} })
    const requestSpy = vi.spyOn(api, 'request').mockResolvedValue({ data: 'ok' })

    const config = { url: '/projects/1/gdd', method: 'get' }
    const result = await handleResponseError({
      config,
      response: { status: 401, headers: {} },
    })

    expect(postSpy).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      null,
      expect.objectContaining({ withCredentials: true }),
    )
    expect(requestSpy).toHaveBeenCalledWith(config)
    expect(result).toEqual({ data: 'ok' })

    postSpy.mockRestore()
    requestSpy.mockRestore()
  })

  it('redirects to /login when /auth/refresh also fails', async () => {
    const { handleResponseError } = await import('@/lib/api')
    const postSpy = vi.spyOn(axios, 'post').mockRejectedValue(new Error('refresh failed'))
    // @ts-expect-error jsdom allows reassigning location for this test
    delete window.location
    // @ts-expect-error minimal stub, only .href is used by the interceptor
    window.location = { href: '' }

    await expect(
      handleResponseError({
        config: { url: '/projects/1/gdd', method: 'get' },
        response: { status: 401, headers: {} },
      }),
    ).rejects.toBeDefined()

    expect(window.location.href).toBe('/login')

    postSpy.mockRestore()
  })
})
