'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { logoutUser } from '@/lib/auth'
import { toastError } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useProjectStore } from '@/store/projectStore'
import { useGates, useAdvanceStage } from '@/lib/queries/useGates'
import { STAGES, TOOLS, isStageLocked } from '@/lib/stages'
import { cn } from '@/lib/utils'
import type { ProjectStage } from '@gamegold/types'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Projects', icon: '🗂️' },
]

const mono: React.CSSProperties = { fontFamily: 'var(--font-space-mono), monospace' }
const pixel: React.CSSProperties = { fontFamily: 'var(--font-pixel), monospace' }

function navLinkClass(active: boolean): string {
  return cn(
    'flex items-center border-l-2 py-1.5 pl-7 pr-2.5 text-xs no-underline transition-colors',
    active
      ? 'border-[#4ea8ff] bg-[rgba(78,168,255,0.1)] text-[#eaf2ff]'
      : 'border-transparent text-[#8b97a7] hover:text-[#c8d4e2]',
  )
}

type StageNavProps = { projectId: string; current: ProjectStage; pathname: string }

function StageNav({ projectId, current, pathname }: StageNavProps) {
  const { data: gate } = useGates(projectId)
  const advance = useAdvanceStage(projectId)
  const base = `/projects/${projectId}`

  return (
    <div className="mt-5">
      <p className="mb-1.5 px-2.5 text-[10px] tracking-[2px] text-[#456079]">// STAGES</p>
      {STAGES.map((stage, i) => {
        const locked = isStageLocked(stage.id, current)
        const isCurrent = stage.id === current
        return (
          <div key={stage.id} className="mb-2">
            <div className="flex items-center gap-2 px-2.5 py-1 text-[11px] tracking-[1px]">
              <span
                className={cn(
                  'min-w-4 font-[family-name:var(--font-pixel)] text-[10px]',
                  isCurrent ? 'text-[#4ea8ff]' : 'text-[#456079]',
                )}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className={locked ? 'text-[#456079]' : 'text-[#c8d4e2]'}>{stage.label}</span>
              {locked && <span className="ml-auto text-[10px] text-[#456079]">Soon</span>}
              {isCurrent && gate && (
                <span className="ml-auto text-[10px] text-[#8b97a7]">
                  {gate.total - gate.missing.length} of {gate.total} met
                </span>
              )}
            </div>
            {!locked &&
              stage.links.map((link) => {
                const href = `${base}/${link.route}`
                return (
                  <Link key={link.route} href={href} className={navLinkClass(pathname === href)}>
                    {link.label}
                  </Link>
                )
              })}
            {isCurrent && stage.id !== 'ship' && (
              <button
                type="button"
                onClick={() => advance.mutate(undefined, { onError: (err) => toastError(err, 'Could not advance.') })}
                disabled={!gate?.met || advance.isPending}
                title={gate && !gate.met ? gate.missing.join(' · ') : undefined}
                className="ml-7 mt-1 bg-[#4ea8ff] px-3 py-1.5 text-[11px] font-bold tracking-[1px] text-[#07090d] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {advance.isPending ? 'ADVANCING…' : 'ADVANCE →'}
              </button>
            )}
          </div>
        )
      })}

      <p className="mb-1.5 mt-4 px-2.5 text-[10px] tracking-[2px] text-[#456079]">// TOOLS</p>
      {TOOLS.map((tool) => {
        const href = `${base}/${tool.route}`
        return (
          <Link key={tool.route} href={href} className={navLinkClass(pathname === href)}>
            {tool.label}
          </Link>
        )
      })}
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { user, setUser } = useAuthStore()
  const { activeProject, setActiveProject, setActiveGDD } = useProjectStore()
  const queryClient = useQueryClient()
  const router = useRouter()

  const projectId = activeProject?._id

  async function handleLogout() {
    try {
      await logoutUser()
    } catch { /* server logout failed — clear the local session anyway */ }
    // Drop the previous user's cached data so the next login can't see it.
    queryClient.clear()
    setActiveProject(null)
    setActiveGDD(null)
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

        {projectId && activeProject && (
          <StageNav projectId={projectId} current={activeProject.stage} pathname={pathname} />
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
