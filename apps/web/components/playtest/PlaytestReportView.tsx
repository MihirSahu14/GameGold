'use client'

import { useState } from 'react'
import type { PlaytestReport } from '@gamegold/types'

interface PlaytestReportViewProps {
  report: PlaytestReport
}

const PERSONA_META: Record<string, { icon: string; label: string }> = {
  casual: { icon: '🛋️', label: 'Casual Player' },
  hardcore: { icon: '⚔️', label: 'Hardcore Min-Maxer' },
  speedrunner: { icon: '⏱️', label: 'Speedrunner' },
  completionist: { icon: '🗺️', label: 'Completionist' },
}

function IssueSection({ title, items, color, badge }: {
  title: string
  items: string[]
  color: string
  badge: string
}) {
  if (items.length === 0) return null
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${color}`}>{title}</p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
            <span className={`mt-0.5 shrink-0 text-xs px-1.5 py-0.5 rounded font-mono ${badge}`}>
              {title.slice(0, 3).toUpperCase()}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PlaytestReportView({ report }: PlaytestReportViewProps) {
  const [showLog, setShowLog] = useState(false)
  const persona = PERSONA_META[report.persona] ?? PERSONA_META.casual

  const issueCount =
    report.softlocks.length +
    report.pacingIssues.length +
    report.difficultySpikes.length +
    report.balanceSuggestions.length

  return (
    <div className="flex flex-col gap-5">
      {/* Summary */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">{persona.icon}</span>
          <div>
            <p className="text-zinc-50 text-sm font-semibold">{persona.label} Verdict</p>
            <p className="text-zinc-600 text-xs">
              {new Date(report.createdAt).toLocaleString()} · {issueCount} issues found
            </p>
          </div>
        </div>
        <p className="text-zinc-300 text-sm leading-relaxed">{report.summary}</p>
      </div>

      {/* Playthrough log */}
      {report.playthroughLog.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowLog((v) => !v)}
            className="flex items-center justify-between w-full px-5 py-3 hover:bg-zinc-800/40 transition-colors"
          >
            <span className="text-zinc-300 text-sm font-semibold">
              🎮 Playthrough Log — {report.playthroughLog.length} steps
            </span>
            <span className="text-zinc-600 text-xs">{showLog ? '▾' : '▸'}</span>
          </button>
          {showLog && (
            <ol className="px-5 pb-4 flex flex-col gap-2">
              {report.playthroughLog.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-zinc-400">
                  <span className="text-zinc-700 font-mono text-xs mt-0.5 shrink-0 w-5 text-right">
                    {i + 1}.
                  </span>
                  <span className="italic">{step}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Issues */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-5">
        {issueCount === 0 && report.funHighlights.length === 0 && (
          <p className="text-zinc-500 text-sm text-center">No findings in this run.</p>
        )}

        <IssueSection
          title="Softlocks"
          items={report.softlocks}
          color="text-red-400"
          badge="bg-red-900/40 text-red-400"
        />
        <IssueSection
          title="Pacing Issues"
          items={report.pacingIssues}
          color="text-orange-400"
          badge="bg-orange-900/40 text-orange-400"
        />
        <IssueSection
          title="Difficulty Spikes"
          items={report.difficultySpikes}
          color="text-yellow-400"
          badge="bg-yellow-900/40 text-yellow-400"
        />
        <IssueSection
          title="Fun Highlights"
          items={report.funHighlights}
          color="text-green-400"
          badge="bg-green-900/40 text-green-400"
        />

        {/* Balance suggestions with Unity paths */}
        {report.balanceSuggestions.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2 text-blue-400">
              Balance Suggestions
            </p>
            <div className="flex flex-col gap-3">
              {report.balanceSuggestions.map((s, i) => (
                <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                  <p className="text-sm text-zinc-200 mb-1">⚠️ {s.issue}</p>
                  <p className="text-sm text-zinc-400 mb-2">
                    <span className="text-blue-400 font-medium">Fix:</span> {s.fix}
                  </p>
                  {s.unityPath && (
                    <p className="text-xs text-zinc-500 font-mono bg-zinc-900 rounded px-2 py-1.5">
                      📍 In Unity: {s.unityPath}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
