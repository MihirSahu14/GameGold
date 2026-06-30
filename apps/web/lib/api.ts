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

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

// Auth lives in an httpOnly session cookie (sent automatically). Mutating
// requests must also echo the readable CSRF cookie back as a header — the
// backend's double-submit check rejects them otherwise.
api.interceptors.request.use((config) => {
  const method = config.method?.toLowerCase()
  if (method && !SAFE_METHODS.has(method)) {
    const csrfToken = getCookie(CSRF_COOKIE)
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken
    }
  }
  return config
})

// Handle 401 — session expired or missing, redirect to login.
// Exclude /auth/me because a 401 there means "not logged in" (expected),
// not "session expired" — AuthProvider handles that case via setUser(null).
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthCheck = error.config?.url?.includes('/auth/me')
    if (error.response?.status === 401 && !isAuthCheck && typeof window !== 'undefined') {
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Distinguishes a real backend error (has a response + detail) from a
// network/CORS-level failure (no response at all) — the latter looks
// identical to "request failed" otherwise and is easy to misread as a
// validation error.
export function apiErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as { response?: { data?: { detail?: string } } } | undefined
  if (!axiosErr) return fallback
  if (axiosErr.response) {
    return axiosErr.response.data?.detail ?? fallback
  }
  return 'Could not reach the server — it may be down, or the request was blocked by CORS. Check the browser console for details.'
}
