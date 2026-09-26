'use client'

import { useState } from 'react'
import type { PlayerLook, PlayerSettings } from '@gamegold/types'
import { cn } from '@/lib/utils'

const LOOKS: { value: PlayerLook; label: string }[] = [
  { value: 'plain', label: 'Plain' },
  { value: 'halftone', label: 'Halftone' },
  { value: 'duotone', label: 'Duotone' },
]

type PlayerSettingsPanelProps = {
  settings: PlayerSettings
  chapters: string[] // chapter ids used in the story, for the tint pickers
  connected: boolean
  busy: boolean
  onSave: (s: PlayerSettings) => void
  onSync: (s: PlayerSettings) => void
}

// Look & feel of GameGold's built-in DialoguePlayer (read from Resources/GameGold/player_settings.json).
export function PlayerSettingsPanel({ settings, chapters, connected, busy, onSave, onSync }: PlayerSettingsPanelProps) {
  const [draft, setDraft] = useState(settings)
  const set = (patch: Partial<PlayerSettings>) => setDraft((d) => ({ ...d, ...patch }))
  const allChapters = [...new Set([...chapters, ...Object.keys(draft.chapterColors)])]

  return (
    <section className="mb-6 border border-[#1b2533] bg-[#0b1018] p-5 text-xs text-[#c8d4e2]">
      <div className="mb-3 text-[11px] tracking-[2px] text-[#456079]">PLAYER SETTINGS</div>

      <div className="mb-3 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Look">
        <span className="w-24 text-[#8b97a7]">Look</span>
        {LOOKS.map((l) => (
          <button
            key={l.value}
            type="button"
            role="radio"
            aria-checked={draft.look === l.value}
            onClick={() => set({ look: l.value })}
            className={cn(
              'border px-3 py-1 text-[11px]',
              draft.look === l.value ? 'border-[#4ea8ff] bg-[#4ea8ff]/10 text-[#4ea8ff]' : 'border-[#1b2533] text-[#8b97a7] hover:text-[#c8d4e2]',
            )}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="flex items-center gap-2">
          <span className="w-24 text-[#8b97a7]">Text speed</span>
          <input
            type="number" min={10} max={120} value={draft.textSpeedCps}
            onChange={(e) => set({ textSpeedCps: Math.min(120, Math.max(10, Number(e.target.value) || 40)) })}
            className="w-16 border border-[#1b2533] bg-[#07090d] px-2 py-1"
          />
          <span className="text-[#456079]">chars/s</span>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-[#8b97a7]">Volume</span>
          <input
            type="range" min={0} max={1} step={0.05} value={draft.volume}
            onChange={(e) => set({ volume: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={draft.wordmarkTitle} onChange={(e) => set({ wordmarkTitle: e.target.checked })} />
          Wordmark title <span className="text-[#456079]">(one-word line on the title bg)</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={draft.ambience} onChange={(e) => set({ ambience: e.target.checked })} />
          Ambience + typewriter sound
        </label>
      </div>

      {allChapters.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="w-24 text-[#8b97a7]">Chapter tint</span>
          {allChapters.map((c) => (
            <label key={c} className="flex items-center gap-1">
              <input
                type="color"
                aria-label={`Chapter ${c} colour`}
                value={draft.chapterColors[c] ?? '#2a3f5c'}
                onChange={(e) => set({ chapterColors: { ...draft.chapterColors, [c]: e.target.value } })}
                className="h-5 w-7 border border-[#1b2533] bg-transparent"
              />
              <span className="text-[#8b97a7]">{c}</span>
            </label>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={busy}
          className="border border-[#1b2533] bg-[#141c27] px-4 py-2 text-[11px] tracking-[1px] disabled:opacity-40"
        >
          SAVE
        </button>
        <button
          type="button"
          onClick={() => onSync(draft)}
          disabled={busy || !connected}
          title={connected ? 'Save, then write Assets/Resources/GameGold/player_settings.json' : 'Connect to Unity first'}
          className="bg-[#4ea8ff] px-4 py-2 text-[11px] font-bold tracking-[1px] text-[#07090d] disabled:cursor-not-allowed disabled:opacity-40"
        >
          SYNC SETTINGS
        </button>
      </div>
    </section>
  )
}
