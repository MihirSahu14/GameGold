'use client'

import { useState } from 'react'
import type { PlaytestSessionCreate, TesterRing } from '@gamegold/types'

export const RING_LABELS: Record<TesterRing, string> = {
  self: "Just me / team (doesn't count toward the gate)",
  friends: 'Friends & family',
  discord: 'Discord / community',
  steam_playtest: 'Steam Playtest',
  ea: 'Early Access players',
}

type SessionLogFormProps = {
  /** Resolves true when saved — the form then clears its notes. */
  onSubmit: (session: PlaytestSessionCreate) => Promise<boolean>
  isSubmitting: boolean
}

const fieldClass = 'rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200'
const labelClass = 'flex flex-col gap-1 text-xs text-zinc-500'

export function SessionLogForm({ onSubmit, isSubmitting }: SessionLogFormProps) {
  const [testers, setTesters] = useState('3')
  const [ring, setRing] = useState<TesterRing>('friends')
  const [kept, setKept] = useState('0')
  const [notes, setNotes] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const ok = await onSubmit({
      testers: Number(testers),
      ring,
      keptPlayingUnprompted: Number(kept),
      notes: notes.trim(),
    })
    if (ok) {
      setKept('0')
      setNotes('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-sm font-semibold text-zinc-300">Log a playtest session</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className={labelClass}>
          Testers
          <input type="number" min={1} required value={testers} onChange={(e) => setTesters(e.target.value)} className={fieldClass} />
        </label>
        <label className={labelClass}>
          Who played
          <select value={ring} onChange={(e) => setRing(e.target.value as TesterRing)} className={fieldClass}>
            {(Object.keys(RING_LABELS) as TesterRing[]).map((r) => (
              <option key={r} value={r}>{RING_LABELS[r]}</option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Kept playing unprompted
          <input type="number" min={0} value={kept} onChange={(e) => setKept(e.target.value)} className={fieldClass} />
        </label>
      </div>
      <label className={labelClass}>
        Notes — what confused them, where they quit, what they replayed
        <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldClass} />
      </label>
      <button
        type="submit"
        disabled={isSubmitting}
        className="self-start rounded-lg bg-yellow-400 px-5 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-yellow-300 disabled:opacity-40"
      >
        {isSubmitting ? 'Saving…' : 'Log session'}
      </button>
    </form>
  )
}
