'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { loginUser } from '@/lib/auth'
import { useAuthStore } from '@/store/authStore'

export default function LoginPage() {
  const router = useRouter()
  const { setUser } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const user = await loginUser(email, password)
      setUser(user)
      router.push('/dashboard')
    } catch {
      setError('Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-yellow-400 text-2xl font-bold">🎮 GameGold</span>
          <h1 className="text-zinc-50 text-2xl font-semibold mt-4">Welcome back</h1>
          <p className="text-zinc-400 text-sm mt-1">Sign in to continue building</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-zinc-400 text-sm mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-50 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/60 transition-colors"
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-sm mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-50 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/60 transition-colors"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 px-4 py-2 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-yellow-400 text-zinc-950 font-semibold py-3 rounded-lg text-sm hover:bg-yellow-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-1"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-zinc-500 text-sm mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-yellow-400 hover:text-yellow-300 transition-colors">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
