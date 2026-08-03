import type { Metadata } from 'next'
import { NavV2 } from '@/components/landing-v2/NavV2'
import { HeroV2 } from '@/components/landing-v2/HeroV2'
import { Capabilities } from '@/components/landing-v2/Capabilities'
import { Philosophy } from '@/components/landing-v2/Philosophy'
import { Phases } from '@/components/landing-v2/Phases'
import { UnityGuides } from '@/components/landing-v2/UnityGuides'
import { Reveal } from '@/components/landing-v2/Reveal'

export const metadata: Metadata = {
  title: 'GameGold',
  description:
    'AI powered game design platform. Concept, design, build and ship your game, all in one place.',
}

export default function LandingV2Page() {
  return (
    <div id="gg-v2" className="min-h-[100dvh] w-full bg-zinc-950 font-geist text-zinc-200">
      <NavV2 />
      <HeroV2 />
      <Capabilities />
      <Philosophy />
      <Phases />
      <UnityGuides />

      {/* Final CTA */}
      <section className="border-t border-zinc-800">
        <div className="mx-auto max-w-6xl px-6 py-24 text-center md:py-32">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">
              Ready to go gold?
            </h2>
            <p className="mx-auto mt-4 max-w-[46ch] leading-relaxed text-zinc-400">
              From first concept to shipped game, with AI at every step and you in control.
            </p>
            <div className="mt-8">
              <a
                href="/register"
                className="inline-block bg-amber-400 px-6 py-3 text-sm font-semibold text-zinc-950 transition-transform hover:bg-amber-300 active:scale-[0.98]"
              >
                Start building
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center bg-amber-400 font-geist-mono text-xs font-bold text-zinc-950">
              G
            </span>
            <span className="text-sm text-zinc-500">GameGold. Phases 1 to 5 live.</span>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <a href="/" className="text-zinc-500 transition-colors hover:text-zinc-200">
              Current landing
            </a>
            <a
              href="https://mihirsahu.vercel.app"
              className="text-zinc-400 transition-colors hover:text-zinc-100"
            >
              Built by Mihir Sahu
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
