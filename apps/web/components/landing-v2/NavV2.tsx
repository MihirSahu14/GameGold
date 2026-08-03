const NAV_LINKS = [
  ['Capabilities', '#capabilities'],
  ['Philosophy', '#philosophy'],
  ['Phases', '#phases'],
  ['Unity', '#unity'],
] as const

export function NavV2() {
  return (
    <nav className="sticky top-0 z-50 h-16 border-b border-zinc-800/70 bg-zinc-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center bg-amber-400 font-geist-mono text-sm font-bold text-zinc-950">
            G
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-zinc-50">GameGold</span>
        </a>

        <div className="flex items-center gap-7">
          <div className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="text-sm text-zinc-400 transition-colors hover:text-zinc-100"
              >
                {label}
              </a>
            ))}
          </div>
          <a
            href="/register"
            className="bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition-transform hover:bg-amber-300 active:scale-[0.98]"
          >
            Start building
          </a>
        </div>
      </div>
    </nav>
  )
}
