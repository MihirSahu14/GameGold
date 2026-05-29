'use client'

import type { BalanceAnalysis } from '@gamegold/types'

interface BalancePanelProps {
  analysis: BalanceAnalysis | null
  isLoading: boolean
  onReanalyze: () => void
}

interface SectionProps {
  title: string
  items: string[]
  color: string
  badge: string
}

function Section({ title, items, color, badge }: SectionProps) {
  if (items.length === 0) return null
  return (
    <div className="mb-4">
      <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${color}`}>{title}</p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
            <span
              className={`mt-0.5 shrink-0 text-xs px-1.5 py-0.5 rounded font-mono ${badge}`}
            >
              {title.slice(0, 3).toUpperCase()}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function BalancePanel({ analysis, isLoading, onReanalyze }: BalancePanelProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" role="status" aria-label="Analyzing">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm">Analyzing balance…</p>
        </div>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
        <p className="text-zinc-500 text-sm">
          Add nodes and edges to your systems graph, then run Analyze to get balance feedback.
        </p>
        <button
          onClick={onReanalyze}
          className="px-4 py-2 bg-yellow-400 text-zinc-950 text-sm font-semibold rounded-lg hover:bg-yellow-300 transition-colors"
        >
          Analyze
        </button>
      </div>
    )
  }

  const hasIssues =
    analysis.exploits.length > 0 ||
    analysis.powerCreep.length > 0 ||
    analysis.dominantStrategies.length > 0 ||
    analysis.suggestions.length > 0

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
        <p className="text-zinc-50 text-sm font-semibold">Balance Analysis</p>
        <button
          onClick={onReanalyze}
          className="text-xs text-zinc-400 hover:text-yellow-400 transition-colors"
        >
          Re-Analyze
        </button>
      </div>

      <div className="p-4 flex-1">
        {!hasIssues && (
          <p className="text-zinc-500 text-sm text-center mt-4">
            No issues found — your systems look balanced!
          </p>
        )}

        <Section
          title="Exploits"
          items={analysis.exploits}
          color="text-red-400"
          badge="bg-red-900/40 text-red-400"
        />
        <Section
          title="Power Creep"
          items={analysis.powerCreep}
          color="text-orange-400"
          badge="bg-orange-900/40 text-orange-400"
        />
        <Section
          title="Dominant Strategies"
          items={analysis.dominantStrategies}
          color="text-yellow-400"
          badge="bg-yellow-900/40 text-yellow-400"
        />
        <Section
          title="Suggestions"
          items={analysis.suggestions}
          color="text-blue-400"
          badge="bg-blue-900/40 text-blue-400"
        />

        {analysis.analyzedAt && (
          <p className="text-zinc-600 text-xs mt-4">
            Last analyzed: {new Date(analysis.analyzedAt).toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  )
}
