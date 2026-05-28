import Link from 'next/link'

export default function LandingPage() {
  return (
    <main className="flex flex-col min-h-screen bg-zinc-950 text-zinc-50">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-yellow-400 text-xl font-bold tracking-tight">🎮 GameGold</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm text-zinc-400 hover:text-zinc-50 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="text-sm bg-yellow-400 text-zinc-950 font-semibold px-4 py-2 rounded-lg hover:bg-yellow-300 transition-colors"
          >
            Get started free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center flex-1 px-8 py-32 text-center">
        <div className="inline-flex items-center gap-2 bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 text-xs font-medium px-3 py-1.5 rounded-full mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          From concept to gone gold
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight max-w-4xl leading-tight mb-6">
          Design, build, and{' '}
          <span className="text-yellow-400">ship your game</span>
          {' '}with AI
        </h1>

        <p className="text-zinc-400 text-lg md:text-xl max-w-2xl mb-12 leading-relaxed">
          GameGold guides you through every stage of game development — from your first idea to
          a shipped product. AI-powered GDD generation, balance analysis, sprite creation,
          and deployment tools in one platform.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            href="/register"
            className="bg-yellow-400 text-zinc-950 font-semibold px-8 py-4 rounded-xl text-base hover:bg-yellow-300 transition-colors"
          >
            Start your first game →
          </Link>
          <Link
            href="/login"
            className="border border-zinc-700 text-zinc-300 font-medium px-8 py-4 rounded-xl text-base hover:border-zinc-500 hover:text-zinc-50 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </section>

      {/* Feature grid */}
      <section className="px-8 pb-32 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-colors"
            >
              <div className="text-3xl mb-4">{f.icon}</div>
              <h3 className="text-zinc-50 font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-8 py-6 text-center text-zinc-500 text-sm">
        GameGold — Built by Mihir Sahu
      </footer>
    </main>
  )
}

const FEATURES = [
  {
    icon: '📋',
    title: 'AI Game Design Documents',
    description:
      'Describe your concept and Claude generates a full, structured GDD you can edit and refine in real-time.',
  },
  {
    icon: '⚖️',
    title: 'Balance & Systems Analyzer',
    description:
      'Model your game systems visually. AI finds exploits, power creep, and dominant strategies before players do.',
  },
  {
    icon: '🎨',
    title: 'Sprite & Asset Generator',
    description:
      'Generate pixel art or 2D illustrated sprites, tiles, and UI elements from natural language descriptions.',
  },
  {
    icon: '🧠',
    title: 'Dialogue & NPC Builder',
    description:
      'Define NPC personalities and let Claude build branching dialogue trees — exportable to JSON.',
  },
  {
    icon: '🧪',
    title: 'AI Playtester',
    description:
      'Simulate playthroughs before launch. Catch softlocks, pacing issues, and balance problems automatically.',
  },
  {
    icon: '🚀',
    title: 'Ship-Ready Export',
    description:
      'Generate your itch.io page, press kit, and a full export bundle — GDD, assets, and code scaffolds.',
  },
]
