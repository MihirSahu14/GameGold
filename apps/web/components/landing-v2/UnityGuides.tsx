'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'

import { Reveal } from './Reveal'

type Step = { text: string; highlight?: string; text2?: string }

type GuideCardProps = {
  filename: string
  generatedLabel: string
  steps: Step[]
}

const SPRITE_STEPS: Step[] = [
  { text: 'Drag the file into ', highlight: 'Assets/Sprites/' },
  { text: 'Inspector, set Texture Type to ', highlight: 'Sprite (2D and UI)' },
  { text: 'Set ', highlight: 'Pixels Per Unit', text2: ' to 32' },
  { text: 'Set Filter Mode to ', highlight: 'Point (no filter)' },
  { text: 'Click ', highlight: 'Apply', text2: ', then drag to the Scene view' },
]

const SCRIPT_STEPS: Step[] = [
  { text: 'Open ', highlight: 'Assets/Scripts/', text2: ' in the Project panel' },
  { text: 'Right click, ', highlight: 'Create, C# Script' },
  { text: 'Paste the generated code and save' },
  { text: 'Select the ', highlight: 'Player', text2: ' GameObject in the Hierarchy' },
  { text: 'Drag the script onto the ', highlight: 'Inspector' },
  { text: 'Press ', highlight: 'Play', text2: ' and test the controller' },
]

function GuideCard({ filename, generatedLabel, steps }: GuideCardProps) {
  const [done, setDone] = useState<boolean[]>(() => steps.map(() => false))
  const doneCount = done.filter(Boolean).length
  const allDone = doneCount === steps.length

  const toggle = (index: number) =>
    setDone((prev) => prev.map((value, i) => (i === index ? !value : value)))

  return (
    <div className="border border-zinc-800 bg-zinc-900/60">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
        <span className="font-geist-mono text-xs text-zinc-400">{filename}</span>
        <span
          className={`font-geist-mono text-xs transition-colors ${
            allDone ? 'text-amber-300' : 'text-zinc-500'
          }`}
        >
          {doneCount} / {steps.length}
        </span>
      </div>

      <div className="p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-zinc-200">
          <Check size={16} strokeWidth={1.5} className="shrink-0 text-amber-300" />
          {generatedLabel}
        </p>

        <div className="mt-4 divide-y divide-zinc-800/60">
          {steps.map((step, i) => (
            <button
              key={step.text + (step.highlight ?? '')}
              type="button"
              onClick={() => toggle(i)}
              aria-pressed={done[i]}
              className="flex w-full cursor-pointer items-start gap-3 py-2.5 text-left"
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center transition-colors ${
                  done[i] ? 'bg-amber-400' : 'border border-zinc-700'
                }`}
              >
                {done[i] ? <Check size={12} strokeWidth={1.5} className="text-zinc-950" /> : null}
              </span>
              <span
                className={`text-sm leading-relaxed transition-colors ${
                  done[i] ? 'text-zinc-600' : 'text-zinc-300'
                }`}
              >
                {step.text}
                {step.highlight ? (
                  <span
                    className={`font-geist-mono text-[13px] font-medium transition-colors ${
                      done[i] ? 'text-zinc-600' : 'text-zinc-100'
                    }`}
                  >
                    {step.highlight}
                  </span>
                ) : null}
                {step.text2}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function UnityGuides() {
  return (
    <section id="unity" className="scroll-mt-24">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-28">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">
            Every output ships with a setup guide.
          </h2>
          <p className="mt-4 max-w-[60ch] leading-relaxed text-zinc-400">
            GameGold is Unity first. Each generated asset comes with a step by step setup guide you
            can check off as you work. Try one:
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <Reveal>
            <GuideCard
              filename="Player_Idle_8frame.png"
              generatedLabel="Sprite generated"
              steps={SPRITE_STEPS}
            />
          </Reveal>
          <Reveal delay={0.1}>
            <GuideCard
              filename="PlayerController.cs"
              generatedLabel="Script generated"
              steps={SCRIPT_STEPS}
            />
          </Reveal>
        </div>

        <Reveal className="mt-10">
          <div className="border border-amber-400/20 bg-amber-400/5 p-6">
            <p className="text-[15px] font-semibold text-zinc-50">
              Or skip the manual steps entirely.
            </p>
            <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-zinc-400">
              Install the GameGold MCP package in your Unity editor and Claude runs the whole
              checklist for you: it reads your GDD and assets, plans the build, then executes each
              step live in the Editor. The simulation at the top of this page shows the flow.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
