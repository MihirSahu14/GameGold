'use client'

import type { ArtStyle } from '@gamegold/types'
import { cn } from '@/lib/utils'

interface StyleToggleProps {
  value: ArtStyle
  onChange: (style: ArtStyle) => void
}

const STYLES: { value: ArtStyle; label: string; icon: string }[] = [
  { value: 'pixel', label: 'Pixel Art', icon: '👾' },
  { value: 'illustrated', label: '2D Illustrated', icon: '🖌️' },
]

export function StyleToggle({ value, onChange }: StyleToggleProps) {
  return (
    <div className="flex bg-zinc-800 rounded-lg p-0.5 gap-0.5" role="radiogroup" aria-label="Art style">
      {STYLES.map((style) => (
        <button
          key={style.value}
          type="button"
          role="radio"
          aria-checked={value === style.value}
          onClick={() => onChange(style.value)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            value === style.value
              ? 'bg-zinc-700 text-zinc-50 shadow'
              : 'text-zinc-500 hover:text-zinc-300',
          )}
        >
          <span>{style.icon}</span>
          {style.label}
        </button>
      ))}
    </div>
  )
}
