import { ArrowRight } from 'lucide-react'

import { Reveal } from './Reveal'

const ROWS: readonly (readonly [string, string])[] = [
  ['The sprite', 'Imports and places it in the scene'],
  ['The C# script', 'Attaches it to the GameObject'],
  ['The state machine', 'Builds it in the Animator'],
  ['The level layout', 'Constructs the actual level'],
  ['The balance analysis', 'Tweaks the numbers in the Inspector'],
]

export function Philosophy() {
  return (
    <section id="philosophy" className="scroll-mt-24 border-y border-zinc-800 bg-zinc-900/40">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-28">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">
            AI assists. You build.
          </h2>
          <p className="mt-4 max-w-[60ch] leading-relaxed text-zinc-400">
            Game development is a creative craft and the developer should always be the one making
            the game. GameGold generates the materials. You build the game.
          </p>
        </Reveal>

        <Reveal className="mt-12">
          <div className="grid grid-cols-2">
            <div className="pb-4 text-sm font-medium text-amber-300">GameGold generates</div>
            <div className="border-l border-zinc-800 pb-4 pl-6 text-sm font-medium text-zinc-200">
              You build in Unity
            </div>
          </div>

          <div className="divide-y divide-zinc-800/70">
            {ROWS.map(([generated, built]) => (
              <div key={generated} className="grid grid-cols-2 py-4">
                <div className="text-[15px] text-zinc-200">{generated}</div>
                <div className="flex items-start gap-2.5 border-l border-zinc-800 pl-6">
                  <ArrowRight size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-amber-300" />
                  <span className="text-[15px] text-zinc-400">{built}</span>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 max-w-[65ch] text-[15px] leading-relaxed text-zinc-500">
            Dragging assets into Unity, wiring up components, building scenes: that is the craft.
            GameGold handles the generation and guidance. You handle the creation.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
