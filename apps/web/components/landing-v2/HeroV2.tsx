import { ArrowRight } from 'lucide-react'
import { Reveal } from './Reveal'
import { McpSim } from './McpSim'

export function HeroV2() {
  return (
    <section id="top" className="flex min-h-[calc(100dvh-4rem)] items-center">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-16 lg:grid-cols-12">
        <Reveal className="self-center lg:col-span-5">
          <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-zinc-50 md:text-5xl lg:text-6xl">
            From concept to <span className="text-amber-300">gone gold.</span>
          </h1>
          <p className="mt-5 max-w-[42ch] text-lg leading-relaxed text-zinc-400">
            GameGold generates the GDD, sprites, scripts and playtests. You build the game in Unity.
          </p>
          <div className="mt-8 flex items-center gap-6">
            <a
              href="/register"
              className="bg-amber-400 px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-amber-300 active:scale-[0.98]"
            >
              Start building
            </a>
            <a
              href="#phases"
              className="inline-flex items-center gap-1.5 text-sm text-zinc-300 hover:text-zinc-50"
            >
              See the six phases
              <ArrowRight size={16} strokeWidth={1.5} />
            </a>
          </div>
        </Reveal>

        <Reveal delay={0.15} className="lg:col-span-7">
          <McpSim />
          <p className="mt-3 text-sm text-zinc-500">
            A live simulation of the Unity MCP build flow.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
