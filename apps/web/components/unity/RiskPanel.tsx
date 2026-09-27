'use client'

import { useState } from 'react'
import type { RiskKind } from '@gamegold/types'
import { cn } from '@/lib/utils'

// ponytail: static advice keyed by kind — no LLM, the point is to ask the question.
export const RISK_KINDS: { value: RiskKind; label: string; advice: string }[] = [
  { value: 'feel', label: 'Feel / presentation', advice: "Rough visuals + audio in-engine; text alone can't test feeling" },
  { value: 'loop', label: 'Core loop', advice: 'Greybox the loop, no art' },
  { value: 'story', label: 'Story / structure', advice: 'Text prototype (ink/Twine) first' },
  { value: 'tech', label: 'Tech', advice: 'Spike the risky system alone' },
]

type RiskPanelProps = {
  assumption: string
  kind: RiskKind | null
  saving: boolean
  onSave: (risk: { riskiestAssumption: string; riskKind: RiskKind | null }) => void
}

export function RiskPanel({ assumption, kind, saving, onSave }: RiskPanelProps) {
  const [text, setText] = useState(assumption)
  const [picked, setPicked] = useState<RiskKind | null>(kind)
  const advice = RISK_KINDS.find((k) => k.value === picked)?.advice

  return (
    <section className="mb-7 border border-[#1b2533] bg-[#0b1018] p-5">
      <label htmlFor="riskiest" className="mb-2 block text-xs text-[#eaf2ff]">
        What&apos;s the riskiest thing about this game?
      </label>
      <textarea
        id="riskiest"
        value={text}
        maxLength={500}
        rows={2}
        onChange={(e) => setText(e.target.value)}
        className="w-full resize-y border border-[#1b2533] bg-[#07090d] p-2 text-xs text-[#c8d4e2]"
      />
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Risk kind">
        {RISK_KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="radio"
            aria-checked={picked === k.value}
            onClick={() => setPicked(k.value)}
            className={cn(
              'border px-3 py-1 text-[11px]',
              picked === k.value
                ? 'border-[#4ea8ff] bg-[#4ea8ff]/10 text-[#4ea8ff]'
                : 'border-[#1b2533] text-[#8b97a7] hover:text-[#c8d4e2]',
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
      {advice && <p className="mt-3 text-xs text-[#8b97a7]">→ {advice}</p>}
      <button
        type="button"
        disabled={saving}
        onClick={() => onSave({ riskiestAssumption: text.trim(), riskKind: picked })}
        className="mt-3 border border-[#1b2533] bg-[#141c27] px-4 py-2 text-[11px] text-[#c8d4e2] disabled:cursor-not-allowed"
      >
        {saving ? 'SAVING...' : 'SAVE'}
      </button>
    </section>
  )
}
