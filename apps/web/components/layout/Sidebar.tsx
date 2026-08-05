'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logoutUser } from '@/lib/auth'
import { useAuthStore } from '@/store/authStore'
import { useProjectStore } from '@/store/projectStore'
import { useRouter } from 'next/navigation'
import type { ProjectStage } from '@gamegold/types'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Projects', icon: '🗂️' },
]

const STAGE_ITEMS: { href: ProjectStage; label: string; icon: string }[] = [
  { href: 'concept',     label: 'Concept',          icon: '💡' },
  { href: 'gdd',         label: 'GDD',               icon: '📋' },
  { href: 'systems',     label: 'Systems',           icon: '⚙️' },
  { href: 'assets',      label: 'Assets',            icon: '🎨' },
  { href: 'unity',       label: 'Unity Integration', icon: '🎮' },
  { href: 'playtesting', label: 'Playtesting',       icon: '🧪' },
  { href: 'deployment',  label: 'Deployment',        icon: '🚀' },
]

const mono: React.CSSProperties = { fontFamily: 'var(--font-space-mono), monospace' }
const pixel: React.CSSProperties = { fontFamily: 'var(--font-pixel), monospace' }

export function Sidebar() {
  const pathname = usePathname()
  const { user, setUser } = useAuthStore()
  const { activeProject } = useProjectStore()
  const router = useRouter()

  const projectId = activeProject?._id

  async function handleLogout() {
    try {
      await logoutUser()
    } catch { /* server logout failed — clear the local session anyway */ }
    setUser(null)
    router.push('/login')
  }

  return (
    <aside
      style={{
        width: '224px',
        minWidth: '224px',
        minHeight: '100vh',
        background: '#0b1018',
        borderRight: '1px solid #1b2533',
        display: 'flex',
        flexDirection: 'column',
        ...mono,
      }}
    >
      {/* Logo */}
      <div style={{ padding: '18px 16px', borderBottom: '1px solid #1b2533' }}>
        <Link href="/dashboard" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '26px',
              height: '26px',
              background: '#4ea8ff',
              color: '#07090d',
              ...pixel,
              fontSize: '10px',
              flexShrink: 0,
            }}
          >
            G
          </span>
          <span style={{ ...pixel, fontSize: '11px', color: '#eaf2ff', letterSpacing: '0.5px' }}>
            GameGold
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 10px',
                fontSize: '12px',
                textDecoration: 'none',
                color: active ? '#eaf2ff' : '#8b97a7',
                background: active ? 'rgba(78,168,255,0.1)' : 'transparent',
                borderLeft: active ? '2px solid #4ea8ff' : '2px solid transparent',
                transition: 'color 0.15s, background 0.15s',
                letterSpacing: '0.5px',
              }}
            >
              <span style={{ fontSize: '14px' }}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}

        {/* Project stages */}
        {projectId && (
          <div style={{ marginTop: '20px' }}>
            <p
              style={{
                fontSize: '10px',
                color: '#456079',
                letterSpacing: '2px',
                padding: '0 10px',
                marginBottom: '6px',
              }}
            >
              // STAGES
            </p>
            {STAGE_ITEMS.map((item, i) => {
              const href = `/projects/${projectId}/${item.href}`
              const active = pathname === href
              const stageNum = String(i + 1).padStart(2, '0')

              return (
                <Link
                  key={item.href}
                  href={href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    fontSize: '12px',
                    textDecoration: 'none',
                    color: active ? '#eaf2ff' : '#8b97a7',
                    background: active ? 'rgba(78,168,255,0.1)' : 'transparent',
                    borderLeft: active ? '2px solid #4ea8ff' : '2px solid transparent',
                    transition: 'color 0.15s, background 0.15s',
                  }}
                >
                  <span style={{ fontSize: '10px', color: active ? '#4ea8ff' : '#456079', ...pixel, minWidth: '16px' }}>{stageNum}</span>
                  <span style={{ fontSize: '13px' }}>{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </div>
        )}
      </nav>

      {/* User */}
      <div style={{ padding: '12px 8px', borderTop: '1px solid #1b2533' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px' }}>
          <div
            style={{
              width: '26px',
              height: '26px',
              background: 'rgba(78,168,255,0.12)',
              border: '1px solid #1b2533',
              color: '#4ea8ff',
              fontSize: '11px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textTransform: 'uppercase',
              flexShrink: 0,
            }}
          >
            {user?.username?.[0] ?? '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: '#c8d4e2', fontSize: '12px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.username}
            </p>
            <p style={{ color: '#456079', fontSize: '11px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.email}
            </p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            style={{
              background: 'none',
              border: 'none',
              color: '#456079',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '2px 4px',
              transition: 'color 0.15s',
            }}
          >
            ↩
          </button>
        </div>
      </div>
    </aside>
  )
}
