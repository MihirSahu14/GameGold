'use client'

import { useState } from 'react'
import type { UnityGuide as UnityGuideType } from '@gamegold/types'
import { cn } from '@/lib/utils'

interface UnityGuideProps {
  guide: UnityGuideType
  onToggleStep: (completed: boolean[]) => void
  isSaving?: boolean
}

export function UnityGuide({ guide, onToggleStep, isSaving }: UnityGuideProps) {
  const [open, setOpen] = useState(false)
  const done = guide.completed.filter(Boolean).length
  const total = guide.steps.length

  if (total === 0) return null

  function toggle(index: number) {
    const next = [...guide.completed]
    next[index] = !next[index]
    onToggleStep(next)
  }

  return (
    <div className="border-t border-zinc-800">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full px-4 py-2.5 text-left hover:bg-zinc-800/40 transition-colors"
      >
        <span className="text-xs font-semibold text-zinc-300">
          📖 Unity Setup — {total} steps
        </span>
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'text-xs font-mono px-1.5 py-0.5 rounded',
              done === total
                ? 'bg-green-900/40 text-green-400'
                : 'bg-zinc-800 text-zinc-500',
            )}
          >
            {done}/{total}
          </span>
          <span className="text-zinc-600 text-xs">{open ? '▾' : '▸'}</span>
        </span>
      </button>

      {open && (
        <ol className="px-4 pb-3 flex flex-col gap-1.5">
          {guide.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <button
                onClick={() => toggle(i)}
                disabled={isSaving}
                aria-label={`Mark step ${i + 1} ${guide.completed[i] ? 'incomplete' : 'complete'}`}
                className={cn(
                  'mt-0.5 w-4 h-4 shrink-0 rounded border text-[10px] leading-none flex items-center justify-center transition-colors',
                  guide.completed[i]
                    ? 'bg-green-500/20 border-green-500/60 text-green-400'
                    : 'border-zinc-700 text-transparent hover:border-zinc-500',
                )}
              >
                ✓
              </button>
              <span
                className={cn(
                  'text-xs leading-relaxed',
                  guide.completed[i] ? 'text-zinc-600 line-through' : 'text-zinc-400',
                )}
              >
                <span className="text-zinc-600 font-mono mr-1.5">Step {i + 1}:</span>
                {step}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
