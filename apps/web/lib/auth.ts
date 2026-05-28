import { api } from './api'
import type { User, AuthTokens } from '@gamegold/types'

const TOKEN_KEY = 'gg_access_token'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function isAuthenticated(): boolean {
  return !!getToken()
}

export async function loginUser(email: string, password: string): Promise<User> {
  const res = await api.post<AuthTokens & { user: User }>('/auth/login', { email, password })
  setToken(res.data.accessToken)
  return res.data.user
}

export async function registerUser(email: string, username: string, password: string): Promise<User> {
  const res = await api.post<AuthTokens & { user: User }>('/auth/register', {
    email,
    username,
    password,
  })
  setToken(res.data.accessToken)
  return res.data.user
}

export async function logoutUser(): Promise<void> {
  clearToken()
}

export async function getMe(): Promise<User> {
  const res = await api.get<User>('/auth/me')
  return res.data
}
