import axios from 'axios'
import { useToastStore } from '@/store/toastStore'

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const CSRF_COOKIE = 'gg_csrf'
const SAFE_METHODS = new Set(['get', 'head', 'options'])

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

// In-memory CSRF token store. The gg_csrf cookie is set by the backend domain
// (Render) and cannot be read via document.cookie on the frontend domain
// (Vercel) — cross-origin cookies are domain-scoped. We fetch the token once
// via GET /auth/csrf (which the backend can read) and keep it here.
let _csrfToken: string | null = null

export function setCsrfToken(token: string | null): void {
  _csrfToken = token
}

async function loadCsrfToken(): Promise<string | null> {
  try {
    const res = await axios.get<{ csrf_token: string }>(`${API_URL}/auth/csrf`, { withCredentials: true })
    _csrfToken = res.data.csrf_token
  } catch {
    _csrfToken = null
  }
  return _csrfToken ?? getCookie(CSRF_COOKIE)
}

// One refresh at a time: the backend revokes the refresh jti on use, so two
// parallel refreshes would make the second one 401 and log the user out.
let _refreshPromise: Promise<void> | null = null

export function refreshSession(): Promise<void> {
  if (!_refreshPromise) {
    _refreshPromise = (async () => {
      // /auth/refresh is CSRF-checked (the gg_refresh cookie counts as a session).
      const csrf = _csrfToken ?? getCookie(CSRF_COOKIE) ?? (await loadCsrfToken())
      await axios.post(`${API_URL}/auth/refresh`, null, {
        withCredentials: true,
        headers: csrf ? { 'X-CSRF-Token': csrf } : {},
      })
      // Refresh rotates gg_csrf — pick up the new value before retrying anything.
      await loadCsrfToken()
    })().finally(() => {
      _refreshPromise = null
    })
  }
  return _refreshPromise
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

// Auth lives in an httpOnly session cookie (sent automatically). Mutating
// requests must also echo the readable CSRF token as a header.
// Use the in-memory token first (works cross-origin); fall back to document.cookie
// for same-origin local dev where the cookie IS readable.
api.interceptors.request.use((config) => {
  const method = config.method?.toLowerCase()
  if (method && !SAFE_METHODS.has(method)) {
    const csrfToken = _csrfToken ?? getCookie(CSRF_COOKIE)
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken
    }
  }
  return config
})

// Handle 401 — session expired or missing, redirect to login.
// Exclude auth endpoints where a 401 is an expected outcome the caller handles
// inline (bad credentials, not logged in) — redirecting would reload the login
// page and wipe the error message.
const AUTH_401_EXCLUDED = ['/auth/me', '/auth/login', '/auth/register', '/auth/csrf']

export async function handleResponseError(error: {
  config?: { url?: string; [key: string]: unknown }
  response?: { status?: number; headers?: Record<string, string> }
}) {
  if (error.response?.status === 429) {
    const retryAfter = Number(error.response.headers?.['retry-after'])
    const message =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? `Rate limited. Try again in ${retryAfter}s.`
        : 'Rate limited. Try again shortly.'
    useToastStore.getState().pushToast(message, 'error')
  }

  const url: string = error.config?.url ?? ''
  const isAuthCheck = AUTH_401_EXCLUDED.some((p) => url.includes(p))
  const isRefreshCall = url.includes('/auth/refresh')
  if (error.response?.status === 401 && !isAuthCheck && !isRefreshCall) {
    // Retry once only — a request that 401s right after a good refresh must not loop.
    if (error.config && !error.config._retried) {
      try {
        await refreshSession()
        const retry: typeof error.config = { ...error.config, _retried: true }
        return api.request(retry)
      } catch {
        // refresh failed — fall through to redirect below
      }
    }
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }
  return Promise.reject(error)
}

api.interceptors.response.use((response) => response, handleResponseError)

export function apiErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as { response?: { data?: { detail?: string } } } | undefined
  if (!axiosErr) return fallback
  if (axiosErr.response) {
    return axiosErr.response.data?.detail ?? fallback
  }
  return 'Could not reach the server — it may be down, or the request was blocked by CORS. Check the browser console for details.'
}

/** Show a failed request as an error toast. */
export function toastError(err: unknown, fallback: string): void {
  // 429s were already toasted by the response interceptor.
  if ((err as { response?: { status?: number } } | undefined)?.response?.status === 429) return
  useToastStore.getState().pushToast(apiErrorMessage(err, fallback), 'error')
}
