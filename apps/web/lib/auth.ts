import { api } from './api'
import type { User } from '@gamegold/types'

export async function loginUser(email: string, password: string): Promise<User> {
  const res = await api.post<User>('/auth/login', { email, password })
  return res.data
}

export async function registerUser(email: string, username: string, password: string): Promise<User> {
  const res = await api.post<User>('/auth/register', { email, username, password })
  return res.data
}

export async function logoutUser(): Promise<void> {
  await api.post('/auth/logout')
}

export async function getMe(): Promise<User> {
  const res = await api.get<User>('/auth/me')
  return res.data
}
