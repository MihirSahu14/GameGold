'use client'

import { useState } from 'react'
import type { Bug, BugSeverity, BugStatus } from '@gamegold/types'
import { useBugs, useCreateBug, useUpdateBug, useDeleteBug } from '@/lib/queries/usePlaytest'
import { cn } from '@/lib/utils'

const SEVERITIES: { value: BugSeverity; label: string; badge: string }[] = [
  { value: 'low', label: 'Low', badge: 'bg-zinc-800 text-zinc-400' },
  { value: 'medium', label: 'Medium', badge: 'bg-yellow-900/40 text-yellow-400' },
  { value: 'high', label: 'High', badge: 'bg-orange-900/40 text-orange-400' },
  { value: 'critical', label: 'Critical', badge: 'bg-red-900/40 text-red-400' },
]

const STATUSES: { value: BugStatus; label: string }[] = [
  { value: 'open', label: '🔴 Open' },
  { value: 'in-progress', label: '🟡 In Progress' },
  { value: 'fixed', label: '🟢 Fixed' },
  { value: 'wontfix', label: "⚪ Won't Fix" },
]

const GDD_SECTIONS = [
  'overview', 'mechanics', 'progression', 'levels', 'characters', 'ui', 'audio', 'visual',
]

export function BugTracker({ projectId }: { projectId: string }) {
  const { data: bugs, isLoading } = useBugs(projectId)
  const createBug = useCreateBug(projectId)
  const updateBug = useUpdateBug(projectId)
  const deleteBug = useDeleteBug(projectId)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<BugSeverity>('medium')
  const [gddSection, setGddSection] = useState('')
  const [filter, setFilter] = useState<BugStatus | 'all'>('all')

  async function handleCreate() {
    if (!title.trim()) return
    await createBug.mutateAsync({
      title: title.trim(),
      description: description.trim(),
      severity,
      gddSection: gddSection || undefined,
    })
    setTitle('')
    setDescription('')
    setSeverity('medium')
    setGddSection('')
  }

  const filtered = (bugs ?? []).filter((b) => filter === 'all' || b.status === filter)
  const openCount = (bugs ?? []).filter((b) => b.status === 'open').length

  const inputClass =
    'bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-50 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-yellow-400/50'

  return (
    <div className="flex flex-col gap-5">
      {/* New bug form */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-zinc-300 text-sm font-semibold mb-3">🐛 Report a bug</p>
        <div className="flex flex-wrap gap-3 mb-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Player clips through wall when dashing into corners"
            className={cn(inputClass, 'flex-1 min-w-64')}
          />
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as BugSeverity)}
            className={cn(inputClass, 'w-32')}
          >
            {SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select
            value={gddSection}
            onChange={(e) => setGddSection(e.target.value)}
            className={cn(inputClass, 'w-40')}
          >
            <option value="">No GDD section</option>
            {GDD_SECTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Steps to reproduce (optional)"
            className={cn(inputClass, 'flex-1')}
          />
          <button
            onClick={handleCreate}
            disabled={!title.trim() || createBug.isPending}
            className="bg-yellow-400 text-zinc-950 font-semibold px-5 py-2 rounded-lg text-sm hover:bg-yellow-300 transition-colors disabled:opacity-40"
          >
            {createBug.isPending ? 'Adding…' : 'Add Bug'}
          </button>
        </div>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2">
        <p className="text-zinc-500 text-xs">
          {bugs?.length ?? 0} bugs · {openCount} open
        </p>
        <div className="ml-auto flex bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 gap-0.5">
          {(['all', ...STATUSES.map((s) => s.value)] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors capitalize',
                filter === s ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Bug list */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 bg-zinc-900 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-zinc-600 text-sm text-center py-10">
          {filter === 'all' ? 'No bugs reported — ship it! 🚀' : `No ${filter} bugs.`}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((bug) => {
            const sev = SEVERITIES.find((s) => s.value === bug.severity) ?? SEVERITIES[1]
            return (
              <div
                key={bug._id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center gap-3"
              >
                <span className={cn('text-xs px-2 py-0.5 rounded font-medium shrink-0', sev.badge)}>
                  {sev.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'text-sm truncate',
                      bug.status === 'fixed' || bug.status === 'wontfix'
                        ? 'text-zinc-600 line-through'
                        : 'text-zinc-200',
                    )}
                  >
                    {bug.title}
                  </p>
                  {(bug.description || bug.gddSection) && (
                    <p className="text-zinc-600 text-xs truncate">
                      {bug.gddSection && <span className="text-zinc-500">[{bug.gddSection}] </span>}
                      {bug.description}
                    </p>
                  )}
                </div>
                <select
                  value={bug.status}
                  onChange={(e) =>
                    updateBug.mutate({ bugId: bug._id, status: e.target.value as BugStatus })
                  }
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none shrink-0"
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => deleteBug.mutate(bug._id)}
                  className="text-zinc-700 hover:text-red-400 transition-colors text-sm shrink-0"
                  title="Delete bug"
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
