'use client'

import { useState } from 'react'
import type { AgentPlayReport } from '@gamegold/types'
import { AGENT_LABELS, usePlaytestFrames } from '@/lib/queries/useAgentPlaytest'
import { cn } from '@/lib/utils'

type AgentPlayReportViewProps = { report: AgentPlayReport }

function List({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!items.length) return null
  return (
    <div>
      <p className={cn('mb-2 text-xs font-semibold uppercase tracking-wider', color)}>{title}</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-zinc-300">
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </div>
  )
}

export function AgentPlayReportView({ report }: AgentPlayReportViewProps) {
  const [showFrames, setShowFrames] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const { data: frames, isLoading } = usePlaytestFrames(report.projectId, report._id, showFrames)
  const step = report.steps.find((s) => s.n === selected)
  const frame = frames?.find((f) => f.n === selected)
  const keep = report.wouldKeepPlaying

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-sm font-semibold text-zinc-50">{AGENT_LABELS[report.agentPersona]} played your build</p>
        <p className="mb-3 text-xs text-zinc-600">
          {new Date(report.createdAt).toLocaleString()} · {report.steps.length} steps · {report.gameUrl}
          {report.stopReason && ` · stopped: ${report.stopReason}`}
        </p>
        {report.felt && <p className="mb-2 text-sm italic text-zinc-200">“{report.felt}”</p>}
        <p className="text-sm leading-relaxed text-zinc-300">{report.summary}</p>
        {keep !== null && (
          <p className={cn('mt-3 text-xs font-semibold', keep ? 'text-green-400' : 'text-red-400')}>
            Would keep playing: {keep ? 'yes' : 'no'}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-5 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <List title="Confusions" items={report.confusions} color="text-orange-400" />
        <List title="Bugs" items={report.bugs} color="text-red-400" />
        <List title="Choices" items={report.choices} color="text-blue-400" />
        <List title="Softlocks" items={report.softlocks} color="text-red-400" />
        <List title="Pacing" items={report.pacingIssues} color="text-yellow-400" />
        <List title="Fun highlights" items={report.funHighlights} color="text-green-400" />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        {!showFrames ? (
          <button onClick={() => setShowFrames(true)} className="text-sm font-semibold text-zinc-300 hover:text-zinc-50">
            📸 Show screenshots ({report.steps.length} steps)
          </button>
        ) : isLoading ? (
          <p className="text-xs text-zinc-500">Loading screenshots…</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {report.steps.map((s) => (
                <button
                  key={s.n}
                  onClick={() => setSelected(s.n)}
                  className={cn(
                    'shrink-0 rounded border px-2 py-1 font-mono text-xs',
                    selected === s.n ? 'border-yellow-400/60 text-zinc-100' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300',
                  )}
                >
                  {s.n}
                </button>
              ))}
            </div>
            {step && (
              <div className="flex flex-col gap-2">
                {frame ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:image/jpeg;base64,${frame.jpegBase64}`}
                    alt={`Step ${step.n} screenshot`}
                    className="w-full max-w-xl rounded border border-zinc-800"
                  />
                ) : (
                  <p className="text-xs text-zinc-600">No screenshot saved for this step.</p>
                )}
                <p className="text-xs text-zinc-400">
                  <span className="font-mono text-zinc-500">Step {step.n} · {step.action}</span> — {step.note}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
