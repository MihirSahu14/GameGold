'use client'

import type { PrototypeDecision } from '@gamegold/types'
import { cn } from '@/lib/utils'

type DecisionPanelProps = {
  current: PrototypeDecision | null
  isPending: boolean
  onDecide: (decision: PrototypeDecision) => void
}

const CONFIRM: Partial<Record<PrototypeDecision, string>> = {
  pivot: 'Pivot back to Pitch? Everything you built is kept; you rework the hook and pillars.',
  kill: 'Kill this project? That is a good outcome — you learned it before spending months on it.',
}

export function DecisionPanel({ current, isPending, onDecide }: DecisionPanelProps) {
  function decide(decision: PrototypeDecision) {
    const message = CONFIRM[decision]
    if (message && !window.confirm(message)) return
    onDecide(decision)
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="mb-1 text-sm font-semibold text-zinc-300">Prototype decision</p>
      <p className="mb-3 text-xs text-zinc-500">
        After your sessions: is the core loop fun? Killing a prototype is a success — you saved months.
      </p>
      <div className="flex gap-2">
        {(['continue', 'pivot', 'kill'] as const).map((decision) => (
          <button
            key={decision}
            type="button"
            onClick={() => decide(decision)}
            disabled={isPending}
            className={cn(
              'rounded-lg border px-4 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40',
              current === decision
                ? 'border-yellow-400/60 bg-zinc-800 text-zinc-50'
                : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200',
            )}
          >
            {decision}
          </button>
        ))}
      </div>
    </div>
  )
}
