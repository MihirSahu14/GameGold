import { api, setCsrfToken, refreshSession } from './api'
import type { User } from '@gamegold/types'

export async function fetchCsrfToken(): Promise<void> {
  try {
    const res = await api.get<{ csrf_token: string }>('/auth/csrf')
    setCsrfToken(res.data.csrf_token)
  } catch {
    // Not logged in or network error — no-op; CSRF will be missing but
    // unauthenticated requests don't need it (middleware only checks when
    // a session cookie is present).
  }
}

export async function loginUser(email: string, password: string): Promise<User> {
  const res = await api.post<User>('/auth/login', { email, password })
  await fetchCsrfToken()
  return res.data
}

// The backend OAuth callback hands us a one-time code instead of cookies: setting
// them via this XHR puts them in the same (possibly partitioned) jar every later
// API call reads from.
export async function exchangeOAuthCode(code: string): Promise<User> {
  const res = await api.post<User>('/auth/oauth/exchange', { code })
  await fetchCsrfToken()
  return res.data
}

export async function registerUser(email: string, username: string, password: string): Promise<User> {
  const res = await api.post<User>('/auth/register', { email, username, password })
  await fetchCsrfToken()
  return res.data
}

export async function logoutUser(): Promise<void> {
  await api.post('/auth/logout')
  setCsrfToken(null)
}

export async function getMe(): Promise<User> {
  const res = await api.get<User>('/auth/me')
  return res.data
}

const httpStatus = (err: unknown) => (err as { response?: { status?: number } } | undefined)?.response?.status

// Who is logged in: the user, or null only when the server really says no (401 and the refresh
// fails). Network errors / 5xx (e.g. a backend restart) retry with backoff instead of logging out.
export async function resolveSession(
  onRetrying: (retrying: boolean) => void,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<User | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      let user: User
      try {
        user = await getMe()
      } catch (err) {
        if (httpStatus(err) !== 401) throw err
        // Access token expired (15 min) but the refresh cookie may still be good.
        await refreshSession()
        user = await getMe()
      }
      if (attempt > 0) onRetrying(false)
      return user
    } catch (err) {
      const status = httpStatus(err)
      if (status !== undefined && status < 500) return null
      onRetrying(true)
      await wait(Math.min(1000 * 2 ** attempt, 15000))
    }
  }
}
