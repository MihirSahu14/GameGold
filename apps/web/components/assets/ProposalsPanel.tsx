'use client'

import type { ArtStyle, AssetProposal, AssetType } from '@gamegold/types'

export function proposalKey(p: AssetProposal): string {
  return `${p.type}:${p.name}`
}

/** Maps a GDD proposal to the payload of that type's generate endpoint */
export function proposalPayload(p: AssetProposal, style: ArtStyle) {
  switch (p.type) {
    case 'sprite':
      return { name: p.name, description: p.description, style }
    case 'script':
      return {
        name: p.name.replace(/\s+/g, ''),
        scriptType: 'custom' as const,
        description: p.description,
      }
    case 'dialogue':
      return { npcName: p.name, personality: p.description }
  }
}

const GROUPS: { key: AssetType; icon: string; label: string }[] = [
  { key: 'sprite', icon: '🎨', label: 'Sprites' },
  { key: 'script', icon: '📜', label: 'C# Scripts' },
  { key: 'dialogue', icon: '💬', label: 'Dialogue' },
]

interface ProposalsPanelProps {
  proposals: AssetProposal[]
  doneKeys: string[]
  activeKey: string | null
  allProgress: { current: number; total: number } | null
  onGenerate: (proposal: AssetProposal) => void
  onGenerateAll: () => void
  onClose: () => void
}

export function ProposalsPanel({
  proposals,
  doneKeys,
  activeKey,
  allProgress,
  onGenerate,
  onGenerateAll,
  onClose,
}: ProposalsPanelProps) {
  const busy = activeKey !== null || allProgress !== null
  const remaining = proposals.filter((p) => !doneKeys.includes(proposalKey(p)))

  return (
    <div className="mx-6 mt-4 bg-zinc-900 border border-yellow-400/30 rounded-xl flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div>
          <p className="text-zinc-50 text-sm font-semibold">💡 Suggested from your GDD</p>
          <p className="text-zinc-500 text-xs mt-0.5">
            {remaining.length} of {proposals.length} left to generate
          </p>
        </div>
        <div className="flex items-center gap-2">
          {remaining.length > 0 && (
            <button
              onClick={onGenerateAll}
              disabled={busy}
              className="bg-yellow-400 text-zinc-950 font-semibold px-4 py-1.5 rounded-lg text-xs hover:bg-yellow-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {allProgress
                ? `✨ Generating ${allProgress.current}/${allProgress.total}…`
                : `✨ Generate all (${remaining.length})`}
            </button>
          )}
          <button
            onClick={onClose}
            className="text-zinc-600 hover:text-zinc-300 transition-colors text-sm"
            title="Dismiss suggestions"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="px-4 py-3 flex flex-col gap-4 max-h-72 overflow-y-auto">
        {GROUPS.map(({ key, icon, label }) => {
          const group = proposals.filter((p) => p.type === key)
          if (group.length === 0) return null
          return (
            <div key={key}>
              <p className="text-zinc-500 text-xs font-medium mb-2">
                {icon} {label}
              </p>
              <div className="flex flex-col gap-2">
                {group.map((p) => {
                  const k = proposalKey(p)
                  const done = doneKeys.includes(k)
                  const active = activeKey === k
                  return (
                    <div
                      key={k}
                      className="flex items-start gap-3 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-zinc-50 text-sm font-medium">{p.name}</p>
                        <p className="text-zinc-400 text-xs mt-0.5">{p.description}</p>
                        <p className="text-zinc-600 text-xs italic mt-0.5">{p.reason}</p>
                      </div>
                      <button
                        onClick={() => onGenerate(p)}
                        disabled={done || busy}
                        className={
                          done
                            ? 'text-emerald-400 text-xs font-medium py-1.5 px-3 flex-shrink-0'
                            : 'bg-zinc-800 text-zinc-300 text-xs font-medium py-1.5 px-3 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0'
                        }
                      >
                        {done ? '✓ Done' : active ? 'Generating…' : 'Generate'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
