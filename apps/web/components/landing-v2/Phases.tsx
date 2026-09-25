import { Reveal } from './Reveal'

type Phase = {
  number: string
  title: string
  status: 'Live' | 'Next'
  desc: string
}

const PHASES: Phase[] = [
  {
    number: '01',
    title: 'Concept & GDD',
    status: 'Live',
    desc: 'Fill out a concept card and Claude drafts all eight GDD sections in one shot. Edit any section in a rich text editor, or refine it with a plain instruction.',
  },
  {
    number: '02',
    title: 'Systems & Balance',
    status: 'Live',
    desc: 'Map your entities, mechanics, events and states on a visual node graph. Claude reads the graph and flags dominant strategies, exploit loops and stat imbalances early.',
  },
  {
    number: '03',
    title: 'Asset Production',
    status: 'Live',
    desc: 'Generate pixel art sprites, complete C# MonoBehaviours and branching NPC dialogue trees. Every artifact ships with a checkable Unity setup guide.',
  },
  {
    number: '04',
    title: 'Unity MCP Server',
    status: 'Live',
    desc: 'Built and tested live in Unity 6. A C# editor package that runs an HTTP server inside Unity. Claude generates a build plan and executes each step live in the Editor: creating GameObjects, importing sprites, attaching scripts, entering Play mode.',
  },
  {
    number: '05',
    title: 'AI Playtesting',
    status: 'Live',
    desc: 'Claude plays your game as four personas: casual, hardcore, speedrunner and completionist. Each run reports softlocks, pacing gaps and difficulty spikes with exact Inspector paths.',
  },
  {
    number: '06',
    title: 'Deployment',
    status: 'Live',
    desc: 'Store page copy tuned for itch.io or Steam, a full press kit and per platform build guides. Export everything as a single ZIP, ready to hand off.',
  },
]

const CHIP: Record<Phase['status'], string> = {
  Live: 'border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400',
  Next: 'border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-300',
}

export function Phases() {
  return (
    <section id="phases" className="scroll-mt-24">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-28">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <Reveal>
                <h2 className="text-3xl font-semibold tracking-tight text-zinc-50 md:text-4xl">
                  Concept to shipped, in six phases.
                </h2>
                <p className="mt-4 max-w-[60ch] leading-relaxed text-zinc-400">
                  Every stage of the pipeline lives in one project. All six phases are live, including the
                  Unity MCP server.
                </p>
              </Reveal>
            </div>
          </div>

          <div className="divide-y divide-zinc-800 lg:col-span-8">
            {PHASES.map((phase, i) => (
              <Reveal key={phase.number} delay={i * 0.05} className="py-8 first:pt-0 last:pb-0">
                <div className="grid grid-cols-[auto_1fr] gap-x-6">
                  <div className="pt-1 font-geist-mono text-sm text-zinc-600">{phase.number}</div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-zinc-50">{phase.title}</h3>
                      <span className={CHIP[phase.status]}>{phase.status}</span>
                    </div>
                    <p className="mt-2 max-w-[58ch] text-sm leading-relaxed text-zinc-400">
                      {phase.desc}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
