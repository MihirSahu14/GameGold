'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { logoutUser } from '@/lib/auth'
import { useAuthStore } from '@/store/authStore'
import { useProjectStore } from '@/store/projectStore'
import { useRouter } from 'next/navigation'
import type { ProjectStage } from '@gamegold/types'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Projects', icon: '🗂️' },
]

const STAGE_ITEMS: { href: ProjectStage; label: string; icon: string }[] = [
  { href: 'concept', label: 'Concept', icon: '💡' },
  { href: 'gdd', label: 'GDD', icon: '📋' },
  { href: 'systems', label: 'Systems', icon: '⚙️' },
  { href: 'assets', label: 'Assets', icon: '🎨' },
  { href: 'playtesting', label: 'Playtesting', icon: '🧪' },
  { href: 'deployment', label: 'Deployment', icon: '🚀' },
]

// Stages unlock in order: reaching a stage unlocks all stages up to and including it.
const STAGE_ORDER: ProjectStage[] = [
  'concept', 'gdd', 'systems', 'assets', 'playtesting', 'deployment',
]

function isStageUnlocked(currentStage: ProjectStage | undefined, target: ProjectStage): boolean {
  if (!currentStage) return target === 'concept'
  const current = STAGE_ORDER.indexOf(currentStage)
  const tgt = STAGE_ORDER.indexOf(target)
  return tgt <= current
}

export function Sidebar() {
  const pathname = usePathname()
  const { user, setUser } = useAuthStore()
  const { activeProject } = useProjectStore()
  const router = useRouter()

  const projectId = activeProject?._id
  const projectStage = activeProject?.stage as ProjectStage | undefined

  async function handleLogout() {
    await logoutUser()
    setUser(null)
    router.push('/login')
  }

  return (
    <aside className="w-60 min-h-screen bg-zinc-900 border-r border-zinc-800 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-zinc-800">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-yellow-400 font-bold text-lg">🎮 GameGold</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              pathname === item.href
                ? 'bg-zinc-800 text-zinc-50'
                : 'text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800/60'
            )}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}

        {/* Project stages — only shown inside a project route */}
        {projectId && (
          <div className="mt-4">
            <p className="text-zinc-600 text-xs font-semibold uppercase tracking-wider px-3 mb-2">
              Stages
            </p>
            {STAGE_ITEMS.map((item) => {
              const href = `/projects/${projectId}/${item.href}`
              const active = pathname === href
              const unlocked = isStageUnlocked(projectStage, item.href)

              return (
                <div
                  key={item.href}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    !unlocked
                      ? 'text-zinc-600 cursor-not-allowed'
                      : active
                      ? 'bg-zinc-800 text-zinc-50'
                      : 'text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800/60'
                  )}
                >
                  {!unlocked ? (
                    <>
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                      <span className="ml-auto text-xs bg-zinc-800 text-zinc-600 px-1.5 py-0.5 rounded">
                        Soon
                      </span>
                    </>
                  ) : (
                    <Link href={href} className="flex items-center gap-2.5 w-full">
                      <span>{item.icon}</span>
                      {item.label}
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-zinc-800">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-yellow-400/20 text-yellow-400 text-xs font-bold flex items-center justify-center uppercase">
            {user?.username?.[0] ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-zinc-50 text-sm font-medium truncate">{user?.username}</p>
            <p className="text-zinc-500 text-xs truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors"
            title="Sign out"
          >
            ↩
          </button>
        </div>
      </div>
    </aside>
  )
}
