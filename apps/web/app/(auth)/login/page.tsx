'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { loginUser } from '@/lib/auth'
import { apiErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

const pixel: React.CSSProperties = { fontFamily: 'var(--font-pixel), monospace' }
const mono: React.CSSProperties = { fontFamily: 'var(--font-space-mono), monospace' }

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
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid email or password.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#07090d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        ...mono,
      }}
    >
      {/* Faint grid background */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(78,168,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(78,168,255,0.03) 1px, transparent 1px)',
          backgroundSize: '46px 46px',
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', width: '100%', maxWidth: '380px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              textDecoration: 'none',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                background: '#4ea8ff',
                color: '#07090d',
                ...pixel,
                fontSize: '12px',
              }}
            >
              G
            </span>
            <span style={{ ...pixel, fontSize: '13px', color: '#eaf2ff', letterSpacing: '1px' }}>
              GAMEGOLD
            </span>
          </Link>

          <div style={{ marginTop: '28px' }}>
            <div style={{ fontSize: '11px', letterSpacing: '3px', color: '#4ea8ff', marginBottom: '10px' }}>
              // WELCOME BACK
            </div>
            <h1 style={{ ...pixel, fontSize: '14px', color: '#eaf2ff', margin: 0, lineHeight: 1.5 }}>
              SIGN IN
            </h1>
          </div>
        </div>

        {/* Card */}
        <div
          style={{
            background: '#0b1018',
            border: '1px solid #1b2533',
            padding: '32px',
          }}
        >
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label
                style={{ display: 'block', fontSize: '11px', letterSpacing: '2px', color: '#4a5a6c', marginBottom: '8px' }}
              >
                EMAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                style={{
                  width: '100%',
                  background: '#07090d',
                  border: '1px solid #1b2533',
                  padding: '12px 14px',
                  color: '#c8d4e2',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  ...mono,
                  transition: 'border-color .15s',
                }}
                onFocus={(e) => { e.target.style.borderColor = '#4ea8ff' }}
                onBlur={(e) => { e.target.style.borderColor = '#1b2533' }}
              />
            </div>

            <div>
              <label
                style={{ display: 'block', fontSize: '11px', letterSpacing: '2px', color: '#4a5a6c', marginBottom: '8px' }}
              >
                PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: '100%',
                  background: '#07090d',
                  border: '1px solid #1b2533',
                  padding: '12px 14px',
                  color: '#c8d4e2',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  ...mono,
                  transition: 'border-color .15s',
                }}
                onFocus={(e) => { e.target.style.borderColor = '#4ea8ff' }}
                onBlur={(e) => { e.target.style.borderColor = '#1b2533' }}
              />
            </div>

            {error && (
              <div
                style={{
                  fontSize: '13px',
                  color: '#ff5277',
                  background: 'rgba(255,82,119,0.08)',
                  border: '1px solid rgba(255,82,119,0.25)',
                  padding: '10px 14px',
                  ...mono,
                }}
              >
                &#9888; {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? '#1b2533' : '#4ea8ff',
                color: loading ? '#4a5a6c' : '#07090d',
                border: 'none',
                padding: '14px',
                fontSize: '12px',
                letterSpacing: '1px',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                ...pixel,
                marginTop: '4px',
                transition: 'background .15s, color .15s',
              }}
            >
              {loading ? 'SIGNING IN...' : '▶ SIGN IN'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: '13px', color: '#4a5a6c', marginTop: '20px' }}>
          No account?{' '}
          <Link
            href="/register"
            style={{ color: '#4ea8ff', textDecoration: 'none' }}
          >
            Create one ›
          </Link>
        </p>
      </div>
    </div>
  )
}
