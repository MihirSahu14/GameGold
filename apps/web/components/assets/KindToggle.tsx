'use client'

import type { AssetKind } from '@gamegold/types'
import { cn } from '@/lib/utils'

interface KindToggleProps {
  value: AssetKind
  onChange: (kind: AssetKind) => void
}

const KINDS: { value: AssetKind; label: string; icon: string }[] = [
  { value: 'sprite', label: 'Sprite', icon: '🧍' },
  { value: 'background', label: 'Background', icon: '🏞️' },
  { value: 'portrait', label: 'Portrait', icon: '🙂' },
]

export function KindToggle({ value, onChange }: KindToggleProps) {
  return (
    <div className="flex bg-zinc-800 rounded-lg p-0.5 gap-0.5" role="radiogroup" aria-label="Asset kind">
      {KINDS.map((kind) => (
        <button
          key={kind.value}
          type="button"
          role="radio"
          aria-checked={value === kind.value}
          onClick={() => onChange(kind.value)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            value === kind.value
              ? 'bg-zinc-700 text-zinc-50 shadow'
              : 'text-zinc-500 hover:text-zinc-300',
          )}
        >
          <span>{kind.icon}</span>
          {kind.label}
        </button>
      ))}
    </div>
  )
}
