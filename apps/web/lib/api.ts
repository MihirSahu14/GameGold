import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
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
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string = error.config?.url ?? ''
    const isAuthCheck = AUTH_401_EXCLUDED.some((p) => url.includes(p))
    if (error.response?.status === 401 && !isAuthCheck && typeof window !== 'undefined') {
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export function apiErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as { response?: { data?: { detail?: string } } } | undefined
  if (!axiosErr) return fallback
  if (axiosErr.response) {
    return axiosErr.response.data?.detail ?? fallback
  }
  return 'Could not reach the server — it may be down, or the request was blocked by CORS. Check the browser console for details.'
}
