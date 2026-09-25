'use client'

type PillarsEditorProps = {
  pillars: string[] // always length 3
  wontDo: string[]
  onPillarsChange: (pillars: string[]) => void
  onWontDoChange: (wontDo: string[]) => void
}

const PLACEHOLDERS = [
  'e.g. "Every sound is a risk"',
  'e.g. "Runs last under 10 minutes"',
  'e.g. "You always know why you died"',
]
const labelClass = 'mb-2 block text-[11px] tracking-[2px] text-[#456079]'
const hintClass = 'text-xs normal-case tracking-normal text-[#2a3a4a]'
const inputClass =
  'w-full border border-[#1b2533] bg-[#07090d] px-3.5 py-2.5 text-[13px] text-[#c8d4e2] outline-none focus:border-[#4ea8ff]'

export function PillarsEditor({ pillars, wontDo, onPillarsChange, onWontDoChange }: PillarsEditorProps) {
  return (
    <>
      <div>
        <span className={labelClass}>
          PILLARS <span className={hintClass}>— exactly 3; every feature must serve one</span>
        </span>
        <div className="flex flex-col gap-2">
          {pillars.map((pillar, i) => (
            <input
              key={i}
              aria-label={`Pillar ${i + 1}`}
              value={pillar}
              maxLength={200}
              placeholder={PLACEHOLDERS[i]}
              onChange={(e) => onPillarsChange(pillars.map((p, j) => (j === i ? e.target.value : p)))}
              className={inputClass}
            />
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="wont-do" className={labelClass}>
          WON&apos;T DO <span className={hintClass}>— one per line; what this game deliberately is not</span>
        </label>
        <textarea
          id="wont-do"
          rows={3}
          value={wontDo.join('\n')}
          placeholder={'No multiplayer\nNo crafting'}
          onChange={(e) => onWontDoChange(e.target.value.split('\n'))}
          className={`${inputClass} resize-none`}
        />
      </div>
    </>
  )
}
