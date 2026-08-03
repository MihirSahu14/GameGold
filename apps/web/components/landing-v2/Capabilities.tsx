import { FileText, FlaskConical, Rocket, Workflow } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Reveal } from './Reveal'

type Capability = {
  icon: LucideIcon
  title: string
  desc: string
  span: string
  surface: string
  delay: number
}

const CAPABILITIES: Capability[] = [
  {
    icon: FileText,
    title: 'Generate',
    desc: 'Full game design documents, sprites, C# scripts and NPC dialogue trees from a plain concept.',
    span: 'md:col-span-2',
    surface:
      'bg-zinc-900 bg-[radial-gradient(ellipse_at_top_left,rgba(245,184,46,0.07),transparent_60%)]',
    delay: 0,
  },
  {
    icon: Workflow,
    title: 'Model',
    desc: 'Map game systems on a visual node graph and let AI find exploits before your players do.',
    span: 'md:col-span-1',
    surface: 'bg-zinc-900/60',
    delay: 0.05,
  },
  {
    icon: FlaskConical,
    title: 'Simulate',
    desc: 'AI playthroughs across four player personas catch softlocks and pacing issues early.',
    span: 'md:col-span-1',
    surface: 'bg-zinc-900/60',
    delay: 0.1,
  },
  {
    icon: Rocket,
    title: 'Ship',
    desc: 'Your store page, press kit and a full export bundle when it is time to go gold.',
    span: 'md:col-span-2',
    surface: 'bg-[radial-gradient(#1b2533_1px,transparent_1px)] bg-[size:16px_16px]',
    delay: 0.15,
  },
]

export function Capabilities() {
  return (
    <section id="capabilities" className="scroll-mt-24">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-28">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">
            One workspace for the whole pipeline.
          </h2>
          <p className="mt-4 max-w-[60ch] leading-relaxed text-zinc-400">
            Not a single tool but a complete pipeline, from your first idea to a shipped product.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {CAPABILITIES.map(({ icon: Icon, title, desc, span, surface, delay }) => (
            <Reveal key={title} delay={delay} className={span}>
              <div
                className={`h-full border border-zinc-800 p-8 transition-colors hover:border-zinc-600 ${surface}`}
              >
                <Icon size={22} strokeWidth={1.5} className="text-amber-300" />
                <h3 className="mt-5 text-lg font-semibold text-zinc-50">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
