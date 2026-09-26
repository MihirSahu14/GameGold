import { api, setCsrfToken } from './api'
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
