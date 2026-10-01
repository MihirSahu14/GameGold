'use client'

type RuntimeUpdateProps = {
  outdated: boolean
  servedVersion: number | null
  syncedVersion: number | null // null = unknown (sent before versions were tracked, or never)
  busy: boolean
  onUpdate: () => void
  runtimeClass?: string // the project's kit runtime
}

/** Re-send the project's GameGold runtime (DialoguePlayer, GridPlayer…) without touching plan steps (gap 40). Loud when a newer one exists. */
export function RuntimeUpdate({ outdated, servedVersion, syncedVersion, busy, onUpdate, runtimeClass = 'DialoguePlayer' }: RuntimeUpdateProps) {
  const label = busy ? 'UPDATING…' : '⟳ UPDATE RUNTIME'
  if (!outdated) {
    return (
      <div className="mb-4 flex items-center gap-3 text-[11px] text-[#456079]">
        <span>{runtimeClass}{syncedVersion != null ? ` v${syncedVersion}` : ''} in Unity</span>
        <button onClick={onUpdate} disabled={busy} className="border border-[#1b2533] bg-[#141c27] px-3 py-1 text-[10px] tracking-[1px] text-[#8b97a7] disabled:opacity-40">
          {label}
        </button>
      </div>
    )
  }
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-yellow-900/60 bg-yellow-950/20 p-3 text-xs text-yellow-300">
      <span>
        A newer GameGold {runtimeClass}{servedVersion != null ? ` (v${servedVersion})` : ''} is available
        {syncedVersion != null ? ` — Unity has v${syncedVersion}` : ''}. Updating rewrites Assets/Scripts/{runtimeClass}.cs only.
      </span>
      <button onClick={onUpdate} disabled={busy} className="border border-yellow-500/50 bg-yellow-500/10 px-4 py-2 text-[11px] tracking-[1px] text-yellow-300 disabled:opacity-40">
        {label}
      </button>
    </div>
  )
}
